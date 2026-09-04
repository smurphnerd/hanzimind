#!/usr/bin/env bash
# Start verification lane <n>: its own Postgres, s3mock, Mailpit and dev server.
# Usage: lane-up.sh <n>    (LANE_PORT_BASE=4300 moves the dev port range,
#                           LANE_MODE=prod runs next build and next start instead of next dev,
#                           HANZIMIND_LANE_CACHE=<dir> moves the seed cache from ~/.cache/hanzimind-lanes)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lane-lib.sh"
lane_init "${1:-}"
started_at=$(date +%s)
mkdir -p "$LANE_DIR"

port_owner() {
	lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" pid "$2}' || true
}
require_free_port() {
	local owner
	owner="$(port_owner "$1")"
	if [ -n "$owner" ]; then
		printf 'lane %s: port %s (%s) is held by %s\n' "$LANE" "$1" "$2" "$owner" >&2
		exit 1
	fi
}
lane_env() {
	set -a
	# shellcheck disable=SC1090
	. "$ENV_FILE"
	set +a
}
seed_cache_key() {
	(cd "$REPO" &&
		cat src/server/database/schema.ts src/server/database/seed/dictionary.txt \
			src/server/database/seed/graphics.txt src/server/database/seed/vocab-classification.tsv \
			src/server/database/seed/script-classification.tsv src/server/database/seed/seed-dictionary.ts \
			src/server/database/seed/vocab-classification.ts src/server/database/seed/script-classification.ts \
			scripts/seed-hsk1-deck.ts scripts/data/hsk1-vocabulary.txt) |
		shasum -a 256 | cut -c1-16
}
cache_complete() {
	[ -f "$1/vocab_items.sql" ] && [ -f "$1/s3.tar" ]
}

if pid=$(lane_dev_pid); then
	if lane_ping; then
		printf 'ready on %s (already up, pid %s)\n' "$DEV_PORT" "$pid"
		exit 0
	fi
	printf 'lane %s: dev server pid %s is not answering, restarting it\n' "$LANE" "$pid" >&2
	kill "$pid" 2>/dev/null || true
	rm -f "$PID_FILE"
	for _ in $(seq 1 40); do
		[ -z "$(port_owner "$DEV_PORT")" ] && break
		sleep 0.5
	done
fi
require_free_port "$DEV_PORT" "dev server"

running_services=$("${COMPOSE[@]}" ps --status running --services 2>/dev/null || true)
service_is_running() { grep -qx "$1" <<<"$running_services"; }
service_is_running postgres || require_free_port "$POSTGRES_PORT" postgres
service_is_running s3 || require_free_port "$S3_PORT" s3mock
if ! service_is_running mailpit; then
	require_free_port "$MAILPIT_WEB_PORT" "mailpit web"
	require_free_port "$MAILPIT_SMTP_PORT" "mailpit smtp"
fi
"${COMPOSE[@]}" up -d --wait

auth_secret=$(sed -n 's/^AUTH_SECRET=//p' "$ENV_FILE" 2>/dev/null || true)
[ -n "$auth_secret" ] || auth_secret=$(openssl rand -hex 32)
cat >"$ENV_FILE" <<EOF
NODE_ENV=development
LOG_LEVEL=info
GIT_SHA=$(git -C "$REPO" rev-parse HEAD)
BASE_URL=http://localhost:$DEV_PORT
DATABASE_URL=postgres://postgres:postgres@localhost:$POSTGRES_PORT/postgres
S3_OPTIONS='{"credentials":{"accessKeyId":"lane","secretAccessKey":"lane"},"endpoint":"http://localhost:$S3_PORT","region":"local","bucketName":"default-bucket","forcePathStyle":true}'
EMAIL_CONNECTION_URL=smtp://lane:lane@localhost:$MAILPIT_SMTP_PORT
SYSTEM_EMAIL_FROM="HanziMind <no-reply@hanzimind.test>"
AUTH_SECRET=$auth_secret
DEEPL_API_KEY=${DEEPL_API_KEY:-lane-no-deepl}
SEED_TEST_USER=1
EOF

# Adopt, then apply — the same pair docs/remote-setup.md gives for production,
# so every lane boot exercises the documented cutover. A fresh volume has
# nothing to adopt and the second command creates everything. A lane whose
# database was built by the old `drizzle-kit push` has the tables and no
# journal: the first command records the baseline as already applied, and the
# second then has nothing to do instead of failing on a table that exists. A
# lane that is already current gets two no-ops.
(cd "$REPO" && lane_env &&
	pnpm exec tsx src/server/database/migrate.ts --baseline &&
	pnpm exec tsx src/server/database/migrate.ts) >"$LANE_DIR/db-migrate.log" 2>&1 ||
	{
		# Print the log, do not point at it. In CI the lane directory is on a
		# runner nobody can open, so "see development/lanes/0/db-migrate.log"
		# is the entire diagnostic a human gets for a schema that would not
		# build.
		printf 'lane %s: db:migrate failed, last 40 lines of %s:\n' "$LANE" "$LANE_DIR/db-migrate.log" >&2
		tail -n 40 "$LANE_DIR/db-migrate.log" 2>/dev/null | sed 's/^/  /' >&2
		exit 1
	}

