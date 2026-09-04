#!/usr/bin/env bash

lane_init() {
	local n="${1:-}"
	if ! [[ "$n" =~ ^[0-9]+$ ]]; then
		printf 'usage: %s <lane-number>\n' "$(basename "$0")" >&2
		exit 2
	fi
	LANE="$n"
	REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
	PROJECT="hanzimind-lane-$LANE"
	LANE_DIR="$REPO/development/lanes/$LANE"
	ENV_FILE="$LANE_DIR/.env.lane"
	PID_FILE="$LANE_DIR/dev.pid"
	LOG_FILE="$LANE_DIR/dev.log"

	if [ -n "${LANE_PORT_BASE:-}" ]; then
		DEV_PORT=$(( LANE_PORT_BASE + LANE ))
	else
		DEV_PORT=$(sed -n 's#^BASE_URL=http://localhost:##p' "$ENV_FILE" 2>/dev/null || true)
		[ -n "$DEV_PORT" ] || DEV_PORT=$(( 3000 + LANE ))
	fi
	POSTGRES_PORT=$(( 15432 + LANE ))
	S3_PORT=$(( 19090 + LANE ))
	MAILPIT_WEB_PORT=$(( 18025 + LANE ))
	MAILPIT_SMTP_PORT=$(( 11025 + LANE ))
	export COMPOSE_PROJECT_NAME="$PROJECT" POSTGRES_PORT S3_PORT MAILPIT_WEB_PORT MAILPIT_SMTP_PORT

	COMPOSE=(docker compose -p "$PROJECT" -f "$REPO/development/docker-compose.yaml")
	PING_URL="http://localhost:$DEV_PORT/api/rpc/ping"
}

lane_ping() {
	[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$PING_URL")" = "200" ]
}

lane_dev_pid() {
	[ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE"
}

lane_running_services() {
	"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -c . || true
}

# </dev/null because `docker compose exec` reads the caller's stdin even with
# -T, which silently ate the rest of any script that called doctor.sh from a
# heredoc. The SQL always arrives through -c, so nothing is piped in here.
lane_psql() {
	"${COMPOSE[@]}" exec -T postgres psql -U postgres -tA -c "$1" </dev/null
}

lane_log_has_git_sha() {
	local lines_before
	lines_before=$(wc -l <"$LOG_FILE" 2>/dev/null || echo 0)
	curl -s -o /dev/null --max-time 5 -X POST "http://localhost:$DEV_PORT/api/rpc/decks/getUserDecks" \
		-H 'content-type: application/json' -d '{"json":{}}'
	sleep 1
	tail -n +"$((lines_before + 1))" "$LOG_FILE" 2>/dev/null | grep -q "$1"
}

# Every reader decides the cache is usable by testing for this one path, so the
# writer moves it in last.
MODEL_CACHE_SENTINEL="onnx/model.onnx"
MODEL_CACHE_SENTINEL_TOP="${MODEL_CACHE_SENTINEL%%/*}"

save_model_cache() {
	local src="$1" dst="$2" staging
	mkdir -p "$(dirname "$dst")"
	staging=$(mktemp -d "$(dirname "$dst")/staging.XXXXXX") || return 1
	# A save killed mid-move leaves $dst without its sentinel. Nothing will ever
	# restore from it, so clear it and let this saver claim the name again.
	if [ -d "$dst" ] && [ ! -e "$dst/$MODEL_CACHE_SENTINEL" ]; then
		mv "$dst" "$staging.stale" 2>/dev/null && rm -rf "$staging.stale"
	fi
	# mkdir is the lock: of two savers racing for one cache, only one creates $dst.
	if ! cp -R "$src"/. "$staging" ||
		[ ! -e "$staging/$MODEL_CACHE_SENTINEL" ] ||
		! mkdir "$dst" 2>/dev/null; then
		rm -rf "$staging"
		return 1
	fi
	find "$staging" -mindepth 1 -maxdepth 1 ! -name "$MODEL_CACHE_SENTINEL_TOP" -exec mv {} "$dst"/ \;
	mv "$staging/$MODEL_CACHE_SENTINEL_TOP" "$dst"/ && rmdir "$staging"
}
