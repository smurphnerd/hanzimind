#!/usr/bin/env bash
# Read-only health check for verification lane <n>. Prints one line per check
# and exits non-zero when any check is not ok.
# Usage: doctor.sh <n>
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lane-lib.sh"
lane_init "${1:-}"

if [ ! -f "$ENV_FILE" ]; then
	printf 'lane %s has no %s, run lane-up.sh %s first\n' "$LANE" "$ENV_FILE" "$LANE" >&2
	exit 2
fi
database_url=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE")
database_host=$(printf '%s' "$database_url" | sed -E 's#^[a-z]+://([^@]*@)?([^:/]+).*#\2#')
case "$database_host" in
localhost | 127.0.0.1) ;;
*)
	printf 'refusing: DATABASE_URL host is %s, not localhost. A lane must never drive a shared database.\n' "$database_host" >&2
	exit 3
	;;
esac

failed=0
ok() { printf 'ok      %s\n' "$1"; }
not_ok() { printf 'not ok  %s\n' "$1"; failed=1; }

services=$(lane_running_services)
if [ "$services" = "3" ]; then
	ok "compose project $PROJECT is up (postgres, s3, mailpit)"
else
	not_ok "compose project $PROJECT has $services of 3 services running"
fi

if lane_ping; then
	ok "POST $PING_URL answers 200"
	server_up=1
else
	not_ok "POST $PING_URL does not answer 200"
	server_up=0
fi

count=$(lane_psql 'select count(*) from vocab_items' 2>/dev/null | tr -d '[:space:]')
if [ -n "$count" ] && [ "$count" -gt 9000 ] 2>/dev/null; then
	ok "vocab_items has $count rows"
else
	not_ok "vocab_items has ${count:-no} rows, expected more than 9000"
fi

head_sha=$(git -C "$REPO" rev-parse HEAD)
if [ "$server_up" = "0" ]; then
	not_ok "no running server to read GIT_SHA from"
elif lane_log_has_git_sha "$head_sha"; then
	ok "running GIT_SHA ${head_sha:0:12} matches git rev-parse HEAD"
else
	not_ok "running GIT_SHA does not match HEAD ${head_sha:0:12}; restart the lane on the current checkout"
fi

exit "$failed"