cache_key=$(seed_cache_key)
cache_root="${HANZIMIND_LANE_CACHE:-$HOME/.cache/hanzimind-lanes}"
cache_dir="$cache_root/$cache_key"
s3_volume="${PROJECT}_s3_data"
vocab_rows=$(lane_psql 'select count(*) from vocab_items' | tr -d '[:space:]')
if [ "$vocab_rows" = "0" ] && cache_complete "$cache_dir"; then
	"${COMPOSE[@]}" stop s3 >/dev/null 2>&1
	docker run --rm -v "$s3_volume:/data" -v "$cache_dir:/cache:ro" alpine tar xf /cache/s3.tar -C /data
	"${COMPOSE[@]}" up -d --wait s3 >/dev/null 2>&1
	sed "s#localhost:__S3_PORT__/#localhost:$S3_PORT/#g" "$cache_dir/vocab_items.sql" |
		"${COMPOSE[@]}" exec -T postgres psql -U postgres -q -v ON_ERROR_STOP=1 postgres >/dev/null
	printf 'restored seed cache %s\n' "$cache_key"
	build_cache=0
else
	build_cache=$(cache_complete "$cache_dir" && echo 0 || echo 1)
fi

seed_started_at=$(date +%s)
(cd "$REPO" && lane_env && pnpm exec tsx src/server/database/seed/index.ts >"$LANE_DIR/seed.log" 2>&1) ||
	{ printf 'lane %s: seed failed, see %s\n' "$LANE" "$LANE_DIR/seed.log" >&2; exit 1; }
(cd "$REPO" && lane_env && pnpm exec tsx scripts/seed-hsk1-deck.ts >"$LANE_DIR/seed-hsk1.log" 2>&1) ||
	{ printf 'lane %s: HSK 1 deck seed failed, see %s\n' "$LANE" "$LANE_DIR/seed-hsk1.log" >&2; exit 1; }
lane_psql "update decks set created_by_id = (select id from users where email = 'verify@hanzimind.test') where id = 'deck-hsk1'" >/dev/null
printf 'seeded in %ss (dictionary, test users, HSK 1 deck)\n' "$(( $(date +%s) - seed_started_at ))"

model_dir="$REPO/node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2"
model_cache="$cache_root/transformers/Xenova/all-MiniLM-L6-v2"
find "$REPO/node_modules/@huggingface/transformers/.cache" -name '*.tmp.*' -delete 2>/dev/null || true
if [ ! -f "$model_dir/$MODEL_CACHE_SENTINEL" ] && [ -f "$model_cache/$MODEL_CACHE_SENTINEL" ]; then
	mkdir -p "$(dirname "$model_dir")"
	cp -R "$model_cache" "$model_dir"
	printf 'restored the semantic model from %s\n' "$model_cache"
fi
if [ ! -f "$model_dir/$MODEL_CACHE_SENTINEL" ]; then
	model_started_at=$(date +%s)
	(cd "$REPO" && pnpm exec tsx "$REPO/.claude/skills/verify-hanzimind/scripts/prefetch-model.ts") ||
		{ printf 'lane %s: semantic model download failed\n' "$LANE" >&2; exit 1; }
	printf 'downloaded the semantic model in %ss\n' "$(( $(date +%s) - model_started_at ))"
fi
if [ ! -f "$model_cache/$MODEL_CACHE_SENTINEL" ] && save_model_cache "$model_dir" "$model_cache"; then
	printf 'saved the semantic model to %s\n' "$model_cache"
fi

if [ "$build_cache" = "1" ]; then
	mkdir -p "$cache_root"
	staging=$(mktemp -d "$cache_root/staging.XXXXXX")
	"${COMPOSE[@]}" exec -T postgres pg_dump -U postgres --data-only --table vocab_items postgres |
		sed "s#localhost:$S3_PORT/#localhost:__S3_PORT__/#g" >"$staging/vocab_items.sql"
	docker run --rm -v "$s3_volume:/data:ro" -v "$staging:/out" alpine tar cf /out/s3.tar -C /data .
	if [ ! -e "$cache_dir" ] && mv "$staging" "$cache_dir" 2>/dev/null; then
		printf 'saved seed cache %s\n' "$cache_key"
	else
		rm -rf "$staging"
	fi
fi

if [ "${LANE_MODE:-dev}" = "prod" ]; then
	build_started_at=$(date +%s)
	(cd "$REPO" && lane_env && NODE_ENV=production node_modules/.bin/next build >"$LANE_DIR/build.log" 2>&1) ||
		{ printf 'lane %s: next build failed, see %s\n' "$LANE" "$LANE_DIR/build.log" >&2; exit 1; }
	printf 'built in %ss\n' "$(( $(date +%s) - build_started_at ))"
	(cd "$REPO" && lane_env && NODE_ENV=production exec nohup node_modules/.bin/next start -p "$DEV_PORT" >"$LOG_FILE" 2>&1) &
else
	(cd "$REPO" && lane_env && exec nohup node_modules/.bin/next dev -p "$DEV_PORT" >"$LOG_FILE" 2>&1) &
fi
echo $! >"$PID_FILE"

for _ in $(seq 1 240); do
	if lane_ping; then
		printf 'ready on %s\n' "$DEV_PORT"
		printf 'mailpit http://localhost:%s  postgres localhost:%s  s3 http://localhost:%s  log %s  total %ss\n' \
			"$MAILPIT_WEB_PORT" "$POSTGRES_PORT" "$S3_PORT" "$LOG_FILE" "$(( $(date +%s) - started_at ))"
		exit 0
	fi
	if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
		printf 'lane %s: dev server exited, see %s\n' "$LANE" "$LOG_FILE" >&2
		exit 1
	fi
	sleep 1
done
printf 'lane %s: dev server did not answer %s within 240s, see %s\n' "$LANE" "$PING_URL" "$LOG_FILE" >&2
exit 1
