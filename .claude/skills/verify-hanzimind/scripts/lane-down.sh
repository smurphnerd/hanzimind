#!/usr/bin/env bash
# Stop verification lane <n>: the dev server lane-up.sh started (by pid file) and
# compose project hanzimind-lane-<n> with its volumes. Evidence is never touched.
# Usage: lane-down.sh <n>
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lane-lib.sh"
lane_init "${1:-}"

descendants() {
	local child
	pgrep -P "$1" 2>/dev/null | while read -r child; do
		descendants "$child"
		printf '%s\n' "$child"
	done
}

if [ -f "$PID_FILE" ]; then
	pid=$(cat "$PID_FILE")
	if kill -0 "$pid" 2>/dev/null; then
		tree=("$pid")
		while read -r child; do tree+=("$child"); done < <(descendants "$pid")
		kill "${tree[@]}" 2>/dev/null || true
		for _ in $(seq 1 20); do
			kill -0 "$pid" 2>/dev/null || break
			sleep 0.5
		done
		kill -9 "${tree[@]}" 2>/dev/null || true
		printf 'lane %s: stopped dev server pid %s\n' "$LANE" "$pid"
	else
		printf 'lane %s: dev server pid %s was already gone\n' "$LANE" "$pid"
	fi
	rm -f "$PID_FILE"
else
	printf 'lane %s: no dev server pid file\n' "$LANE"
fi

holder=$(lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" pid "$2}' || true)
if [ -n "$holder" ]; then
	printf 'lane %s: port %s is still held by %s, which this lane did not start\n' "$LANE" "$DEV_PORT" "$holder" >&2
fi

"${COMPOSE[@]}" down -v --remove-orphans
printf 'lane %s down\n' "$LANE"
