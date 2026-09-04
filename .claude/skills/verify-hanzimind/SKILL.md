---
name: verify-hanzimind
description: "Launch, drive and prove HanziMind, the Next.js Chinese learning app, through its web UI at pnpm dev and its oRPC API at /api/rpc. Use it to verify a PR live in an isolated lane (own Postgres, s3mock, Mailpit, dev server), to reproduce a bug, or to collect screenshot and API evidence for a hygiene-plan verdict."
---

# Verify HanziMind

One lane is one complete copy of the app: a compose project `hanzimind-lane-<n>` with Postgres, s3mock and Mailpit, a seeded database with two known accounts, and a `next dev` server on its own port. Lanes share nothing, so several can run on one machine. Every command below takes the lane number `<n>` and runs from the repo root.

Read `features/README.md` before driving anything. It holds the accounts, the harness conventions and the feature index.

## Launch

```sh
.claude/skills/verify-hanzimind/scripts/lane-up.sh 3
```

What it does, in order. Refuses if any of the lane's five ports is held by another process and names the holder. Starts compose project `hanzimind-lane-3` with `development/docker-compose.yaml` on the lane's ports. Writes `development/lanes/3/.env.lane`. Creates the schema by running `migrate.ts --baseline` and then `migrate.ts`, the same pair `docs/remote-setup.md` gives for the production cutover, logged to `db-migrate.log`: a fresh lane has nothing to adopt and the second command applies `drizzle/`, while a lane whose database was built by the old `drizzle-kit push` is recorded as already holding the baseline instead of failing on tables it has. Seeds the database with `SEED_TEST_USER=1`, then runs `scripts/seed-hsk1-deck.ts` and hands the `HSK 1` deck (`deck-hsk1`, 150 words plus their parts) to the learner account, so a fresh lane has one public deck to browse, save and study. Starts `next dev -p 3003` in the background with its pid in `development/lanes/3/dev.pid` and its output in `development/lanes/3/dev.log`. Prints `ready on 3003` once `POST /api/rpc/ping` answers 200, then one line with the Mailpit, Postgres and s3mock addresses and the elapsed seconds.

Production mode. `LANE_MODE=prod lane-up.sh 3` runs `next build` (about a minute, log in `development/lanes/3/build.log`) and `next start -p 3003` with `NODE_ENV=production`, instead of `next dev`. Use it for anything the dev server would mask: dev mode injects its own inline scripts and `eval`, so a CSP that is clean in production shows violations in dev and the other way round. The seed still runs under `NODE_ENV=development` from `.env.lane`. Everything else, `doctor.sh`, `lane-down.sh`, the ports, the cache and Playwright (`LANE_MODE=prod E2E_LANE=3 pnpm test-e2e` boots a production lane), is the same. One production lane per checkout: the build writes the worktree's own `.next/`, so a second production lane in the same worktree overwrites the first one's build. Run each from its own worktree, as with `next dev`.

Ports for lane `<n>`:

| Service | Port | Env var in `.env.lane` |
| --- | --- | --- |
| dev server | `LANE_PORT_BASE + n`, default `3000 + n` | `BASE_URL` |
| Postgres | `15432 + n` | `DATABASE_URL` |
| s3mock | `19090 + n` | `S3_OPTIONS.endpoint` |
| Mailpit SMTP | `11025 + n` | `EMAIL_CONNECTION_URL` |
| Mailpit web UI | `18025 + n` | printed on ready |

Set `LANE_PORT_BASE` when `3000 + n` is taken by something else on the machine (`LANE_PORT_BASE=4300 lane-up.sh 1` serves on 4301). `doctor.sh`, `lane-down.sh` and `playwright.config.ts` read the port back from the lane's `.env.lane`, so the export is needed only for `lane-up.sh`; an explicit export still wins. The container ports never sit on 5432, 9090, 8025 or 1025, so a developer's own `pnpm dev-containers` and a lane coexist.

Environment. The app reads env through `src/env.ts`. A lane never uses Doppler. Every lane command loads `development/lanes/<n>/.env.lane` by sourcing it with `set -a`, which is the one mechanism this skill uses for `tsx` and `next` alike. To run any other script against a lane:

```sh
set -a; . development/lanes/3/.env.lane; set +a
pnpm exec tsx scripts/backfill-classification.ts --dry-run
```

`DEEPL_API_KEY` is a placeholder unless the variable is set in the shell that runs `lane-up.sh`. Deck creation from dictionary characters works without it. Adding an unknown compound or sentence to a deck calls DeepL and fails with the placeholder.

