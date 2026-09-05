#!/usr/bin/env bash
# Playwright treats its webServer command exiting as the server dying, so stay
# attached after lane-up.sh backgrounds the dev server.
set -euo pipefail
lane="${E2E_LANE:-0}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$root/.claude/skills/verify-hanzimind/scripts/lane-up.sh" "$lane"
exec tail -n 0 -f "$root/development/lanes/$lane/dev.log"