Seed time. The seed fetches audio for every dictionary entry from Google TTS, about six minutes for 9,574 dictionary entries plus the 68 HSK 1 words the deck seed adds, 9,642 `vocab_items` rows in all. The first `lane-up.sh` on a machine pays that once and saves the `vocab_items` rows and the s3mock objects under `~/.cache/hanzimind-lanes/<key>` (override the root with `HANZIMIND_LANE_CACHE`), where `<key>` hashes the seed inputs (`schema.ts`, `dictionary.txt`, `graphics.txt`, the two classification TSVs and their loaders, `scripts/seed-hsk1-deck.ts` and `scripts/data/hsk1-vocabulary.txt`), so a schema change, a dictionary edit or an HSK list edit forces one full seed. Every later lane, in any checkout, restores the cache and is ready in about 20 seconds. The same first lane also downloads the 90 MB semantic model that grades understanding answers (`Xenova/all-MiniLM-L6-v2`, about 90 s on a home connection, 2 s on a GitHub runner) into `node_modules/@huggingface/transformers/.cache` and saves a copy under `~/.cache/hanzimind-lanes/transformers`; a lane in a new worktree copies it from there. `scripts/prefetch-model.ts` does the download and prints progress. Delete the cache directory to force a full seed. `lane-up.sh` is safe to rerun: a lane that is already answering prints `ready on <port> (already up)` and exits 0, a dead dev server is restarted once its port is released, a compose project that is partly up is reconciled, and `AUTH_SECRET` is read back from the existing `.env.lane`, so sessions signed in before a restart stay valid. Every other line of `.env.lane` is rewritten on each run, so a hand edit there lasts until the next `lane-up.sh`; put a lasting change in the script. `lane-down.sh` keeps the file, so a lane also keeps its dev port across a down and up: a lane once started with `LANE_PORT_BASE=4300` answers on `4300 + n` until `development/lanes/<n>/.env.lane` is deleted or `LANE_PORT_BASE` is set again.

One lane per checkout. `next dev` holds `.next/dev/lock` in the project directory, so a second lane in the same worktree fails with `Unable to acquire lock`. Run each lane from its own worktree, which is how the swarm boots anyway. Starting a second lane means a second number, never the same one twice.

## Doctor

```sh
.claude/skills/verify-hanzimind/scripts/doctor.sh 3
```

Read-only. Refuses with exit 3 before any check when the lane's `DATABASE_URL` host is not `localhost` or `127.0.0.1`, so a lane can never drive a shared database. Then prints one line per check and exits 1 if any is `not ok`:

```
ok      compose project hanzimind-lane-3 is up (postgres, s3, mailpit)
ok      POST http://localhost:3003/api/rpc/ping answers 200
ok      vocab_items has 9642 rows
ok      running GIT_SHA 0fafff91e811 matches git rev-parse HEAD
```

The last check reads the SHA from the running process, not from the env file or an old log. It runs only when the ping passed, notes the length of `dev.log`, calls an auth procedure without a session so the server writes a fresh `UNAUTHORIZED` line, and looks for the SHA in the lines added after that point. Every log line carries the `GIT_SHA` the process started with, so a lane started on an older checkout fails this check until it is restarted, and a stopped lane reports `no running server to read GIT_SHA from`. Run doctor first whenever anything looks off. Every lane script is safe to call from a script that is itself fed on stdin: `lane_psql` redirects the `docker compose exec` it runs from `/dev/null`, because compose reads the caller's stdin even with `-T` and used to swallow every line after a `doctor.sh` call in a heredoc.

## Drive

Browser. Use the `claude-in-chrome` skill. Open a tab per lane with `tabs_create_mcp`, then `navigate` to `http://localhost:<port>/...`. Locate elements with `find` or `read_page` (filter `interactive`), act with `computer` (`left_click` with a `ref`, `type`, `key`) and `form_input`, and read state with `get_page_text`. Each feature file under `features/` pairs a user action with the exact call and the observable result.

Sign in through the browser at `/signin` with `verify@hanzimind.test` and `verify-hanzimind` (`features/sign-in.md`). The admin account is `verify-admin@hanzimind.test` with the same password.

Harness gotchas, each of which cost a worker a lane:

- Drive at exactly `http://localhost:<port>`, never a `<name>.localhost` alias or `127.0.0.1`. The RPC client posts to the absolute `BASE_URL` origin and the CSP `connect-src` blocks a cross-origin call. The symptom is `Failed to fetch` on every query.
- A `left_click` by `ref` is often dropped on this app, after `form_input` and on plain links alike (the header `Study` link, `Create Deck`, a decomposition part tile, `Sign out`). After any click, verify by URL or page text. If nothing changed, re-run `find` and click the fresh ref, or click by coordinate from a fresh screenshot.
- `get_page_text` returns `<main>` only. Toasts, the header and dialogs are outside it, so prove a toast with a screenshot taken right after the click, and prove header state with `read_page`.
- A successful sign-in is a full page load. Wait for the `Welcome back!` heading before reading the header.
- Keep the tab wider than 640px, or the header nav collapses and `read_page` will not list `Study`, `Decks`, `Dictionary`.

Headless. Only one worker at a time can drive `claude-in-chrome`, because every worker shares one extension tab group. Every other browser lane drives headless Chromium through Playwright, which the repo ships as its e2e suite:

```sh
LANE_PORT_BASE=4300 E2E_LANE=9 pnpm test-e2e
LANE_PORT_BASE=4300 E2E_LANE=9 pnpm exec playwright test -g dictionary
E2E_BASE_URL=http://localhost:4309 pnpm exec playwright test e2e/my-lane.adhoc.spec.ts
```

`playwright.config.ts` boots the lane itself through `e2e/lane.sh` (`lane-up.sh $E2E_LANE`, then a `tail -f` of the dev log so Playwright has a process to hold) and waits three minutes for it; a cold seed takes six, so set `E2E_COLD=1` or boot the lane with `lane-up.sh` first. It reuses a server that already answers only when `E2E_LANE` or `E2E_BASE_URL` names it; with neither set it boots lane 0, and if something else, such as a developer's own `pnpm dev`, holds port 3000, Playwright stops with `is already used` before anything runs, so the suite never mutates a database it was not pointed at. When Playwright boots the lane itself it stops that dev server when the run ends, as it does with any `webServer`; the lane's containers stay up until `lane-down.sh`. `E2E_BASE_URL` points the suite at any server. The three committed specs under `e2e/` are the recipes for sign-in, one study card and dictionary search; `e2e/fixtures.ts` gives an ad-hoc spec `rpc` (one procedure call with `{"json": input}` on the test's `request` context, which carries the session when the spec uses `storageState`) and `explainSignInFailure` (tells a missing seed from the rate limit). To drive a feature headless, write a throwaway spec beside them, locate by role and label the way the feature file names the handle, and save proof with `page.screenshot({ path: "<evidence dir>/<slug>.png" })`. A failed spec keeps a trace under `test-results/playwright/`; open it with `pnpm exec playwright show-trace <trace.zip>`. Playwright waits for the element, so the dropped-click and toast gotchas above are handled by `expect(...).toBeVisible()` and `getByText`, but press `Enter` in the answer field rather than clicking `Check`. The auth layer allows three sign-ins per ten seconds per address and answers 429 after that, so the suite signs in once: the `sign-in` project saves its session and the `signed-in` and `adhoc` projects reuse it. Name an ad-hoc spec `<slug>.adhoc.spec.ts` and it runs signed in as the learner after the `sign-in` project, in the same run; Playwright clears `test-results/playwright/` at the start of every run, so the saved session never outlives the run that made it. The `sign-in` project also grades one throwaway understanding answer, which loads the five-second semantic model before any spec waits on a result card. Space repeated suite runs ten seconds apart. `E2E_AUDIO=0` relaxes the one assertion that needs audio objects (the enabled play button on the 人 row), which is how CI runs, where the seed fetches no audio.

API. Sign in once and keep the cookie jar, then call procedures by path. Every recipe uses `jar.txt` for the learner and `admin-jar.txt` for the admin, in the current directory. Every procedure is `POST`, the body is `{"json": <input>}`, and the response is `{"json": <output>}` with an error object and a 4xx status on failure.

```sh
curl -s -c jar.txt -H 'content-type: application/json' \
  -d '{"email":"verify@hanzimind.test","password":"verify-hanzimind"}' \
  http://localhost:3003/api/auth/sign-in/email

curl -s -b jar.txt -H 'content-type: application/json' \
  -d '{"json":{"query":"人","searchLanguage":"chinese","page":1,"pageSize":20}}' \
  http://localhost:3003/api/rpc/vocab/search
```

Procedure paths are `<router>/<procedure>` from `src/server/endpoints/router.ts`: `ping`, `vocab/*`, `decks/*`, `study/*`, `suggestions/*`, `admin/*`. Unauthenticated calls to an auth procedure return `{"json":{"code":"UNAUTHORIZED",...}}` with 401. A non-admin calling `admin/*` gets `FORBIDDEN` with 403.

Read-only diagnostics. The dev server log at `development/lanes/<n>/dev.log`. The browser console through `read_console_messages`. Mailpit's inbox at `http://localhost:<18025 + n>`. The database through the lane's own container, since `psql` is not installed on the host:

```sh
docker compose -p hanzimind-lane-3 -f development/docker-compose.yaml exec -T postgres \
  psql -U postgres -c "select user_id, deck_id from user_decks"
```

Column names are snake_case (`vocab_item`, `deck_name`, `user_id`).

Perf. `perf-probe.mjs` signs in as the learner and times one procedure:

```sh
.claude/skills/verify-hanzimind/scripts/perf-probe.mjs --port 3003 --rpc vocab/search \
  --body '{"query":"人","searchLanguage":"chinese","page":1,"pageSize":20}' --n 30
```

It prints the status counts, then `p50 <ms> ms` and `p95 <ms> ms` as integers, and exits 1 if any call was not 2xx. `--email` and `--password` switch the account. Run it twice and keep the second run; the first request after a code change pays the dev server's compile.

## Evidence

Root: `/Users/smurphnerd/projects/hanzimind-evidence/`. A swarm lane writes to `swarm-<pr-id>/worker-<n>/<slug>.png`; an owner's self-proof writes to `owner-<pr-id>/<slug>.png`. Screenshots come from `computer screenshot save_to_disk=true`, which returns a path to copy into the evidence directory. Save API proofs as the `curl` command, the response body and the status in a `.txt` beside the screenshots.

Proof standards. Drive the real user path, never an internal setter or a test-only endpoint. Capture the action and the resulting state, not only the final screen. Check side effects with a second, read-only view: a `psql` row for a mutation, a Mailpit message for an email, an s3mock object for audio. A toast disappears in seconds and sits outside `<main>`, so prove it with a screenshot or `find "toast"` right after the click, never with `get_page_text`. `lane-up.sh` seeds `HSK 1` (`deck-hsk1`) for the learner, unsaved; a recipe that needs a second deck starts from `features/deck-create.md`.

## Cleanup

```sh
.claude/skills/verify-hanzimind/scripts/lane-down.sh 3
```

Kills the dev server named in `development/lanes/3/dev.pid` and its children, nothing else. If the lane's port is still held afterwards by a process this lane did not start, it says so and leaves that process alone. Then runs `docker compose -p hanzimind-lane-3 down -v`, which removes the lane's containers, network and volumes. The lane's `.env.lane` and logs stay in `development/lanes/3/` for reading. Nothing under the evidence root is touched. Run it after every lane, including failed attempts.

Before committing from a checkout that ran a lane, check `git status`. Next 16.3.4 and later write a `nextjs-agent-rules` block into `CLAUDE.md` when `next dev` detects an agent. That block is not part of any PR; restore the file with `git checkout CLAUDE.md`.

## Helpers

All under `.claude/skills/verify-hanzimind/scripts/`. The four commands are executable. `lane-lib.sh` is mode 644 because it is sourced, never run.

| Script | Invocation | Purpose |
| --- | --- | --- |
| `lane-up.sh` | `lane-up.sh <n>` | Start lane `<n>` and print `ready on <port>`. `LANE_PORT_BASE` moves the dev port, `LANE_MODE=prod` builds and starts a production server. `DEEPL_API_KEY` in the shell is passed through. |
| `doctor.sh` | `doctor.sh <n>` | Four read-only checks, exit 0 only when all print `ok`. Exit 3 on a non-local database. |
| `lane-down.sh` | `lane-down.sh <n>` | Stop the dev server by pid file and remove the compose project with its volumes. |
| `perf-probe.mjs` | `perf-probe.mjs --port <p> --rpc <router/procedure> --body <json> --n <count>` | Sign in and print p50 and p95 in ms for one procedure. |
| `e2e/lane.sh` (repo root) | Playwright `webServer` command, `E2E_LANE=<n>` | `lane-up.sh <n>` then `tail -f` its dev log. |
| `prefetch-model.ts` | `pnpm exec tsx .claude/skills/verify-hanzimind/scripts/prefetch-model.ts` | Download the semantic model into the app's cache; `lane-up.sh` runs it when the model is missing. |
| `lane-lib.sh` | sourced by the three shell scripts | Port arithmetic and paths. Not a command. |

Keep the feature map honest with `/maintain-verification-skill` when routes or components change.
