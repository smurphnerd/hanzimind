# HanziMind hygiene plan

Six phases take HanziMind from "close to production ready" to shipped, for the learners who will use it and for the next engineer who maintains it. The program adds a safety net first, deletes dead weight second, hunts bugs third, deepens modules fourth, hardens production fifth, and audits the UI and docs last. The rule the program enforces is that no PR lands without unit, live, and perf evidence at its head SHA. The survey that grounds every section is `docs/hygiene-survey.md`. PR ids in order. P0-CI, P0-VERIFY, P0-E2E, P0-SEC, P1-DEPS, P1-DEAD, P2-HUNT, P2-STUDY, P2-API, P2-CLIENT, P2-FOUND, P3-RULES, P3-STUDY-SVC, P3-DECKS, P3-SESSION, P3-SHARED-UI, P3-SHADCN, P4-MIGRATE, P4-INDEX, P4-PROGRESS, P4-HEADERS, P4-AUTH, P4-OBS, P4-UPGRADE, P5-AUDIT, P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-A11Y, P5-PERF, P6-DOCS, P6-LEGAL.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-full.md` under the installed plugin. Trunk for the program is the `hygiene` integration branch, not `main`, because Vercel deploys `main`. Owners merge their own PRs into `hygiene` on a clean verdict. The operator merges `hygiene` into `main` once per phase, after the phase's last PR lands. P4-MIGRATE, P4-INDEX, P4-PROGRESS, P4-AUTH, P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-A11Y and P6-LEGAL are the operator's items that stop at merge-ready.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write the program objective into the standing orders and your todolist with this exact text. "Run docs/hygiene-plan.md. PR order P0-CI, P0-VERIFY, P0-E2E, P0-SEC, P1-DEPS, P1-DEAD, P2-HUNT, P2-STUDY, P2-API, P2-CLIENT, P2-FOUND, P3-RULES, P3-STUDY-SVC, P3-DECKS, P3-SESSION, P3-SHARED-UI, P3-SHADCN, P4-MIGRATE, P4-INDEX, P4-PROGRESS, P4-HEADERS, P4-AUTH, P4-OBS, P4-UPGRADE, P5-AUDIT, P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-A11Y, P5-PERF, P6-DOCS, P6-LEGAL. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Owners merge into hygiene on a clean verdict. The operator merges hygiene into main per phase and reviews the review-gated PRs in chat. Done when every PR is merged into hygiene, every phase is merged into main, and the close-the-program boxes are checked."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-full.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-hanzimind/SKILL.md` in the repo, once P0-VERIFY lands. Before that, Claude Code's `run` skill plus the `claude-in-chrome` skill.
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/create-verification-skill/SKILL.md`
  - [ ] `skills/deslop/SKILL.md`
  - [ ] `skills/no-comments/SKILL.md`
  - [ ] `skills/unslop/SKILL.md`
  - [ ] `skills/show-me-your-work/SKILL.md`
  - [ ] `skills/blast-radius/SKILL.md`
  - [ ] `skills/technical-writing/SKILL.md`
  - [ ] The `mattpocock-skills:codebase-design` skill, for every P3 PR.
- [ ] Arm the 30-minute audit tick as a real cadence. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing orders. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a lane only on affirmative failure evidence, and dispatch its replacement in the same tick. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] P0-CI and P0-VERIFY are independent and first. Both branch from `hygiene`.
  - [ ] P0-E2E after P0-CI and P0-VERIFY.
  - [ ] P0-SEC after P0-CI.
  - [ ] P1-DEPS after P0-SEC. P1-DEAD after P1-DEPS.
  - [ ] P2-HUNT after P0-E2E and P1-DEAD. P2-STUDY, P2-API and P2-CLIENT after P2-HUNT, in parallel. P2-FOUND after those three.
  - [ ] P3-RULES after P2-FOUND. P3-STUDY-SVC after P3-RULES. P3-DECKS after P2-API. P3-SESSION after P2-STUDY and P3-RULES. P3-SHARED-UI after P2-CLIENT. P3-SHADCN after P3-SHARED-UI.
  - [ ] P4-MIGRATE after P3-STUDY-SVC and P3-DECKS. P4-INDEX after P4-MIGRATE. P4-PROGRESS after P4-INDEX and P3-SESSION. P4-HEADERS after P0-E2E. P4-AUTH after P4-HEADERS. P4-OBS after P3-DECKS. P4-UPGRADE after P4-OBS.
  - [ ] P5-AUDIT after P3-SHADCN and P4-PROGRESS. P5-SHELL, P5-STUDY-UX, P5-STATES, P5-HOME and P5-PERF after P5-AUDIT, in parallel. P5-FORMS after P5-AUDIT and P4-AUTH. P5-A11Y after every other P5 PR.
  - [ ] P6-DOCS after P5-A11Y. P6-LEGAL after P5-SHELL.
- [ ] Hold the file boundaries. P0-CI touches only `.github/**`, `package.json`, `pnpm-lock.yaml`, `.nvmrc`. P0-VERIFY touches only `.claude/skills/verify-hanzimind/**` and `development/**`. P0-E2E touches only `e2e/**`, `playwright.config.ts`, `.github/**`, `package.json`, `pnpm-lock.yaml`. P3-RULES touches only `src/server/study-rules.ts`, `src/server/study-scheduling.ts`, `src/server/services/StudyService.ts`, `src/server/constants.ts` and their tests. P3-SESSION touches only `src/app/study/**`, `src/components/study/**`, `src/lib/study-session.ts` and its test. P4-MIGRATE, P4-INDEX and P4-PROGRESS are the only PRs that touch `src/server/database/schema.ts` or `drizzle/**`. P5 PRs never touch `src/server/**` except P5-HOME and P5-STATES, which may add read procedures. P6-DOCS touches only `*.md`, `docs/**`, `.env.example`, `AGENTS.md`.
- [ ] Hold the review gate. P4-MIGRATE, P4-INDEX, P4-PROGRESS and P4-AUTH change production data or credentials. P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-A11Y and P6-LEGAL change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Open the PR ready, never draft, with `gh pr create` and `draft: false`, or with Graphite `gt` for a stack.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `skills/poteto-mode/references/bugbot-triage.md` under the installed plugin.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] On a clean verdict the owner squash-merges its own PR into `hygiene` with `gh pr merge --squash`. Before merging, compare `git patch-id` of the verdict SHA against the head after the final rebase. A changed patch-id voids the verdict and the head goes back through the swarm. The operator merges `hygiene` into `main` per phase.

### Boot recipe, for every live lane

Each live lane is one `swarm workers` lane at the PR head, resolved through provider dispatch, in its own worktree or output directory, with its own receipt. Drive the surface only through the driver skill this plan names.

This machine's Docker VM has 3.8 GiB, and P0-VERIFY measured that it holds about three lanes at once. Run at most three lanes concurrently. Only one worker at a time drives the `claude-in-chrome` skill, because concurrent workers share one extension tab group and evict each other's tabs; the other browser lanes drive headless through the Playwright path P0-E2E adds to the skill. A swarm worker therefore drives several of a PR's ten live boxes serially inside one lane, and the ten boxes are split across three workers. The first lane on a fresh machine pays a six minute seed once; every later lane restores the seed cache in about 20 seconds.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>` in the lane's worktree.
- [ ] Start the lane's own Postgres, s3mock and Mailpit with the compose project name and port offset that `.claude/skills/verify-hanzimind/SKILL.md` assigns per lane. Run `pnpm db:push` and `pnpm db:seed` against that database with the lane's `.env.lane` file, then `pnpm dev` on the lane's port. Ready when `GET /api/rpc/ping` answers 200. Before P0-VERIFY lands, follow the same recipe by hand from `development/docker-compose.yaml` and README.md.
- [ ] Deliver input only through the verification skill's drive commands, which use the `claude-in-chrome` skill for the browser and `curl` against `/api/rpc` for the API. Read-only diagnostics are the dev server log, the browser console, Mailpit's inbox at the lane's Mailpit port, and `psql` against the lane's database.
- [ ] Save every screenshot to `/Users/smurphnerd/projects/hanzimind-evidence/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the receipt path.

## Add CI gates (P0-CI)

**Depends on.** None.

**Files.**

- [ ] Create `.github/workflows/ci.yml`.
- [ ] Create `.nvmrc`.
- [ ] Edit `package.json`.

**Build.**

- [ ] Add `packageManager` and `engines.node` to `package.json`, matching the pnpm and Node the lockfile was made with.
- [ ] Add a `format:check` script running `prettier --check .` and a `test:ci` script running `vitest run` without the Doppler wrapper.
- [ ] Write `ci.yml` with one job per gate on push and pull request. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:ci`, and `next build` with the env stub the `envSchema` in `src/env-utils.ts` requires, `GIT_SHA` set from `github.sha`.
- [ ] Require the four jobs as branch protection on `hygiene` and `main` with `gh api`.

**You see.**

- [ ] A PR against `hygiene` shows four green checks named lint, typecheck, format, test, and one named build.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No new test file. The gate is the workflow itself. Run `pnpm test:ci` locally and confirm the junit file lands at `test-results/vitest/junit.xml`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Push a commit with a lint error that eslint rates as an error, such as an explicit any, to a throwaway branch and open a PR. Save `ci-lint-red.png`. Pass when the lint check is red and the others are unaffected.
- [ ] Lane 2. Push a commit with a type error. Save `ci-typecheck-red.png`. Pass when typecheck is red, build is red because `next build` type-checks too, and lint, format and test are green.
- [ ] Lane 3. Push an unformatted file. Save `ci-format-red.png`. Pass when only format is red.
- [ ] Lane 4. Push a failing vitest assertion. Save `ci-test-red.png`. Pass when only test is red and the junit artifact is attached.
- [ ] Lane 5. Push the head SHA unchanged. Save `ci-all-green.png`. Pass when all five checks are green within 10 minutes.
- [ ] Lane 6. Attempt `gh pr merge` on a PR with a red check. Save `ci-protected.png`. Pass when GitHub refuses the merge.
- [ ] Lane 7. Run `pnpm build` locally with the same env stub the workflow uses. Save `ci-local-build.png`. Pass when the build completes and prints the route table.
- [ ] Lane 8. Run `pnpm install --frozen-lockfile` on a clean clone with the Node in `.nvmrc`. Save `ci-frozen-install.png`. Pass when install succeeds with no lockfile change.
- [ ] Lane 9. Run `pnpm dev` after the change and load `/`. Save `ci-app-still-boots.png`. Pass when the landing page renders.
- [ ] Lane 10. Open the workflow file and count jobs. Save `ci-jobs-listed.png`. Pass when the Actions tab lists exactly the five jobs.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall-clock seconds of the CI run from queue to all green.
- [ ] Probe. Read the run duration from `gh run view --json` at trunk and at the head, three runs each, interleaved.
- [ ] Baseline. Record the trunk value first. There is no trunk workflow, so the baseline is the sum of local `pnpm lint`, `pnpm typecheck`, `pnpm test:ci` and `pnpm build` wall-clock seconds.
- [ ] Rule. Head fails when the CI run exceeds 5 minutes. The 2 times local baseline rule was withdrawn after the owner measured 15 seconds of runner boot per job and a 35 second build on the two-core runner.

**Review gate.** None. P0-CI is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Create the verification skill (P0-VERIFY)

**Depends on.** None.

**Files.**

- [ ] Create `.claude/skills/verify-hanzimind/SKILL.md`.
- [ ] Create `.claude/skills/verify-hanzimind/features/README.md` and one file per feature. `sign-in.md`, `study-session.md`, `dictionary.md`, `deck-browse-and-save.md`, `deck-create.md`, `memory-aids.md`, `admin-vocab.md`, `admin-suggestions.md`, `profile-and-signout.md`.
- [ ] Create `.claude/skills/verify-hanzimind/scripts/lane-up.sh`, `lane-down.sh`, `doctor.sh`, `perf-probe.mjs`.
- [ ] Edit `development/docker-compose.yaml` to accept a compose project name and port offsets from env.

**Build.**

- [ ] Run `/create-verification-skill` and follow its five steps. Surface is the web UI at `pnpm dev` and the RPC API at `/api/rpc`.
- [ ] `lane-up.sh <n>` starts a compose project `hanzimind-lane-<n>` with Postgres, s3mock and Mailpit on ports offset by `<n>`, writes `.env.lane` with `DATABASE_URL`, `S3_OPTIONS`, `EMAIL_CONNECTION_URL`, `BASE_URL` for that lane, runs `db:push` and `db:seed` with `tsx --env-file=.env.lane`, and starts `next dev -p <port>` without Doppler. Prints the port on ready.
- [ ] `doctor.sh <n>` is read-only. Checks the compose project is up, `GET /api/rpc/ping` on the lane port answers 200, the database has more than 9000 `vocab_items`, and the running `GIT_SHA` matches `git rev-parse HEAD`.
- [ ] `lane-down.sh <n>` stops only compose project `hanzimind-lane-<n>` and the dev server it started, by pid file. Evidence under `/Users/smurphnerd/projects/hanzimind-evidence/` survives.
- [ ] `perf-probe.mjs --port <p> --rpc <path> --body <json> --n 30` signs in with the seeded test user, calls the RPC 30 times and prints p50 and p95 in milliseconds.
- [ ] Seed a test learner `verify@hanzimind.test` with a known password in `db:seed` when `SEED_TEST_USER=1`, already verified, so lanes never depend on Mailpit for sign-in.
- [ ] Each feature file follows the four H2s the generator names, with real selectors from the components.

**You see.**

- [ ] `lane-up.sh 3` prints `ready on 3003` and `doctor.sh 3` prints four `ok` lines.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/database/seed/__tests__/seed-test-user.test.ts` gains a case that the test learner is created only when `SEED_TEST_USER=1`. Run `pnpm test seed-test-user`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `lane-up.sh 1` then `doctor.sh 1`. Save `verify-doctor-ok.png`. Pass when doctor prints four `ok` lines.
- [ ] Lane 2. Run `lane-up.sh 2` while lane 1 is up. Save `verify-two-lanes.png`. Pass when both dev servers answer ping on different ports and `docker compose ls` shows two projects.
- [ ] Lane 3. Follow `features/sign-in.md` verbatim. Save `verify-signin.png`. Pass when the header shows the test learner's menu.
- [ ] Lane 4. Follow `features/study-session.md` verbatim through one answered card. Save `verify-study-card.png`. Pass when the result card shows a level.
- [ ] Lane 5. Follow `features/dictionary.md` and search 人. Save `verify-dictionary.png`. Pass when the results table lists 人 with the Meaning-only badge absent and a play button present.
- [ ] Lane 6. Follow `features/deck-browse-and-save.md` and save HSK 1. Save `verify-deck-save.png`. Pass when `psql` shows one `user_decks` row for the test learner.
- [ ] Lane 7. Run `lane-down.sh 1` then list the evidence directory. Save `verify-evidence-survives.png`. Pass when lane 1's screenshots still exist and its compose project is gone.
- [ ] Lane 8. Run `doctor.sh 1` after lane-down. Save `verify-doctor-fails-honestly.png`. Pass when doctor prints a non-ok line for the compose project and exits non-zero.
- [ ] Lane 9. Run `perf-probe.mjs --port 3002 --rpc vocab/search --body '{"query":"人","page":1,"pageSize":20}' --n 30`. Save `verify-perf-probe.png`. Pass when it prints p50 and p95 as integers.
- [ ] Lane 10. Read every feature file and open its route. Save `verify-feature-map.png`. Pass when every route in the map renders and no route in `src/app` is missing from the README index.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Seconds from `lane-up.sh` start to `ready`.
- [ ] Probe. Time `lane-up.sh <n>` three times at the head. There is no trunk equivalent, so the trunk probe is the manual recipe from README.md timed by hand once.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when lane-up exceeds 180 seconds with images already pulled and the seed cache warm. The cold seed is about 370 seconds of Google TTS fetches and is measured once, not gated.

**Review gate.** None. P0-VERIFY is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Make the e2e script real (P0-E2E)

**Depends on.** P0-CI, P0-VERIFY.

**Files.**

- [ ] Create `playwright.config.ts`.
- [ ] Create `e2e/sign-in.spec.ts`, `e2e/study-one-card.spec.ts`, `e2e/dictionary-search.spec.ts`.
- [ ] Edit `.github/workflows/ci.yml`.
- [ ] Edit `package.json`.
- [ ] Delete `development/ci.Dockerfile`.

**Build.**

- [ ] Add `@playwright/test` to devDependencies. Point `test-e2e` at `playwright test` with the lane recipe from P0-VERIFY as `webServer`.
- [ ] Write the three specs against the seeded test learner. Each asserts one end state the feature map names.
- [ ] Add an `e2e` job to `ci.yml` using a Postgres service container, `db:push`, `db:seed` with `SEED_TEST_USER=1`, and Playwright's chromium. Upload the trace on failure.
- [ ] Delete the orphan `ci.Dockerfile`.

**You see.**

- [ ] `pnpm test-e2e` prints `3 passed` locally and the `e2e` check is green on the PR.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The three specs are the unit. Run `pnpm test-e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `pnpm test-e2e` on a fresh lane. Save `e2e-local-pass.png`. Pass when 3 passed.
- [ ] Lane 2. Break the sign-in selector and rerun. Save `e2e-fails-loud.png`. Pass when 1 failed with a trace path printed.
- [ ] Lane 3. Open the PR's `e2e` check log. Save `e2e-ci-green.png`. Pass when the job ran the three specs and is green.
- [ ] Lane 4. Force the CI e2e job red with a wrong password and download the trace artifact. Save `e2e-trace-artifact.png`. Pass when the artifact contains `trace.zip`.
- [ ] Lane 5. Run `pnpm test-e2e --headed` and watch the study spec. Save `e2e-study-headed.png`. Pass when the result card is visible before the spec ends.
- [ ] Lane 6. Run the dictionary spec alone with `-g dictionary`. Save `e2e-dictionary-alone.png`. Pass when 1 passed.
- [ ] Lane 7. Run the suite twice back to back on one lane. Save `e2e-idempotent.png`. Pass when both runs pass without reseeding.
- [ ] Lane 8. Grep the repo for `ci.Dockerfile`. Save `e2e-orphan-gone.png`. Pass when no reference exists and the file is gone.
- [ ] Lane 9. Run `pnpm build` after adding Playwright. Save `e2e-build-unaffected.png`. Pass when the build still completes.
- [ ] Lane 10. Run the suite against a lane with `SEED_TEST_USER` unset. Save `e2e-needs-seed.png`. Pass when the sign-in spec fails with a message naming the seed flag.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall-clock seconds of `pnpm test-e2e`.
- [ ] Probe. Time three runs at the head. There is no trunk suite.
- [ ] Baseline. Record the trunk value first as zero, since trunk has no suite.
- [ ] Rule. Head fails when the suite exceeds 120 seconds locally or the CI job exceeds 10 minutes.

**Review gate.** None. P0-E2E is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Patch the critical and high advisories (P0-SEC)

**Depends on.** P0-CI.

**Files.**

- [ ] Edit `package.json`.
- [ ] Edit `pnpm-lock.yaml`.

**Build.**

- [ ] Bump `better-auth`, `@orpc/client`, `@orpc/server`, `@orpc/tanstack-query`, `next`, `drizzle-orm`, `nanoid` and `zod` to the latest minor that clears their advisories. Run `pnpm audit --prod` and paste the summary into the PR body.
- [ ] Add `pnpm.overrides` only for transitive advisories with no direct bump, each with a one-line reason in the PR body.
- [ ] Do not remove dependencies here. P1-DEPS owns that.

**You see.**

- [ ] `pnpm audit --prod` reports zero critical and zero high.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No new test. Run `pnpm test:ci` and `pnpm test-e2e` and confirm both still pass on the bumped tree.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `pnpm audit --prod`. Save `sec-audit-clean.png`. Pass when critical and high are both 0.
- [ ] Lane 2. Sign up a new learner and verify via Mailpit. Save `sec-signup-verify.png`. Pass when the verified page renders and the session is set.
- [ ] Lane 3. Sign in as the test learner. Save `sec-signin.png`. Pass when the header shows the learner menu.
- [ ] Lane 4. Answer one study card. Save `sec-study-answer.png`. Pass when the result card shows a level and `user_vocab_items` has a row.
- [ ] Lane 5. Search the dictionary for 水. Save `sec-dictionary.png`. Pass when 水 appears in results.
- [ ] Lane 6. Create a deck with three words. Save `sec-deck-create.png`. Pass when the deck page lists all three.
- [ ] Lane 7. Open `/admin/vocab` as an admin. Save `sec-admin.png`. Pass when the table renders.
- [ ] Lane 8. Submit an RPC with a prototype-pollution body `{"__proto__":{"x":1}}` to `vocab/search`. Save `sec-proto.png`. Pass when the response is a 400 and `({}).x` is undefined in a follow-up ping.
- [ ] Lane 9. Sign out. Save `sec-signout.png`. Pass when `/study` redirects or shows the signed-out state.
- [ ] Lane 10. Run `pnpm build`. Save `sec-build.png`. Pass when the build completes on the bumped Next.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/getNextVocabItem` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc study/getNextVocabItem --n 30` at trunk and at the head, interleaved, three rounds.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 20 percent.

**Review gate.** None. P0-SEC is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Delete unused dependencies and unreachable providers (P1-DEPS)

**Depends on.** P0-SEC.

**Files.**

- [ ] Edit `package.json`.
- [ ] Edit `pnpm-lock.yaml`.
- [ ] Delete `src/server/services/tts/MsEdgeTTSProvider.ts`.
- [ ] Delete `src/server/services/tts/GoogleTTSProvider.ts`.
- [ ] Delete `src/types/node-gtts.d.ts`.
- [ ] Delete `src/lib/orpc.server.tsx`.

**Build.**

- [ ] Remove `cheerio`, `@types/cheerio`, `bufferutil`, `utf-8-validate`, `next-intl`, `sass`, `@tailwindcss/typography`, `jsdom`, `@next/env`, `@iconify/json`, `@iconify/tailwind4`, `testcontainers`, `@testcontainers/postgresql`, `msedge-tts`, `node-gtts`, `google-tts-api` if unused after the provider deletion.
- [ ] Move `vitest`, `prettier`, `prettier-plugin-tailwindcss`, `@tanstack/react-query-devtools` to devDependencies.
- [ ] Delete the two TTS providers that `src/server/initialization.ts` never wires and the ambient type for `node-gtts`.
- [ ] Delete `src/lib/orpc.server.tsx`, which nothing imports.

**You see.**

- [ ] `pnpm install` prints a lockfile with 16 fewer top-level entries and `pnpm typecheck` is clean.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No new test. Run `pnpm test:ci` and confirm every existing test still passes with the pruned tree.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Grep `src` and `scripts` for every removed package name. Save `deps-no-imports.png`. Pass when zero matches.
- [ ] Lane 2. Run `pnpm db:seed` on a fresh lane. Save `deps-seed-audio.png`. Pass when the seed generates audio via the wired provider and s3mock lists objects under `audio/`.
- [ ] Lane 3. Play audio for 人 in the dictionary. Save `deps-audio-plays.png`. Pass when the network tab shows a 200 for the mp3.
- [ ] Lane 4. Create a deck with a new sentence so TTS runs at request time. Save `deps-tts-live.png`. Pass when the sentence entry has a working play button.
- [ ] Lane 5. Run `pnpm build`. Save `deps-build.png`. Pass when the build completes and no route grew.
- [ ] Lane 6. Run `pnpm audit --prod`. Save `deps-audit.png`. Pass when the total advisory count dropped from trunk.
- [ ] Lane 7. Run the e2e suite. Save `deps-e2e.png`. Pass when 3 passed.
- [ ] Lane 8. Open `/dictionary/人` and toggle to the graph view. Save `deps-graph.png`. Pass when the graph renders, proving `d3-force` and `react-force-graph-2d` survived.
- [ ] Lane 9. Load `/` in dark mode. Save `deps-theme.png`. Pass when the theme toggle still works, proving `next-themes` survived.
- [ ] Lane 10. Run `pnpm lint`. Save `deps-lint.png`. Pass when zero errors.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Seconds of `pnpm install --frozen-lockfile` on a clean `node_modules`.
- [ ] Probe. Time three installs at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when install is slower than trunk by more than 10 percent.

**Review gate.** None. P1-DEPS is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Delete dead exports, one-shot scripts and stale local state (P1-DEAD)

**Depends on.** P1-DEPS.

**Files.**

- [ ] Delete `scripts/classify-vocab.ts`, `scripts/backfill-etymology-roles.ts`, `scripts/backfill-admin-roles.ts`, `scripts/backfill-book-memory-aids.ts`, `scripts/assess-remote.ts`, `src/server/database/migrations/migrate-audio-urls.ts`. Keep `scripts/seed-hsk1-deck.ts`, which the lane recipe runs to seed the HSK 1 deck.
- [ ] Create `scripts/bootstrap.ts`.
- [ ] Edit `scripts/backfill-classification.ts`, `scripts/regenerate-audio.ts`, `scripts/seed-preview.ts`, `src/server/database/seed/index.ts`.
- [ ] Edit `src/server/services/AdminService.ts`, `src/server/endpoints/procedure.ts`, `src/server/database/database.ts`, `src/server/services/EmailAdapter.ts`, `src/definitions/definitions.ts`, `src/lib/text-match.ts`, `src/lib/pinyin.ts`, `src/lib/sounds.ts`, `src/lib/growth.ts`, `src/lib/vocab-type.ts`, `src/lib/graph-palette.ts`, `src/server/admin-access.ts`, `src/env-utils.ts`.
- [ ] Edit `package.json`.

**Build.**

- [ ] Delete the six one-shot scripts the survey lists as already run, and the `db:migrate-audio-urls` package script. Keep `backfill-classification.ts`, `regenerate-audio.ts`, `seed-preview.ts`, `seed-hsk1-deck.ts` and the seed entry.
- [ ] Write `scripts/bootstrap.ts` exporting one `bootstrap()` that parses env through `envSchema` and returns `{ env, logger, database }`. The four surviving scripts call it instead of hand-rolling pino and env.
- [ ] Delete `AdminService.setVocabType` and every exported symbol in the survey's dead-exports list, verified by a grep that finds no importer outside tests.
- [ ] Delete `src/server/admin-access.ts` and `ADMIN_EMAILS` from the env schema, since their only caller was the deleted backfill.
- [ ] Locally, not in the PR. Run `git worktree remove .claude/worktrees/dashboard-real-stats` and delete `.env.local-backup` after confirming its values exist in Doppler with `doppler secrets --only-names`.

**You see.**

- [ ] `pnpm typecheck` and `pnpm lint` are clean, and `pnpm db:seed` still seeds through `bootstrap()`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/__tests__/bootstrap.test.ts` gains a case that `bootstrap()` throws a zod error naming the missing variable when `DATABASE_URL` is unset. Run `pnpm test bootstrap`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `pnpm db:seed` on a fresh lane. Save `dead-seed.png`. Pass when `vocab_items` count exceeds 9000.
- [ ] Lane 2. Run `tsx scripts/backfill-classification.ts --dry-run`. Save `dead-backfill-dry.png`. Pass when it prints its would-change table and writes nothing.
- [ ] Lane 3. Run `tsx scripts/seed-preview.ts`. Save `dead-seed-preview.png`. Pass when it completes with the same output shape as trunk.
- [ ] Lane 4. Run `tsx scripts/regenerate-audio.ts --dry-run` or its documented safe mode. Save `dead-regen-dry.png`. Pass when it lists candidates and s3mock object count is unchanged.
- [ ] Lane 5. Grep for every deleted export name across `src` and `scripts`. Save `dead-grep.png`. Pass when zero matches outside deleted files.
- [ ] Lane 6. Run `git worktree list` and `ls -a` locally. Save `dead-local-clean.png`. Pass when the stale worktree and `.env.local-backup` are gone.
- [ ] Lane 7. Open `/admin/vocab` and toggle a component's Phonetic switch. Save `dead-admin-edit.png`. Pass when the row updates, proving `AdminService.updateVocabItem` survived the `setVocabType` deletion.
- [ ] Lane 8. Sign in as an admin. Save `dead-admin-gate.png`. Pass when `/admin` renders, proving admin gating no longer depends on `admin-access.ts`.
- [ ] Lane 9. Run the e2e suite. Save `dead-e2e.png`. Pass when 3 passed.
- [ ] Lane 10. Run `pnpm build`. Save `dead-build.png`. Pass when the build completes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Seconds of `pnpm db:seed` on an empty database.
- [ ] Probe. Time the seed at trunk and at the head on fresh lanes, twice each, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the seed is slower than trunk by more than 10 percent.

**Review gate.** None. P1-DEAD is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Hunt bugs across every feature with the verification skill (P2-HUNT)

**Depends on.** P0-E2E, P1-DEAD.

**Files.**

- [ ] Create `docs/hygiene-findings.md`.
- [ ] Edit `.claude/skills/verify-hanzimind/features/*.md`.

**Build.**

- [ ] Run one swarm lane per feature file on the `swarm workers` role. Each lane drives its feature end to end through every sub-feature the file lists, on desktop and at a 390 pixel wide viewport, signed in and signed out, and records every defect with a screenshot, a repro, and the file and line it suspects.
- [ ] Run one extra lane per seed the survey already found. The `text-2xlhanzi` class, logout not clearing the query cache, deck re-save resetting modes, raw error text on the wire, DB outage mapped to 404, Enter submitting from anywhere, the empty-deck completion screen.
- [ ] Reconcile into `docs/hygiene-findings.md`. One row per confirmed defect with severity, repro, evidence path, and the PR that will fix it. P2-STUDY, P2-API, P2-CLIENT, or P2-FOUND.
- [ ] Fix feature-map drift the lanes found in the same PR. Never touch product code here.

**You see.**

- [ ] `docs/hygiene-findings.md` lists every confirmed defect with an evidence path that exists.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No product test. Run `pnpm test:ci` to confirm the tree is unchanged.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Pick three findings at random and replay each repro. Save `hunt-replay-1.png`. Pass when all three reproduce.
- [ ] Lane 2. Pick three more findings. Save `hunt-replay-2.png`. Pass when all three reproduce.
- [ ] Lane 3. Check every evidence path in the findings file exists. Save `hunt-evidence-exists.png`. Pass when zero missing.
- [ ] Lane 4. Follow the updated `features/study-session.md` verbatim. Save `hunt-map-study.png`. Pass when every step matches the live app.
- [ ] Lane 5. Follow the updated `features/deck-browse-and-save.md`. Save `hunt-map-decks.png`. Pass when every step matches.
- [ ] Lane 6. Follow the updated `features/admin-vocab.md`. Save `hunt-map-admin.png`. Pass when every step matches.
- [ ] Lane 7. Reproduce the `text-2xlhanzi` finding by inspecting the writing input's class list. Save `hunt-seed-hanzi.png`. Pass when the broken class is present at trunk.
- [ ] Lane 8. Reproduce the logout cache finding. Sign in, load decks, sign out, sign in as another learner. Save `hunt-seed-logout.png`. Pass when the first learner's saved decks flash before refetch.
- [ ] Lane 9. Reproduce the raw error finding by submitting an answer with a bad `vocabItemId`. Save `hunt-seed-rawerror.png`. Pass when Postgres text reaches the toast.
- [ ] Lane 10. Count findings by assigned PR. Save `hunt-assignment.png`. Pass when every finding names exactly one of P2-STUDY, P2-API, P2-CLIENT, P2-FOUND.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `vocab/search` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc vocab/search --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 differs from trunk by more than 5 percent, since this PR must not change product code.

**Review gate.** None. P2-HUNT is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Fix the study session defects (P2-STUDY)

**Depends on.** P2-HUNT.

**Files.**

- [ ] Edit `src/app/study/[deckId]/page.tsx`.
- [ ] Edit `src/server/endpoints/studyRouter.ts`.
- [ ] Edit `src/server/services/StudyService.ts`.
- [ ] Edit `src/definitions/definitions.ts`.

**Build.**

- [ ] Fix the class template at `page.tsx:308` so a hanzi answer input gets `text-2xl hanzi`.
- [ ] Replace the two window-level Enter listeners with one handler scoped to the card form, so Enter on the Give up button activates that button.
- [ ] Distinguish "deck has no cards due" from "session complete" so a fresh session with a null first item shows the empty-deck state, not the celebration.
- [ ] Remove `userId` from `StudyAnswerDto` and the duplicate `deckId` from the submit call.
- [ ] In `submitAnswer`, reject a `vocabItemId` that is not in `deckVocabItems` for `deckId` with a 400 before `processAnswer` runs. Apply the same check in `addSynonym`.
- [ ] Fix every other study-session row in `docs/hygiene-findings.md`.

**You see.**

- [ ] Writing cards render the answer in the hanzi font, Enter on Give up gives up, and an empty deck shows "Nothing due" with a link back to the deck.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/__tests__/study-membership.test.ts` gains cases that `submitAnswer` and `addSynonym` reject an item outside the deck and accept one inside it. Run `pnpm test study-membership`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Start a session with writing enabled and reach a writing card. Save `study-hanzi-font.png`. Pass when the input's computed font-family is the hanzi stack.
- [ ] Lane 2. Focus Give up and press Enter. Save `study-enter-giveup.png`. Pass when the result card shows the give-up state, not a submitted empty answer.
- [ ] Lane 3. Type an answer and press Enter with focus in the input. Save `study-enter-submit.png`. Pass when the answer is graded.
- [ ] Lane 4. Press Enter on the result card. Save `study-enter-next.png`. Pass when the next card loads.
- [ ] Lane 5. Open a session on a deck whose every card is scheduled in the future. Save `study-nothing-due.png`. Pass when the empty state renders and no confetti fires.
- [ ] Lane 6. Clear every due card in a small deck. Save `study-complete.png`. Pass when the completion screen renders after the last answer.
- [ ] Lane 7. POST a `submitAnswer` with a `vocabItemId` from another deck via curl. Save `study-foreign-item.png`. Pass when the response is 400 and `user_vocab_items` gained no row.
- [ ] Lane 8. Inspect the submit request body in the network tab. Save `study-payload.png`. Pass when it has no `userId` and one `deckId`.
- [ ] Lane 9. Replay every study row in `docs/hygiene-findings.md`. Save `study-findings-closed.png`. Pass when none reproduce.
- [ ] Lane 10. Run the e2e suite. Save `study-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/submitAnswer` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc study/submitAnswer --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 20 percent.

**Review gate.** None. P2-STUDY is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Fix API error handling and input bounds (P2-API)

**Depends on.** P2-HUNT.

**Files.**

- [ ] Edit `src/server/endpoints/vocabRouter.ts`, `studyRouter.ts`, `adminRouter.ts`, `decksRouter.ts`, `procedure.ts`.
- [ ] Create `src/server/endpoints/errors.ts`.
- [ ] Edit `src/server/services/StudyService.ts`, `VocabService.ts`, `S3StorageAdapter.ts`, `EmailAdapter.ts`, `TranslatorService.ts`.
- [ ] Edit `src/server/constants.ts`.

**Build.**

- [ ] Write `errors.ts` with one `toORPCError(error)` that maps a typed not-found from a service to `NOT_FOUND`, a validation failure to `BAD_REQUEST`, and everything else to `INTERNAL_SERVER_ERROR` with a generic message. Every router uses it, matching what `suggestionsRouter.ts` already does.
- [ ] Services throw a `NotFoundError` class instead of returning through catch-all blocks. Delete the catch-all `NOT_FOUND` mappings at `vocabRouter.ts:46-52`, `76-82`, `decksRouter.ts:177-184`.
- [ ] Delete the seven log-and-rethrow blocks in `StudyService` and `VocabService`, since `loggingMiddleware` logs once. Delete the identity `instanceof Error` wrappers in the three adapters.
- [ ] Cap `pageSize` at 100 in `vocab.search` and `vocab.get`. Cap `decks.create` at 200 items, 80 characters of name, 500 of description. Add `.output()` to `vocab.search`.
- [ ] `decks.graph` on an unknown id throws not-found instead of an empty graph.
- [ ] Fix the `constants.ts` comment that says JACCARD is 0.6.

**You see.**

- [ ] A stopped database yields a 500 with "Something went wrong", and the server log shows each error once. The "Item is not in this deck" 400 is P2-STUDY's build box, not this one; P2-STUDY must land the guard, and if both PRs carry it the stronger version wins the rebase.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/endpoints/__tests__/errors.test.ts` gains cases for the three mappings and asserts the internal message never contains the original error text. Run `pnpm test errors`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Stop the lane's Postgres and load `/dictionary/人`. Save `api-db-down.png`. Pass when the response is 500, not 404, and the UI shows the generic error.
- [ ] Lane 2. Submit an answer with a nonexistent `vocabItemId`. Save `api-bad-item.png`. Pass when the toast shows no Postgres text.
- [ ] Lane 3. Call `vocab/search` with `pageSize` 10000. Save `api-pagesize.png`. Pass when the response is 400.
- [ ] Lane 4. Call `decks/create` with 201 items. Save `api-deck-cap.png`. Pass when the response is 400 and no deck row exists.
- [ ] Lane 5. Call `decks/graph` with a random UUID. Save `api-graph-404.png`. Pass when the response is 404.
- [ ] Lane 6. Trigger one service error and grep the dev log. Save `api-logged-once.png`. Pass when the error appears exactly once.
- [ ] Lane 7. Open `/dictionary/zzz` for an unknown word. Save `api-word-404.png`. Pass when the response is 404 and the page shows a not-found state.
- [ ] Lane 8. Run every admin mutation once with a bad id. Save `api-admin-errors.png`. Pass when each returns a generic message.
- [ ] Lane 9. Run the happy paths from the e2e suite. Save `api-e2e.png`. Pass when 3 passed.
- [ ] Lane 10. Diff the `vocab/search` response shape against trunk for 人. Save `api-search-shape.png`. Pass when the keys are identical and no admin-only column appears.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `vocab/search` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc vocab/search --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 10 percent.

**Review gate.** None. P2-API is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Fix client state defects (P2-CLIENT)

**Depends on.** P2-HUNT.

**Files.**

- [ ] Edit `src/lib/orpc.client.tsx`, `src/app/profile/page.tsx`, `src/app/decks/[deckId]/page.tsx`, `src/app/decks/page.tsx`, `src/components/editable-cell.tsx`, `src/app/admin/suggestions/page.tsx`, `src/app/admin/vocab/page.tsx`, `src/components/theme-toggle.tsx`, `src/components/create-memory-aid-dialog.tsx`, `src/app/page.tsx`, `src/components/app-toaster.tsx`.

**Build.**

- [ ] Clear the query client on sign-out in one place, `ApiClientProvider`, keyed on the session user id changing, so the doc in CLAUDE.md becomes true.
- [ ] Seed the deck settings dialog from the saved `userDecks` row so re-saving keeps the learner's modes.
- [ ] Key `EditableCell` on its server value instead of resyncing during render. Resync `adminNote` after invalidation.
- [ ] Delete the dead `Suspense` at `decks/page.tsx:465-473` and the two `ErrorBoundary` wrappers that cannot fire. Replace index keys with ids in the five listed files. Await the floating promise in `create-memory-aid-dialog.tsx`.
- [ ] Render the theme toggle without the pre-mount `Moon` flash and give it a dynamic `aria-label`. Replace `bg-white` on the home page with a token. Guard `resolvedTheme` in the toaster.
- [ ] Fix every other client row in `docs/hygiene-findings.md`.

**You see.**

- [ ] Signing out and in as a different learner never shows the previous learner's decks, and re-saving a deck with listening off keeps listening off.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/__tests__/query-reset.test.ts` gains a case that the reset callback clears the client when the user id changes and not on a rerender with the same id. Run `pnpm test query-reset`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Sign in as learner A, open `/decks`, sign out, sign in as learner B. Save `client-logout-clear.png`. Pass when B's first paint of `/decks` shows a skeleton or B's decks, never A's.
- [ ] Lane 2. Save a deck with listening off, reopen the dialog. Save `client-settings-seeded.png`. Pass when listening is off in the dialog.
- [ ] Lane 3. Re-save that deck without changes and check `user_decks`. Save `client-settings-kept.png`. Pass when listening remains false.
- [ ] Lane 4. Edit a cell in `/admin/vocab`, blur, then refetch. Save `client-cell-resync.png`. Pass when the cell shows the server value after refetch.
- [ ] Lane 5. Edit an admin note on a suggestion, save, refetch. Save `client-note-resync.png`. Pass when the note persists in the textarea.
- [ ] Lane 6. Load `/` with the theme set to dark. Save `client-toggle-no-flash.png`. Pass when the first frame shows the sun icon and the button's `aria-label` says "Switch to light".
- [ ] Lane 7. Load `/` in dark mode. Save `client-no-bg-white.png`. Pass when no element has a white background.
- [ ] Lane 8. Create a memory aid and immediately close the dialog. Save `client-aid-awaited.png`. Pass when the aid appears without a console error.
- [ ] Lane 9. Replay every client row in `docs/hygiene-findings.md`. Save `client-findings-closed.png`. Pass when none reproduce.
- [ ] Lane 10. Run the e2e suite. Save `client-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/decks`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, read the route table, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/decks` grows by more than 5 kilobytes.

**Review gate.** None. P2-CLIENT is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Fix the remaining hunt findings (P2-FOUND)

**Depends on.** P2-STUDY, P2-API, P2-CLIENT.

**Files.**

- [ ] Edit the files each remaining row in `docs/hygiene-findings.md` names.
- [ ] Edit `docs/hygiene-findings.md`.

**Build.**

- [ ] Take every row assigned to P2-FOUND. Fix each at its root cause per `skills/poteto-mode/playbooks/bug-fix.md`, reproducing first on the same surface.
- [ ] Pin each fix with a unit test where the survey's coverage list names a cheap target, or an e2e spec otherwise.
- [ ] Mark each row fixed with the commit SHA.

**You see.**

- [ ] Every row in `docs/hygiene-findings.md` carries a fix SHA.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] One test per fixed row, named in the row. Run `pnpm test:ci`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Replay the first tenth of P2-FOUND rows. Save `found-replay-1.png`. Pass when none reproduce.
- [ ] Lane 2. Replay the second tenth. Save `found-replay-2.png`. Pass when none reproduce.
- [ ] Lane 3. Replay the third tenth. Save `found-replay-3.png`. Pass when none reproduce.
- [ ] Lane 4. Replay the fourth tenth. Save `found-replay-4.png`. Pass when none reproduce.
- [ ] Lane 5. Replay the fifth tenth. Save `found-replay-5.png`. Pass when none reproduce.
- [ ] Lane 6. Replay the sixth tenth. Save `found-replay-6.png`. Pass when none reproduce.
- [ ] Lane 7. Replay the seventh tenth. Save `found-replay-7.png`. Pass when none reproduce.
- [ ] Lane 8. Replay the eighth tenth. Save `found-replay-8.png`. Pass when none reproduce.
- [ ] Lane 9. Replay the last two tenths. Save `found-replay-9.png`. Pass when none reproduce.
- [ ] Lane 10. Drive every feature file end to end once. Save `found-regression-sweep.png`. Pass when no new defect appears.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/getNextVocabItem` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc study/getNextVocabItem --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 20 percent.

**Review gate.** None. P2-FOUND is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Extract scheduling, grading and ordering as pure rules (P3-RULES)

**Depends on.** P2-FOUND.

**Files.**

- [ ] Create `src/server/study-scheduling.ts`.
- [ ] Create `src/server/__tests__/study-scheduling.test.ts`.
- [ ] Edit `src/server/study-rules.ts`, `src/server/services/StudyService.ts`, `src/server/constants.ts`.

**Build.**

- [ ] Run `mattpocock-skills:codebase-design` on `StudyService` first and record the seam decision in Appendix B.
- [ ] Move `getNextReviewTime` into `study-scheduling.ts` as `nextReviewAt(currentLevel, correct, now)` over a `LEVEL_INTERVALS` table. It must keep `correct`, since the wrong-answer path cannot be expressed without it. Reproduce the old switch rather than clamping, because its `case 5` and `default` sent every out-of-range level to `LEVEL_5` where a clamp would send a negative to `LEVEL_0`.
- [ ] Move the grading branch of `processAnswer` into a pure `gradeAnswer` with no database access, as a `switch` with a `never` exhaustiveness guard so a fifth study type cannot silently grade as writing. It returns `correct` only. `newLevel` and `nextAt` are not derivable from the grading arguments, since one needs the current level and the other a clock. Leave the `canStudy` re-check in the service ahead of grading, because the branches compare against the raw `pinyin` column, which holds a borrowed reading for most components.
- [ ] Move the whole selection out of `getNextVocabItem` as `selectNextCard(items, ctx)` with an injectable tiebreak, subsuming the gate, the due scan, the random stamp and the sort. A bare comparator is testable and proves little, because the scorer producing its keys stays inline; the whole selection makes "the served sequence did not change" a seeded unit test rather than only a live diff. Do not pass a clock into the comparison, which would invite an overdue-first rule that changes the sequence. `minLevel` and `weakestServableLevel` are different numbers and must not be unified.
- [ ] `StudyService` calls the three functions and keeps only persistence.

**You see.**

- [ ] The extracted modules import neither `drizzle-orm` nor the schema, and `StudyService.ts` is under 900 lines. The 850 was set before the moves were sized and is not worth chasing, because closing the last few lines means moving code for its size rather than because it belongs elsewhere. Parity outranks it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `study-scheduling.test.ts` gains cases that level 3 plus correct gives level 4 and the `LEVEL_3` offset, wrong gives 0 and the `INCORRECT` offset, understanding accepts a stored synonym before consulting the checker, and the comparator orders due before new. Run `pnpm test study-scheduling`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Answer a level-0 card correctly and read `user_vocab_items`. Save `rules-level-up.png`. Pass when the level is 1 and `next_at` matches `LEVEL_1` within a minute.
- [ ] Lane 2. Answer a level-2 card wrongly. Save `rules-level-reset.png`. Pass when the level is 0 and `next_at` matches `INCORRECT`.
- [ ] Lane 3. Add a synonym then answer with it. Save `rules-synonym.png`. Pass when graded correct.
- [ ] Lane 4. Answer a reading card with `nv3` for 女. Save `rules-pinyin-v.png`. Pass when graded correct.
- [ ] Lane 5. With one due card and ten new, start a session. Save `rules-due-first.png`. Pass when the due card is served first.
- [ ] Lane 6. With cards at levels 0 and 2 both due, start a session. Save `rules-lower-level-first.png`. Pass when the level-0 card is served first.
- [ ] Lane 7. Answer a listening card correctly. Save `rules-listening.png`. Pass when `listening_level` alone advances.
- [ ] Lane 8. Answer a writing card with the wrong character. Save `rules-writing-wrong.png`. Pass when the result shows incorrect and the expected character.
- [ ] Lane 9. Run 20 answers in a row and compare the sequence to a trunk lane seeded identically. Save `rules-sequence-parity.png`. Pass when the served order is identical. The deck must be built so no two candidates tie on the deterministic keys, because HSK 1 has dozens of ties, the random tiebreak decides them, and whether the drawn item is phonetic changes the next card's study type. P3-RULES measured the head disagreeing with itself across five runs on HSK 1, four distinct sequences, so a tied deck produces false failures.
- [ ] Lane 10. Run the e2e suite. Save `rules-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/submitAnswer` via `perf-probe.mjs`.
- [ ] Probe. `perf-probe.mjs --rpc study/submitAnswer --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 10 percent.

**Review gate.** None. P3-RULES is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Deepen StudyService around one query and one DTO path (P3-STUDY-SVC)

**Depends on.** P3-RULES, which now owns `selectNextCard` and has already moved about 93 lines out of `getNextVocabItem`. Rebase onto it before starting and do not re-extract the selection.

**Files.**

- [ ] Edit `src/server/services/StudyService.ts`, `src/server/services/VocabService.ts`, `src/server/endpoints/studyRouter.ts`, `src/server/endpoints/decksRouter.ts`.
- [ ] Edit `src/server/services/__tests__/deck-progress.test.ts`.

**Build.**

- [ ] Delete `updateDeckSettings`. `addDeck` already upserts. Migrate its one caller.
- [ ] One `enabledStudyTypes(userDeck)` helper replaces the two copies. One `deckItemsWithProgress(userId, deckId)` query replaces the two column lists, and it selects no stroke JSONB.
- [ ] `getUserVocabItem` and `getNextVocabItem` build their DTO through `toVocabItemDto` plus a progress overlay. Delete the hand-copied field mapping.
- [ ] Wrap `processAnswer` read-then-update in a transaction with `SELECT ... FOR UPDATE` on the progress row.
- [ ] `submitAnswer` in the router becomes one service call returning the result and the next item.

**You see.**

- [ ] `StudyService.ts` is under 600 lines, `grep -c strokes src/server/services/StudyService.ts` prints 0, and the study loop behaves identically.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `VocabService.test.ts` gains a case that the study DTO path passes through `toVocabItemDto` and blanks a borrowed reading. `deck-progress.test.ts` gains a case for `enabledStudyTypes`. Run `pnpm test VocabService deck-progress`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Study 亻 in a deck. Save `svc-component-silent.png`. Pass when the card shows no reading and no play button.
- [ ] Lane 2. Study 艮. Save `svc-phonetic-reads.png`. Pass when reading and listening cards are both served over a session.
- [ ] Lane 3. Answer the same card from two tabs within a second. Save `svc-race.png`. Pass when the level advanced exactly once.
- [ ] Lane 4. Save a deck, change modes, save again. Save `svc-upsert.png`. Pass when one `user_decks` row exists with the new modes.
- [ ] Lane 5. Inspect the SQL log for one `getNextVocabItem`. Save `svc-no-strokes.png`. Pass when no query selects the `strokes` column.
- [ ] Lane 6. Open the deck progress panel. Save `svc-progress.png`. Pass when counts match a `psql` query over `user_vocab_items`.
- [ ] Lane 7. Submit an answer and watch the network tab. Save `svc-one-roundtrip.png`. Pass when one RPC call returns both the result and the next card.
- [ ] Lane 8. Study a character gated on a component not yet known. Save `svc-gate.png`. Pass when the component is served before the character.
- [ ] Lane 9. Run 20 answers and compare the served sequence to a trunk lane seeded identically. Save `svc-sequence-parity.png`. Pass when identical. The deck must be built so no two candidates tie on the deterministic keys, because HSK 1 has dozens of ties, the random tiebreak decides them, and whether the drawn item is phonetic changes the next card's study type. P3-RULES measured the head disagreeing with itself across five runs on HSK 1, four distinct sequences, so a tied deck produces false failures.
- [ ] Lane 10. Run the e2e suite. Save `svc-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Response payload bytes for `study/getNextVocabItem` on the HSK 1 deck, and p50 milliseconds alongside it. Bytes are the claim, since the stroke columns stop crossing the wire, and bytes are not subject to machine load, which has defeated two timing comparisons in this program.
- [ ] Probe. `perf-probe.mjs --rpc study/getNextVocabItem --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 is not at least 20 percent below trunk, since the stroke JSONB no longer crosses the wire.

**Review gate.** None. P3-STUDY-SVC is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Move deck creation into DeckService and kill the N+1 (P3-DECKS)

**Depends on.** P2-API.

**Files.**

- [ ] Edit `src/server/endpoints/decksRouter.ts`, `src/server/services/DeckService.ts`, `src/server/services/VocabService.ts`, `src/server/services/AdminService.ts`.
- [ ] Create `src/lib/sql.ts`.
- [ ] Create `src/server/services/__tests__/DeckService.test.ts`.

**Build.**

- [ ] Move the body of `decks.create` into `DeckService.createDeck(userId, input)`. External calls, DeepL, TTS and S3, run first and collect results. The database writes happen in one transaction after. A failure before the transaction leaves no rows.
- [ ] Replace the per-item `getVocabItemPartsDeep` loop with one call that resolves every part of every item from the decomposition index in memory. Delete `getVocabItemPartsDeep` and `getVocabItemPartsDeepRecursive`.
- [ ] One `escapeLike` in `src/lib/sql.ts` used by the three searches. `DeckService` search escapes its input.
- [ ] One deck-header select expression used three times. `getNumLearnersSubquery` evaluated once per row. Merge `getStoredVocabItems` and `getExistingVocabItems` into one with a flag.

**You see.**

- [ ] Creating a 50-word deck runs under 20 queries in the SQL log, and a deck search for `%` returns no rows instead of everything.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `DeckService.test.ts` gains cases that `createDeck` writes nothing when TTS throws, and that `escapeLike` escapes `%`, `_` and `\`. Run `pnpm test DeckService`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Create a deck with 50 new words. Save `decks-create-50.png`. Pass when the deck page lists 50 and every constituent is in `deck_vocab_items`.
- [ ] Lane 2. Point `S3_OPTIONS` at a dead port and create a deck. Save `decks-create-atomic.png`. Pass when the error toast is generic and no `decks` row exists.
- [ ] Lane 3. Search decks for `%`. Save `decks-search-escaped.png`. Pass when zero results.
- [ ] Lane 4. Search decks for `HSK`. Save `decks-search-hits.png`. Pass when HSK 1 appears.
- [ ] Lane 5. Count queries in the SQL log for one 50-word create. Save `decks-query-count.png`. Pass when under 20.
- [ ] Lane 6. Browse `/decks` with 100 seeded decks. Save `decks-browse.png`. Pass when the learner counts match `psql`.
- [ ] Lane 7. Open a deck as its creator and as another learner. Save `decks-header.png`. Pass when both see the same header fields.
- [ ] Lane 8. Create a deck with a sentence. Save `decks-sentence.png`. Pass when the sentence, its words and their characters all appear.
- [ ] Lane 9. Create a deck reusing 10 existing words. Save `decks-existing.png`. Pass when no duplicate `vocab_items` rows and no new audio objects.
- [ ] Lane 10. Run the e2e suite. Save `decks-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall-clock milliseconds of `decks/create` for 50 words that already exist in `vocab_items`.
- [ ] Probe. `perf-probe.mjs --rpc decks/create --body <50 existing words> --n 5` at trunk and at the head, interleaved, deleting the deck between runs.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when it is not at least 50 percent faster than trunk.

**Review gate.** None. P3-DECKS is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Turn the study page into a reducer and components (P3-SESSION)

**Depends on.** P2-STUDY, P3-RULES.

**Files.**

- [ ] Create `src/lib/study-session.ts` and `src/lib/__tests__/study-session.test.ts`.
- [ ] Create `src/components/study/study-card.tsx`, `result-card.tsx`, `completion-screen.tsx`, `hanzi-panel.tsx`.
- [ ] Edit `src/app/study/[deckId]/page.tsx`.
- [ ] Edit `src/lib/pinyin.ts`.

**Build.**

- [ ] Write `studySessionReducer(state, action)` with states `loading`, `card`, `result`, `complete`, `empty` and actions `loaded`, `answered`, `next`, `gaveUp`. Illegal transitions throw.
- [ ] Move the pinyin keystroke folding into `src/lib/pinyin.ts` as `foldPinyinInput`. Type `STUDY_LABELS` as `Record<StudyType, string>`.
- [ ] Split the page into the four components. The page holds the reducer, the queries and the layout only.

**You see.**

- [ ] `src/app/study/[deckId]/page.tsx` is under 200 lines and the session plays identically.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `study-session.test.ts` gains cases for every legal transition, one illegal transition throwing, and `loaded` with a null item from `loading` going to `empty`. Run `pnpm test study-session`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Play five cards of each study type. Save `session-all-types.png`. Pass when each card type renders and grades.
- [ ] Lane 2. Give up on a card. Save `session-giveup.png`. Pass when the result shows the answer and the level resets.
- [ ] Lane 3. Type `nv3` on a reading card. Save `session-fold.png`. Pass when the input shows `nǚ`.
- [ ] Lane 4. Start on an empty deck. Save `session-empty.png`. Pass when the empty state renders.
- [ ] Lane 5. Finish a small deck. Save `session-complete.png`. Pass when the completion screen renders with confetti.
- [ ] Lane 6. Reload mid-session. Save `session-reload.png`. Pass when a fresh card loads with no stale result.
- [ ] Lane 7. Add a synonym from the result card. Save `session-synonym.png`. Pass when the synonym persists in `user_vocab_items`.
- [ ] Lane 8. Toggle Details and Graph on the first-sight card. Save `session-graph.png`. Pass when the graph renders.
- [ ] Lane 9. Run through 20 cards at 390 pixels wide. Save `session-mobile.png`. Pass when nothing overflows horizontally.
- [ ] Lane 10. Run the e2e suite. Save `session-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/study/[deckId]`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, read the route table, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the route grows by more than 5 kilobytes.

**Review gate.** None. P3-SESSION is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Share the UI that is written three times (P3-SHARED-UI)

**Depends on.** P2-CLIENT.

**Files.**

- [ ] Create `src/components/pagination.tsx`, `composition-bar.tsx`, `graph-panel-frame.tsx`, `memory-aid-form.tsx`, `memory-aid-card.tsx`, `back-link.tsx`.
- [ ] Create `src/lib/pagination.ts`, `src/lib/deck-composition.ts`, `src/lib/__tests__/pagination.test.ts`, `src/lib/__tests__/deck-composition.test.ts`.
- [ ] Create `src/hooks/use-tracked-mutation.ts`.
- [ ] Edit `src/app/admin/vocab/page.tsx`, `src/app/admin/suggestions/page.tsx`, `src/components/view-all-memory-aids-dialog.tsx`, `src/app/decks/page.tsx`, `src/app/decks/[deckId]/page.tsx`, `src/components/decomposition-graph-panel.tsx`, `src/components/deck-graph-panel.tsx`, `src/components/manage-memory-aids-dialog.tsx`, `src/components/create-memory-aid-dialog.tsx`, `src/app/page.tsx`, `src/app/dictionary/page.tsx`, `src/app/dictionary/[word]/page.tsx`.
- [ ] Delete the inline `StatTile` in `src/app/page.tsx`.

**Build.**

- [ ] `pageRange(page, pageSize, total)` in `src/lib/pagination.ts` and one `Pagination` component replace the three copies.
- [ ] `compositionSegments(counts)` in `src/lib/deck-composition.ts` and one `CompositionBar` replace the two copies. `DEFAULT_DECK_SETTINGS` stays where it is. Both deck pages already import it, and moving it into `definitions.ts` costs 398 KB on `/decks` alone, because that route imported only types before and types erase while a value pulls the module and zod into the client bundle.
- [ ] `GraphPanelFrame` owns spinner, error line, legend and caption for both graph panels.
- [ ] `useTrackedMutation` replaces the three `savingId` scaffolds. Do not read `mutation.variables`, which holds only the most recent call and so reproduces the defect the hook exists to fix. Keep every in-flight call's variables and clear each on its own settle.
- [ ] `MemoryAidForm` and `MemoryAidCard` are used by all three dialogs.
- [ ] The home page uses `src/components/stat-tile.tsx`. Admin and dictionary pages use `EmptyState` and `PageHeader`. Dictionary uses `src/lib/audio.ts`.

**You see.**

- [ ] `grep -rn "Math.ceil(total" src` prints one line and every admin table paginates identically.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `pagination.test.ts` covers first page, last page, empty, and a page past the end. `deck-composition.test.ts` covers zero items and a single type. Run `pnpm test pagination deck-composition`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Page through `/admin/vocab` to the last page. Save `shared-admin-paging.png`. Pass when the last page shows the remainder and Next is disabled.
- [ ] Lane 2. Page through `/admin/suggestions`. Save `shared-suggestions-paging.png`. Pass when controls match lane 1 pixel for pixel.
- [ ] Lane 3. Open the view-all memory aids dialog with 30 aids. Save `shared-aids-paging.png`. Pass when the same control renders.
- [ ] Lane 4. Compare the composition bar on `/decks` and on a deck page for HSK 1. Save `shared-composition.png`. Pass when segment widths are identical.
- [ ] Lane 5. Stop Postgres and open both graph panels. Save `shared-graph-error.png`. Pass when both show the same error line.
- [ ] Lane 6. Toggle two switches quickly in `/admin/vocab`. Save `shared-tracked-mutation.png`. Pass when each row shows its own pending state.
- [ ] Lane 7. Create a memory aid from all three dialogs. Save `shared-aid-form.png`. Pass when the form is identical and all three persist.
- [ ] Lane 8. Load `/` signed in. Save `shared-stat-tile.png`. Pass when the tiles match `src/components/stat-tile.tsx` styling.
- [ ] Lane 9. Play audio from the dictionary results table. Save `shared-audio.png`. Pass when it plays and a failure shows the shared toast.
- [ ] Lane 10. Run the e2e suite. Save `shared-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes for the whole build, from a clean production build. Not a sum across three routes. Turbopack inlines a small shared module into each route rather than emitting a common chunk, so source-level sharing does not reduce per-route bytes and slightly raises them, and the duplications worth kilobytes sit on routes those three do not include.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the sum grows by more than 0 kilobytes.

**Review gate.** None. P3-SHARED-UI is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Replace hand-rolled primitives with shadcn (P3-SHADCN)

**Depends on.** P3-SHARED-UI.

**Files.**

- [ ] Edit `src/components/item-type-badge.tsx`, `component-role-badge.tsx`, `script-badge.tsx`, `segmented-toggle.tsx`, `src/app/decks/page.tsx`, `src/components/vocab-entry.tsx`, `src/app/admin/suggestions/page.tsx`, `src/app/decks/[deckId]/page.tsx`, `src/app/signin/page.client.tsx`, `src/app/signup/page.client.tsx`, `src/components/manage-memory-aids-dialog.tsx`.
- [ ] Create `src/components/ui/tooltip.tsx`, `tabs.tsx` via `npx shadcn@latest add`.

**Build.**

- [ ] Every pill uses `ui/badge` with a variant. Every `title=` hint becomes `ui/tooltip`. `segmented-toggle.tsx` wraps `ui/tabs`. Auth pages use `ui/form` and `ui/separator`. The raw `<button>` becomes `ui/button`.
- [ ] Delete any component whose only job was the hand-rolled version.

**You see.**

- [ ] `grep -rn 'title=' src/app src/components --include=*.tsx | grep -v ui/` prints zero lines.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No logic to test. Run `pnpm test:ci` and `pnpm lint`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Open `/dictionary/亻`. Save `shadcn-badges.png`. Pass when the type and role badges render as `ui/badge` variants.
- [ ] Lane 2. Hover the script badge. Save `shadcn-tooltip.png`. Pass when a tooltip appears and is keyboard reachable.
- [ ] Lane 3. Toggle Details and Graph with the keyboard. Save `shadcn-tabs.png`. Pass when arrow keys move between tabs.
- [ ] Lane 4. Submit the sign-in form empty. Save `shadcn-form-errors.png`. Pass when errors render under each field via `ui/form`.
- [ ] Lane 5. Sign up a new learner. Save `shadcn-signup.png`. Pass when the flow completes.
- [ ] Lane 6. Open the manage memory aids dialog and tab through it. Save `shadcn-dialog-buttons.png`. Pass when every button is focusable with a visible ring.
- [ ] Lane 7. Load `/decks` and check the Saved badge. Save `shadcn-saved-badge.png`. Pass when it renders as `ui/badge`.
- [ ] Lane 8. Load every page in dark mode. Save `shadcn-dark.png`. Pass when no badge or tooltip is unreadable.
- [ ] Lane 9. Load `/admin/suggestions` and check status pills. Save `shadcn-status.png`. Pass when each status has a variant and a text label.
- [ ] Lane 10. Run the e2e suite. Save `shadcn-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/dictionary/[word]`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the route grows by more than 8 kilobytes.

**Review gate.** None. P3-SHADCN is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Adopt migration files instead of push (P4-MIGRATE)

**Depends on.** P3-STUDY-SVC, P3-DECKS.

**Files.**

- [ ] Create `drizzle/0000_baseline.sql` and `drizzle/meta/**`.
- [ ] Create `src/server/database/migrate.ts`.
- [ ] Edit `package.json`, `.github/workflows/ci.yml`, `drizzle.config.ts`, `docs/remote-setup.md`.

**Build.**

- [ ] Run `drizzle-kit generate` against the current schema to produce the baseline. Add `db:generate` and `db:migrate` scripts. `db:migrate` runs `migrate.ts` with the drizzle migrator.
- [ ] CI's e2e job and the lane recipe run `db:migrate` instead of `db:push`. Keep `db:push` for local scratch only and say so in the script name, `db:push:scratch`.
- [ ] Document the production cutover in `docs/remote-setup.md`. Mark the baseline as applied on the production database with the migrator's journal table before any later migration runs.

**You see.**

- [ ] `pnpm db:migrate` on an empty database creates every table, and a second run is a no-op.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/database/__tests__/migrate.test.ts` gains a case that the generated SQL contains every table `schema.ts` exports. Run `pnpm test migrate`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `db:migrate` on an empty lane database. Save `migrate-fresh.png`. Pass when `\dt` lists every table.
- [ ] Lane 2. Run `db:migrate` twice. Save `migrate-idempotent.png`. Pass when the second run applies zero migrations.
- [ ] Lane 3. Run `db:migrate` on a database created by trunk's `db:push`, after marking the baseline applied per the doc. Save `migrate-adopt.png`. Pass when it applies nothing and the app boots.
- [ ] Lane 4. Run `drizzle-kit generate` with no schema change. Save `migrate-no-drift.png`. Pass when it reports no changes.
- [ ] Lane 5. Seed and run the e2e suite on a migrated database. Save `migrate-e2e.png`. Pass when 3 passed.
- [ ] Lane 6. Open the CI e2e job log. Save `migrate-ci.png`. Pass when it ran `db:migrate`.
- [ ] Lane 7. Follow `docs/remote-setup.md` cutover steps against a Neon branch. Save `migrate-neon-branch.png`. Pass when the journal table has one row and the app boots against it.
- [ ] Lane 8. Grep the repo for `db:push`. Save `migrate-push-scoped.png`. Pass when only the scratch script and its doc line remain.
- [ ] Lane 9. Study one card on the migrated lane. Save `migrate-study.png`. Pass when the answer persists.
- [ ] Lane 10. Run `pnpm build`. Save `migrate-build.png`. Pass when the build completes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Seconds of `db:migrate` on an empty database.
- [ ] Probe. Time three runs at the head. Trunk has `db:push` as the comparable step.
- [ ] Baseline. Record the trunk value first, the `db:push` time.
- [ ] Rule. Head fails when `db:migrate` exceeds 2 times the push time.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 7 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-MIGRATE-review-neon.png`.
- [ ] Record a 30 to 60 second video of the cutover on a Neon branch. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-MIGRATE-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Add indexes, delete rules and drop the dead column (P4-INDEX)

**Depends on.** P4-MIGRATE.

**Files.**

- [ ] Edit `src/server/database/schema.ts`.
- [ ] Create `drizzle/0001_indexes.sql`.
- [ ] Edit `src/server/services/DeckService.ts`, `src/server/endpoints/decksRouter.ts`, `src/server/services/StudyService.ts`.

**Build.**

- [ ] Add indexes on `memoryAids.vocabItemId`, `suggestions(createdById, createdAt)`, `suggestions.status`, `userDecks.deckId`, `userVocabItems.memoryAidId`, `deckVocabItems.vocabItemId`, `vocabItems(disabled, vocabType)`, and a trigram or lower-cased index for the ILIKE search columns.
- [ ] Add `onDelete: "cascade"` to `userVocabItems`, `deckVocabItems`, `userDecks`, `memoryAids` user references. Leave `decks.createdById` without a cascade so a published deck cannot vanish under the learners studying it, and match P4-AUTH's hook, which deletes an authored deck no other learner has saved and refuses the account deletion only when one has.
- [ ] Drop `userDecks.includeConstituents` and its readers.
- [ ] Generate the migration and check it in.

**You see.**

- [ ] `EXPLAIN` on the `/decks` browse query shows index scans, not sequential scans, on `user_decks`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `migrate.test.ts` gains a case that the migration SQL contains each index name. Run `pnpm test migrate`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run `db:migrate` on a trunk-shaped database with data. Save `index-migrate-data.png`. Pass when it applies and row counts are unchanged.
- [ ] Lane 2. `EXPLAIN ANALYZE` the browse query. Save `index-browse-plan.png`. Pass when `user_decks` uses an index scan.
- [ ] Lane 3. `EXPLAIN ANALYZE` the dictionary page's memory-aid lookup. Save `index-aids-plan.png`. Pass when it uses the new index.
- [ ] Lane 4. Delete a test learner via `psql`. Save `index-cascade.png`. Pass when their progress, saved decks and memory aids are gone and their created decks remain.
- [ ] Lane 5. Try deleting a learner who created a deck via the restrict path. Save `index-restrict.png`. Pass when Postgres refuses.
- [ ] Lane 6. Grep for `includeConstituents`. Save `index-column-gone.png`. Pass when zero matches.
- [ ] Lane 7. Save a deck and study one card. Save `index-study.png`. Pass when both persist.
- [ ] Lane 8. Submit three suggestions quickly. Save `index-ratelimit.png`. Pass when the rate limit still trips at the same count as trunk.
- [ ] Lane 9. Search the dictionary for `shui`. Save `index-search.png`. Pass when results match trunk.
- [ ] Lane 10. Run the e2e suite. Save `index-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `decks/browse` via `perf-probe.mjs` with 500 seeded decks and 50 learners.
- [ ] Probe. `perf-probe.mjs --rpc decks/browse --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 is not at least 30 percent below trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 4 and lane 5 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-INDEX-review-cascade.png`.
- [ ] Record a 30 to 60 second video of the migration applying on a data-bearing lane. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-INDEX-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Store progress as one row per study type (P4-PROGRESS)

**Depends on.** P4-INDEX, P3-SESSION.

**Files.**

- [ ] Edit `src/server/database/schema.ts`.
- [ ] Create `drizzle/0002_progress_rows.sql`.
- [ ] Edit `src/server/services/StudyService.ts`, `src/server/study-rules.ts`, `src/server/study-scheduling.ts`, `src/server/decomposition-graph.ts`, `src/definitions/definitions.ts`, `src/app/study/**`, `src/components/study/**`, `src/app/decks/[deckId]/page.tsx`.
- [ ] Edit every test that reads `readingLevel` and friends.

**Build.**

- [ ] Run `pstack:architect` first. Two candidates at least. A new `userStudyProgress(userId, vocabItemId, studyType, level, nextAt)` table replacing the four column pairs, and a JSONB map on the existing row. Record the decision in Appendix B.
- [ ] Write the migration as SQL that copies the four pairs into rows, then drops the columns. The migration is reversible by a checked-in down script.
- [ ] Replace every `${studyType}Level` template with a lookup on the new shape. `weakestServableLevel` and the constituent gate read the new shape.
- [ ] DTOs expose `progress: Record<StudyType, { level, nextAt }>`.

**You see.**

- [ ] `grep -rn 'Level\`' src` prints zero lines and a learner's levels are identical before and after the migration.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `study-rules.test.ts` and `study-scheduling.test.ts` are rewritten on the new shape with the same cases. `migrate.test.ts` gains a case that the copy SQL preserves a fixture of four levels. Run `pnpm test study-rules study-scheduling migrate`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Seed a learner with distinct levels per type at trunk, snapshot via `psql`, migrate. Save `progress-migrate-parity.png`. Pass when every level and `next_at` matches the snapshot.
- [ ] Lane 2. Run the down script and re-run the up. Save `progress-reversible.png`. Pass when the snapshot still matches.
- [ ] Lane 3. Study one card per type. Save `progress-writes.png`. Pass when exactly one row per type changes.
- [ ] Lane 4. Study a character whose component is unknown by sound. Save `progress-gate.png`. Pass when 艮 is served before 很.
- [ ] Lane 5. Open the deck progress panel. Save `progress-panel.png`. Pass when counts match `psql`.
- [ ] Lane 6. Open the deck graph with a depth cut. Save `progress-graph.png`. Pass when levels match trunk for the same deck.
- [ ] Lane 7. Study 亻 with all types on. Save `progress-meaning-only.png`. Pass when only understanding rows exist for it.
- [ ] Lane 8. Answer the same card from two tabs. Save `progress-race.png`. Pass when one row advanced once.
- [ ] Lane 9. Run 20 answers and compare the served order to a trunk lane seeded identically. Save `progress-sequence-parity.png`. Pass when identical. The deck must be built so no two candidates tie on the deterministic keys, because HSK 1 has dozens of ties, the random tiebreak decides them, and whether the drawn item is phonetic changes the next card's study type. P3-RULES measured the head disagreeing with itself across five runs on HSK 1, four distinct sequences, so a tied deck produces false failures.
- [ ] Lane 10. Run the e2e suite. Save `progress-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/getNextVocabItem` via `perf-probe.mjs` on HSK 1 with 500 progress rows.
- [ ] Probe. `perf-probe.mjs --rpc study/getNextVocabItem --n 30` at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 15 percent.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 2 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-PROGRESS-review-parity.png`.
- [ ] Record a 30 to 60 second video of the migration and a study session after it. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-PROGRESS-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Harden security headers (P4-HEADERS)

**Depends on.** P0-E2E.

**Files.**

- [ ] Edit `src/proxy.ts`, `src/app/layout.tsx`, `next.config.ts`.
- [ ] Create `src/server/__tests__/csp.test.ts`.

**Build.**

- [ ] Apply headers to `/api/*` too. Keep `/_next/static` excluded.
- [ ] Generate a per-request nonce, set `script-src 'self' 'nonce-...' 'strict-dynamic'`, drop `unsafe-eval` in production, keep it only when `NODE_ENV` is development. Add `base-uri 'self'`, `form-action 'self'`, `worker-src 'self'`.
- [ ] HSTS `max-age=31536000; includeSubDomains`. Add `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation, `X-Content-Type-Options: nosniff`.

**You see.**

- [ ] `curl -I` on `/` and on `/api/rpc/ping` both show the full header set, and the browser console shows zero CSP violations across every route.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `csp.test.ts` gains cases that the production CSP has no `unsafe-eval`, includes the S3 endpoint in `media-src`, and the header builder is pure. Run `pnpm test csp`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. `curl -I` on `/api/rpc/ping`. Save `headers-api.png`. Pass when CSP, HSTS, nosniff, referrer and permissions headers are present.
- [ ] Lane 2. Run `pnpm build && pnpm start` and load every route with the console open. Save `headers-no-violations.png`. Pass when zero CSP reports.
- [ ] Lane 3. Play audio in production mode. Save `headers-media.png`. Pass when the mp3 loads.
- [ ] Lane 4. Open both graph views in production mode. Save `headers-canvas.png`. Pass when both render.
- [ ] Lane 5. Toggle the theme in production mode. Save `headers-theme-inline.png`. Pass when the theme script runs with the nonce and no violation.
- [ ] Lane 6. Sign in in production mode. Save `headers-auth.png`. Pass when the session cookie is set with Secure and HttpOnly.
- [ ] Lane 7. Attempt to embed the app in an iframe from another origin. Save `headers-frame.png`. Pass when the browser blocks it.
- [ ] Lane 8. Load `/` and read `strict-transport-security`. Save `headers-hsts.png`. Pass when max-age is 31536000.
- [ ] Lane 9. Run the stroke animation. Save `headers-strokes.png`. Pass when it animates with no style violation.
- [ ] Lane 10. Run the e2e suite in production mode. Save `headers-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `GET /` in production mode via `perf-probe.mjs --rpc / --n 30`.
- [ ] Probe. Run at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 5 percent.

**Review gate.** None. P4-HEADERS is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Complete the auth flows (P4-AUTH)

**Depends on.** P4-HEADERS.

**Files.**

- [ ] Edit `src/server/auth.tsx`, `src/server/initialization.ts`, `src/server/services/EmailAdapter.ts`.
- [ ] Create `src/email/PasswordResetEmail.tsx`, `src/email/ChangeEmailEmail.tsx`, `src/email/DeleteAccountEmail.tsx`.
- [ ] Create `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`.
- [ ] Edit `src/app/profile/page.tsx`, `src/app/signin/page.client.tsx`.

**Build.**

- [ ] Register `auth` as a singleton.
- [ ] Configure `sendResetPassword`, change email with verification, and delete account with email confirmation. Each sends a React Email template through `EmailAdapter`. The verification send awaits and logs a rejection instead of `void`.
- [ ] Set `session.expiresIn` to 30 days, `updateAge` to 1 day, `cookieCache` on. Password minimum 10. Per-route rate limits for sign-in, sign-up, forgot-password at 5 per minute.
- [ ] Forgot-password link on sign-in. Change email and delete account on profile, delete behind a confirmation dialog.

**You see.**

- [ ] A learner who forgets a password gets an email in Mailpit, resets, and signs in. Deleting an account removes the user and cascades.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/__tests__/auth-config.test.ts` gains cases that the auth options carry the three senders and the rate-limit rules. Run `pnpm test auth-config`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Request a reset, open the Mailpit link, set a new password, sign in. Save `auth-reset.png`. Pass when the new password works and the old one fails.
- [ ] Lane 2. Change email from profile, confirm via Mailpit. Save `auth-change-email.png`. Pass when the `users` row shows the new email and it is verified.
- [ ] Lane 3. Delete the account with confirmation. Save `auth-delete.png`. Pass when the user row and its progress are gone and the session is cleared.
- [ ] Lane 4. Attempt sign-in six times in a minute with a wrong password. Save `auth-ratelimit.png`. Pass when the sixth is 429.
- [ ] Lane 5. Sign up with a 9-character password. Save `auth-password-min.png`. Pass when the form shows the rule inline.
- [ ] Lane 6. Sign in and read the cookie. Save `auth-session-expiry.png`. Pass when expiry is 30 days out.
- [ ] Lane 7. Stop Mailpit and sign up. Save `auth-send-logged.png`. Pass when the log shows the send failure and the UI shows a retry message.
- [ ] Lane 8. Count `betterAuth` constructions across 50 requests via a log line. Save `auth-singleton.png`. Pass when exactly one.
- [ ] Lane 9. Open the reset link twice. Save `auth-reset-once.png`. Pass when the second use fails.
- [ ] Lane 10. Run the e2e suite. Save `auth-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/getNextVocabItem` via `perf-probe.mjs`, which resolves a session per call.
- [ ] Probe. Run at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 is above trunk. The 10 percent prediction was withdrawn on measurement. Awilix already resolved `auth` once per container scope, so the singleton removes the rebuild between requests rather than within one, against a call dominated by the database. Measured 8.3 percent below trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 3 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-AUTH-review-flows.png`.
- [ ] Record a 30 to 60 second video of reset, change email and delete. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P4-AUTH-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Add error routes, request ids, health and warmup (P4-OBS)

**Depends on.** P3-DECKS.

**Files.**

- [ ] Create `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/instrumentation.ts`, `src/app/api/health/route.ts`.
- [ ] Edit `src/server/endpoints/procedure.ts`, `src/app/api/rpc/[[...rest]]/route.ts`, `src/server/services/VocabService.ts`, `src/server/services/AdminService.ts`, `src/server/services/EmailAdapter.ts`, `src/server/services/SemanticTranslationChecker.ts`, `src/components/error-boundary.tsx`.

**Build.**

- [ ] The three Next error routes render the shared error state with a request id and a retry that resets the query boundary instead of reloading.
- [ ] `loggingMiddleware` mints a request id, binds it to the child logger and returns it in a response header. `RPCHandler` gets `onError` that logs once with the id.
- [ ] `/api/health` checks the database with `select 1` and returns 200 or 503 with no auth.
- [ ] `instrumentation.ts` warms the semantic checker's model at boot in production. `SmtpEmailAdapter` builds its transport once. `AdminService.updateVocabItem` invalidates the decomposition index.
- [ ] Wire `@sentry/nextjs` behind a `SENTRY_DSN` env that is optional, off when unset.

**You see.**

- [ ] A thrown error shows a page with a request id, that id appears in the server log, and `/api/health` answers 200.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `VocabService.test.ts` gains a case that an admin update invalidates the index cache. Run `pnpm test VocabService`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. `curl /api/health`. Save `obs-health.png`. Pass when 200 with the database up and 503 with it stopped.
- [ ] Lane 2. Load `/nope`. Save `obs-404.png`. Pass when the not-found route renders with navigation.
- [ ] Lane 3. Stop Postgres and load `/decks`. Save `obs-error-route.png`. Pass when the error page shows a request id.
- [ ] Lane 4. Grep the log for that request id. Save `obs-request-id.png`. Pass when one line matches.
- [ ] Lane 5. Disable a glyph in `/admin/vocab` and open its parent's graph. Save `obs-index-invalidated.png`. Pass when the glyph is absent immediately.
- [ ] Lane 6. Boot in production mode and time the first wrong understanding answer. Save `obs-warmup.png`. Pass when it grades in under 2 seconds.
- [ ] Lane 7. Send two verification emails. Save `obs-smtp-reuse.png`. Pass when the log shows one transport creation.
- [ ] Lane 8. Set `SENTRY_DSN` to a local sink and throw. Save `obs-sentry.png`. Pass when the event arrives with the request id.
- [ ] Lane 9. Click retry on an error page after restarting Postgres. Save `obs-retry.png`. Pass when the page recovers without a full reload.
- [ ] Lane 10. Run the e2e suite. Save `obs-e2e.png`. Pass when 3 passed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `vocab/search` via `perf-probe.mjs`.
- [ ] Probe. Run at trunk and at the head, interleaved.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds trunk by more than 5 percent.

**Review gate.** None. P4-OBS is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Upgrade the safe majors (P4-UPGRADE)

**Depends on.** P4-OBS.

**Files.**

- [ ] Edit `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs`, `src/email/*.tsx`.

**Build.**

- [ ] Upgrade eslint 10, pino 10, nodemailer 9, react-email 6 and `@react-email/components` 1, awilix 13, lucide-react 1, nanoid 6, `@types/node` 26. One commit per package so a bisect is cheap.
- [ ] Leave TypeScript at 5.9. Record the TypeScript 7 decision in Appendix C.
- [ ] Run `pnpm outdated` and paste the remaining table into the PR body.

**You see.**

- [ ] `pnpm outdated` shows no major behind except TypeScript, and every gate is green.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No new test. Run `pnpm test:ci` and `pnpm lint`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Send a verification email and open it in Mailpit. Save `upgrade-email.png`. Pass when it renders identically to trunk.
- [ ] Lane 2. Load every route and check icons. Save `upgrade-icons.png`. Pass when no icon is missing.
- [ ] Lane 3. Boot and read the first log line. Save `upgrade-pino.png`. Pass when it is valid JSON with `GIT_SHA`.
- [ ] Lane 4. Run `pnpm lint`. Save `upgrade-eslint.png`. Pass when zero errors.
- [ ] Lane 5. Create a deck and read its id. Save `upgrade-nanoid.png`. Pass when the id has the same length as trunk's.
- [ ] Lane 6. Resolve every service from the container at boot. Save `upgrade-awilix.png`. Pass when no resolution error.
- [ ] Lane 7. Run `pnpm build`. Save `upgrade-build.png`. Pass when it completes.
- [ ] Lane 8. Run the e2e suite. Save `upgrade-e2e.png`. Pass when 3 passed.
- [ ] Lane 9. Run `pnpm email` and open the preview. Save `upgrade-email-dev.png`. Pass when all templates render.
- [ ] Lane 10. Run `pnpm audit --prod`. Save `upgrade-audit.png`. Pass when critical and high are 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total Total client chunk bytes attributable to `/`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/` grows by more than 10 kilobytes.

**Review gate.** None. P4-UPGRADE is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Audit the UI against ui-skills and write the checklist (P5-AUDIT)

**Depends on.** P3-SHADCN, P4-PROGRESS.

**Files.**

- [ ] Create `.claude/skills/ui-audit/SKILL.md`.
- [ ] Create `docs/ui-audit.md`.

**Build.**

- [ ] Through the `ui-skills` MCP server, call `get_skill` for `baseline-ui`, `web-design-guidelines`, `fixing-accessibility`, `react-best-practices`, `interaction-design`, and copy the 47 playbook rules. Vendor the rules that apply to a Next and Tailwind app into `.claude/skills/ui-audit/SKILL.md` as a checklist with one line per rule and the selector or grep that checks it.
- [ ] Run one swarm lane per route on the `swarm workers` role. Each lane walks the checklist against its route at desktop and 390 pixels, light and dark, and returns one row per failure with a screenshot.
- [ ] Reconcile into `docs/ui-audit.md`, one row per finding, assigned to P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-A11Y or P5-PERF.

**You see.**

- [ ] `docs/ui-audit.md` lists every finding with a rule id, a route, a screenshot path and a PR.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No product test. Run `pnpm test:ci` to confirm the tree is unchanged.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Replay five random findings. Save `audit-replay-1.png`. Pass when all five reproduce.
- [ ] Lane 2. Replay five more. Save `audit-replay-2.png`. Pass when all five reproduce.
- [ ] Lane 3. Check every screenshot path exists. Save `audit-evidence.png`. Pass when zero missing.
- [ ] Lane 4. Run the checklist's greps from the skill file. Save `audit-greps.png`. Pass when each grep's count matches the findings file.
- [ ] Lane 5. Walk `/study/[deckId]` with the checklist yourself. Save `audit-study-independent.png`. Pass when you find no failure the file lacks.
- [ ] Lane 6. Walk `/decks` with the checklist yourself. Save `audit-decks-independent.png`. Pass when no unlisted failure.
- [ ] Lane 7. Walk `/dictionary` and `/dictionary/[word]`. Save `audit-dictionary-independent.png`. Pass when no unlisted failure.
- [ ] Lane 8. Walk the auth pages. Save `audit-auth-independent.png`. Pass when no unlisted failure.
- [ ] Lane 9. Walk the admin pages. Save `audit-admin-independent.png`. Pass when no unlisted failure.
- [ ] Lane 10. Count findings per PR. Save `audit-assignment.png`. Pass when every row names exactly one P5 PR.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total Total client chunk bytes attributable to `/`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the value differs from trunk by more than 0 kilobytes, since this PR must not change product code.

**Review gate.** None. P5-AUDIT is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Fix the app shell for mobile and keyboard (P5-SHELL)

**Depends on.** P5-AUDIT.

**Files.**

- [ ] Edit `src/components/header.tsx`, `src/components/footer.tsx`, `src/app/layout.tsx`, `src/components/theme-toggle.tsx`, `src/app/privacy/page.tsx`, `src/app/resources/page.tsx`.
- [ ] Create `src/components/mobile-nav.tsx` using `ui/sheet` via `npx shadcn@latest add sheet`.

**Build.**

- [ ] Below `sm` the nav becomes a sheet opened by a labelled button. Add a skip link to main. Give the nav an `aria-label`.
- [ ] Split the header so the session-dependent part is the only client component. Remove `force-dynamic` from the root layout and set it on the routes that need it.
- [ ] Touch targets at 44 pixels, focus rings visible, sentence case labels, per the audit rows assigned here.

**You see.**

- [ ] At 390 pixels a signed-in learner can reach Study, Decks, Dictionary and Admin from the menu, and `/privacy` is statically rendered in the build table.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/mobile-nav.spec.ts` gains a case that opens the sheet at 390 pixels and navigates to Decks. Run `pnpm test-e2e -g mobile`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. At 390 pixels, open the menu and tap Study. Save `shell-mobile-nav.png`. Pass when `/study` loads.
- [ ] Lane 2. Tab from the top of `/`. Save `shell-skip-link.png`. Pass when the first focus is the skip link and Enter lands on main.
- [ ] Lane 3. Tab through the header. Save `shell-focus-rings.png`. Pass when every control shows a ring.
- [ ] Lane 4. Read the build table. Save `shell-static-routes.png`. Pass when `/privacy` and `/resources` are static.
- [ ] Lane 5. Toggle the theme at 390 pixels. Save `shell-theme-mobile.png`. Pass when the icon swaps without flash.
- [ ] Lane 6. Measure the menu button. Save `shell-touch-target.png`. Pass when at least 44 by 44.
- [ ] Lane 7. Load `/` signed out at 390 pixels. Save `shell-signed-out-mobile.png`. Pass when sign in and sign up are reachable.
- [ ] Lane 8. Open the sheet and press Escape. Save `shell-sheet-escape.png`. Pass when it closes and focus returns to the button.
- [ ] Lane 9. Load every route in dark mode at 390 pixels. Save `shell-dark-mobile.png`. Pass when no horizontal scroll.
- [ ] Lane 10. Run the e2e suite. Save `shell-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/privacy`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/privacy` is not at least 10 kilobytes below trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 9 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-SHELL-review-mobile.png`.
- [ ] Record a 30 to 60 second video of the mobile nav. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-SHELL-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Improve the study session experience (P5-STUDY-UX)

**Depends on.** P5-AUDIT.

**Files.**

- [ ] Edit `src/app/study/[deckId]/page.tsx`, `src/components/study/*.tsx`, `src/lib/audio.ts`, `src/components/character-strokes.tsx`, `src/components/decomposition-graph.tsx`, `src/app/globals.css`.
- [ ] Create `src/components/hanzi.tsx`.

**Build.**

- [ ] Session header with deck name, cards done this session, and an exit link. Keyboard hint for Give up.
- [ ] Result card shows level before and after. Audio button shows a pending state and a play-again affordance when autoplay is blocked.
- [ ] `<Hanzi>` component sets `lang="zh"` and the hanzi font. Every hanzi span uses it.
- [ ] Stroke animation and graph layout respect `prefers-reduced-motion`. Entrances use ease-out and start near full scale, per the playbook rules assigned here.

**You see.**

- [ ] A session shows "HSK 1, 4 done" at the top, the result card reads "Level 2 to 3", and a screen reader announces hanzi in Chinese.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `study-session.test.ts` gains a case that the reducer counts answered cards. Run `pnpm test study-session`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Answer four cards. Save `studyux-header.png`. Pass when the header reads 4 done and the deck name.
- [ ] Lane 2. Click exit mid-session. Save `studyux-exit.png`. Pass when the deck page loads.
- [ ] Lane 3. Answer a card correctly. Save `studyux-before-after.png`. Pass when both levels show.
- [ ] Lane 4. Load a listening card with autoplay blocked. Save `studyux-autoplay.png`. Pass when a play button appears instead of a toast.
- [ ] Lane 5. Inspect a hanzi element. Save `studyux-lang.png`. Pass when `lang="zh"` is set.
- [ ] Lane 6. Enable reduced motion and open a writing card. Save `studyux-reduced-motion.png`. Pass when strokes render complete without animation.
- [ ] Lane 7. Press the Give up shortcut. Save `studyux-shortcut.png`. Pass when the hint matches the key that works.
- [ ] Lane 8. Play a session at 390 pixels. Save `studyux-mobile.png`. Pass when the header and card fit without scroll.
- [ ] Lane 9. Run through the audit rows assigned here. Save `studyux-audit-closed.png`. Pass when none reproduce.
- [ ] Lane 10. Run the e2e suite. Save `studyux-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/study/[deckId]`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the route grows by more than 5 kilobytes.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 3 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-STUDY-UX-review-session.png`.
- [ ] Record a 30 to 60 second video of a session. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-STUDY-UX-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Rebuild the auth forms (P5-FORMS)

**Depends on.** P5-AUDIT, P4-AUTH.

**Files.**

- [ ] Edit `src/app/signin/page.client.tsx`, `src/app/signup/page.client.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/decks/new/page.tsx`.

**Build.**

- [ ] Visible labels, `autoComplete` on every field, inline errors beside fields, password rules shown before they trip, and no minimum-length rule on the sign-in password.
- [ ] Auth failure renders inline, not as a toast. The create-deck page guards auth server-side, not with an effect race.

**You see.**

- [ ] A wrong password shows "Wrong email or password" under the form, and a browser password manager fills both fields.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/sign-in.spec.ts` gains a case for the inline error. Run `pnpm test-e2e -g sign-in`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Sign in with a wrong password. Save `forms-inline-error.png`. Pass when the error is under the form, no toast.
- [ ] Lane 2. Inspect the sign-in inputs. Save `forms-autocomplete.png`. Pass when `autocomplete` is `email` and `current-password`.
- [ ] Lane 3. Type a weak password on sign-up. Save `forms-password-rules.png`. Pass when the rule list updates live.
- [ ] Lane 4. Sign in with a 6-character legacy password. Save `forms-signin-no-min.png`. Pass when the request is sent.
- [ ] Lane 5. Submit sign-up empty. Save `forms-labels-errors.png`. Pass when each field has a visible label and an error beneath.
- [ ] Lane 6. Open `/decks/new` signed out. Save `forms-deck-guard.png`. Pass when it redirects with no flash of the form.
- [ ] Lane 7. Complete forgot-password. Save `forms-forgot.png`. Pass when the confirmation renders inline.
- [ ] Lane 8. Use the forms with the keyboard only. Save `forms-keyboard.png`. Pass when every control is reachable in order.
- [ ] Lane 9. Load all auth pages at 390 pixels in dark mode. Save `forms-mobile-dark.png`. Pass when no overflow and readable contrast.
- [ ] Lane 10. Run the e2e suite. Save `forms-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/signin`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/signin` grows by more than 5 kilobytes.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 3 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-FORMS-review-auth.png`.
- [ ] Record a 30 to 60 second video of sign-up and sign-in. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-FORMS-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Give every route real loading, empty and error states (P5-STATES)

**Depends on.** P5-AUDIT.

**Files.**

- [ ] Edit `src/app/decks/[deckId]/page.tsx`, `src/app/dictionary/[word]/page.tsx`, `src/app/dictionary/page.tsx`, `src/app/decks/page.tsx`, `src/app/profile/page.tsx`, `src/app/verified/page.tsx`, `src/app/decks/new/page.tsx`, `src/components/error-boundary.tsx`, `src/components/view-all-memory-aids-dialog.tsx`.
- [ ] Create `src/components/skeletons/*.tsx`.

**Build.**

- [ ] Structural skeletons matching each page's content replace spinners. Every page has an error state with a retry through `QueryErrorResetBoundary`. An unknown dictionary word renders the not-found route.
- [ ] Every empty state has one action. Dictionary and deck search and page live in the URL. Dictionary gets the pagination the server already supports.

**You see.**

- [ ] `/dictionary?q=水&page=2` reloads to the same results, and a bad word shows "No entry for zzz" with a search link.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/__tests__/search-params.test.ts` gains cases for parsing and serialising the query and page. Run `pnpm test search-params`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Load `/dictionary?q=水&page=2` cold. Save `states-url-search.png`. Pass when page 2 of 水 results renders.
- [ ] Lane 2. Use the back button after a search. Save `states-back.png`. Pass when the previous query restores.
- [ ] Lane 3. Load `/dictionary/zzz`. Save `states-word-404.png`. Pass when the not-found state renders with a search link.
- [ ] Lane 4. Stop Postgres and load `/decks/<id>`. Save `states-deck-error.png`. Pass when an error state with retry renders.
- [ ] Lane 5. Restart Postgres and click retry. Save `states-retry.png`. Pass when the page recovers without reload.
- [ ] Lane 6. Throttle the network and load `/decks`. Save `states-skeleton.png`. Pass when the skeleton matches the card grid shape.
- [ ] Lane 7. Sign in as a learner with no saved decks and open `/study`. Save `states-empty-action.png`. Pass when one action leads to `/decks`.
- [ ] Lane 8. Open the view-all dialog with Postgres stopped. Save `states-dialog-error.png`. Pass when it shows an error, not "No memory aids".
- [ ] Lane 9. Load `/profile` signed out. Save `states-profile-guard.png`. Pass when it redirects to sign in.
- [ ] Lane 10. Run the e2e suite. Save `states-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/dictionary`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/dictionary` grows by more than 5 kilobytes.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 3 and lane 6 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-STATES-review-states.png`.
- [ ] Record a 30 to 60 second video of the dictionary with URL state and the error retry. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-STATES-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Replace the fake dashboard with real stats (P5-HOME)

**Depends on.** P5-AUDIT.

**Files.**

- [ ] Edit `src/app/page.tsx`, `src/server/endpoints/studyRouter.ts`, `src/server/services/StudyService.ts`, `src/definitions/definitions.ts`.

**Build.**

- [ ] Add `study.dashboard` returning items learned, items due today, current streak, and the next deck to study, from `userStudyProgress` and `userDecks`.
- [ ] The home page renders those through `StatTile` for a signed-in learner and a landing page for a visitor. The stale `dashboard-real-stats` worktree is gone, so this starts from scratch.

**You see.**

- [ ] A learner with 12 items at level 1 or above and 3 due sees "12 learned" and "3 due today", and a visitor sees the landing page.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/server/__tests__/streak.test.ts` gains cases that a streak counts consecutive days with an answer and breaks on a gap. Run `pnpm test streak`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Seed a learner with known progress and load `/`. Save `home-stats.png`. Pass when the tiles match `psql` counts.
- [ ] Lane 2. Answer three cards and reload. Save `home-stats-update.png`. Pass when due drops by three.
- [ ] Lane 3. Load `/` signed out. Save `home-landing.png`. Pass when the landing page renders with no stats.
- [ ] Lane 4. Seed answers on two consecutive days. Save `home-streak-2.png`. Pass when the streak reads 2.
- [ ] Lane 5. Seed a gap. Save `home-streak-broken.png`. Pass when the streak reads 0 or 1 per the rule.
- [ ] Lane 6. Load `/` with no saved decks. Save `home-empty.png`. Pass when the tiles read 0 and the action leads to `/decks`.
- [ ] Lane 7. Load `/` at 390 pixels. Save `home-mobile.png`. Pass when tiles stack without overflow.
- [ ] Lane 8. Grep the page for the old literals. Save `home-no-fake.png`. Pass when "5 day streak" and the hard-coded numbers are gone.
- [ ] Lane 9. Load `/` in dark mode. Save `home-dark.png`. Pass when no white background.
- [ ] Lane 10. Run the e2e suite. Save `home-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 milliseconds of `study/dashboard` via `perf-probe.mjs` with 500 progress rows.
- [ ] Probe. Run at the head 30 times, three rounds. Trunk has no equivalent, so trunk's probe is `study/getDeckProgress`.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when p50 exceeds 100 milliseconds.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 3 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-HOME-review-home.png`.
- [ ] Record a 30 to 60 second video of the dashboard updating after answers. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-HOME-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Close the accessibility findings (P5-A11Y)

**Depends on.** P5-SHELL, P5-STUDY-UX, P5-FORMS, P5-STATES, P5-HOME, P5-PERF.

**Files.**

- [ ] Edit the files each remaining accessibility row in `docs/ui-audit.md` names.
- [ ] Create `e2e/a11y.spec.ts`.

**Build.**

- [ ] Fix every row assigned here. Colour-only status gets text or an icon. Icon-only buttons get labels. The dictionary row becomes a link. Muted text meets contrast. Opacity on `color-mix` tokens is replaced.
- [ ] Add `@axe-core/playwright` and an e2e spec that runs axe on every route and fails on serious or critical violations.

**You see.**

- [ ] `pnpm test-e2e -g a11y` reports zero serious or critical violations on every route.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/a11y.spec.ts` is the unit. Run `pnpm test-e2e -g a11y`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run axe on `/`. Save `a11y-home.png`. Pass when zero serious.
- [ ] Lane 2. Run axe on `/study/[deckId]` mid-card. Save `a11y-study.png`. Pass when zero serious.
- [ ] Lane 3. Run axe on `/dictionary/人`. Save `a11y-dictionary.png`. Pass when zero serious.
- [ ] Lane 4. Run axe on `/decks` and a deck page. Save `a11y-decks.png`. Pass when zero serious.
- [ ] Lane 5. Run axe on the admin pages. Save `a11y-admin.png`. Pass when zero serious.
- [ ] Lane 6. Navigate the study session with VoiceOver on. Save `a11y-voiceover.png`. Pass when hanzi is read in Chinese and the result is announced.
- [ ] Lane 7. Tab through `/dictionary` results. Save `a11y-row-links.png`. Pass when rows are focusable links.
- [ ] Lane 8. Check suggestion status pills. Save `a11y-status-text.png`. Pass when each has a text label.
- [ ] Lane 9. Measure muted text contrast in dark mode. Save `a11y-contrast.png`. Pass when at least 4.5 to 1.
- [ ] Lane 10. Run the full e2e suite. Save `a11y-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total Total client chunk bytes attributable to `/`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/` grows by more than 3 kilobytes.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 6 and lane 7 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-A11Y-review-a11y.png`.
- [ ] Record a 30 to 60 second video of keyboard-only navigation through a session. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P5-A11Y-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Cut client bundle weight (P5-PERF)

**Depends on.** P5-AUDIT.

**Files.**

- [ ] Edit `src/components/vocab-entry.tsx`, `src/app/decks/[deckId]/page.tsx`, `src/lib/orpc.client.tsx`, `src/app/decks/page.tsx`, `src/lib/audio.ts`, `src/lib/queryClient.ts`.

**Build.**

- [ ] Dynamic-import the two graph panels so `d3-force` loads only on the Graph tab. Devtools only in development.
- [ ] Replace the 100-row saved-decks query with a `savedDeckIds` field on the browse response. Reuse one `Audio` element and preload the next card's audio.
- [ ] Retry once on network errors instead of never.

**You see.**

- [ ] The Details view of `/dictionary/[word]` ships no `d3-force` chunk, and switching to Graph loads it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/__tests__/audio.test.ts` gains a case that the same element is reused across plays. Run `pnpm test audio`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Load `/dictionary/人` and list loaded chunks. Save `perf-no-d3.png`. Pass when no chunk contains `d3-force`.
- [ ] Lane 2. Switch to Graph. Save `perf-d3-lazy.png`. Pass when a new chunk loads and the graph renders.
- [ ] Lane 3. Load `/decks` and count requests. Save `perf-one-browse.png`. Pass when one RPC call serves the grid and the Saved badges.
- [ ] Lane 4. Load any page in production mode. Save `perf-no-devtools.png`. Pass when no devtools chunk loads.
- [ ] Lane 5. Play three listening cards. Save `perf-audio-reuse.png`. Pass when the network tab shows the next mp3 preloaded before its card.
- [ ] Lane 6. Kill the network for one request and restore. Save `perf-retry.png`. Pass when the query recovers on its own once.
- [ ] Lane 7. Load `/study/[deckId]`. Save `perf-study-chunks.png`. Pass when no `d3-force` chunk loads until Graph is opened.
- [ ] Lane 8. Load `/decks/<id>` and open Graph. Save `perf-deck-graph.png`. Pass when the graph renders.
- [ ] Lane 9. Run Lighthouse on `/dictionary/人` in production mode. Save `perf-lighthouse.png`. Pass when performance is at least 90.
- [ ] Lane 10. Run the e2e suite. Save `perf-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/dictionary/[word]`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head, twice each.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when the route is not at least 40 kilobytes below trunk.

**Review gate.** None. P5-PERF is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Rewrite the docs to match the code (P6-DOCS)

**Depends on.** P5-A11Y.

**Files.**

- [ ] Edit `CLAUDE.md`, `README.md`, `STUDY_FLOW.md`, `FUTURE_ADDITIONS.md`, `docs/remote-setup.md`.
- [ ] Create `docs/components-and-phonetics.md`, `docs/decomposition-graphs.md`, `docs/classification-backfills.md`, `.env.example`, `AGENTS.md`.
- [ ] Delete `WIREFRAMES.md`.

**Build.**

- [ ] Move the essay sections of CLAUDE.md into the three docs files and leave a one-line pointer each. Fix the service list, router list, script list, Doppler, s3mock and OKLCH claims. Cut the generic testing boilerplate to the repo-specific rules.
- [ ] `AGENTS.md` becomes a two-line file pointing at CLAUDE.md. README loses the create-next-app tail and gains the Doppler and lane recipes. STUDY_FLOW.md matches the reducer and the rules modules. FUTURE_ADDITIONS.md drops shipped items.
- [ ] `.env.example` lists every variable in `envSchema` with a comment.
- [ ] Write under `/technical-writing`, then `/unslop` every file.

**You see.**

- [ ] CLAUDE.md is under 400 lines and every command it names runs as written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/__tests__/env-example.test.ts` gains a case that `.env.example` names every key in `envSchema`. Run `pnpm test env-example`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Run every command in CLAUDE.md's Development Commands section. Save `docs-commands-run.png`. Pass when each exits 0.
- [ ] Lane 2. Follow README from clone to first page load on a fresh machine profile. Save `docs-readme-fresh.png`. Pass when `/` renders.
- [ ] Lane 3. Compare CLAUDE.md's container list to `initialization.ts`. Save `docs-container-list.png`. Pass when identical.
- [ ] Lane 4. Compare the router list to `router.ts`. Save `docs-router-list.png`. Pass when identical.
- [ ] Lane 5. Copy `.env.example` to `.env.lane` with lane values and boot. Save `docs-env-example.png`. Pass when the app boots.
- [ ] Lane 6. Read STUDY_FLOW.md against `study-session.ts` and `study-scheduling.ts`. Save `docs-study-flow.png`. Pass when no described behavior contradicts the code.
- [ ] Lane 7. Run the unslop checklist over each changed file. Save `docs-unslop.png`. Pass when zero flagged patterns.
- [ ] Lane 8. Grep the repo for `MinIO` and `oklch`. Save `docs-stale-terms.png`. Pass when zero matches outside git history.
- [ ] Lane 9. Open `AGENTS.md`. Save `docs-agents-pointer.png`. Pass when it is two lines.
- [ ] Lane 10. Run the e2e suite. Save `docs-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Line count of CLAUDE.md.
- [ ] Probe. `wc -l CLAUDE.md` at trunk and at the head.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when CLAUDE.md exceeds 400 lines.

**Review gate.** None. P6-DOCS is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene`.

## Publish the privacy policy and terms (P6-LEGAL)

**Depends on.** P5-SHELL.

**Files.**

- [ ] Edit `src/app/privacy/page.tsx`, `src/components/footer.tsx`.
- [ ] Create `src/app/terms/page.tsx`.

**Build.**

- [ ] Draft a privacy policy that names what is stored, users, sessions, study progress, suggestions, emails sent, the processors, Neon, Cloudflare R2, DeepL, the email provider, Vercel, and the deletion path from P4-AUTH. Draft terms covering account, acceptable use, and content ownership for memory aids and suggestions.
- [ ] Both pages render statically. The footer links both. Sign-up links to both.

**You see.**

- [ ] `/privacy` and `/terms` render real text, and the sign-up form links to both.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] No logic. Run `pnpm test:ci` and `pnpm lint`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Load `/privacy`. Save `legal-privacy.png`. Pass when the placeholder text is gone.
- [ ] Lane 2. Load `/terms`. Save `legal-terms.png`. Pass when the page renders.
- [ ] Lane 3. Read the build table. Save `legal-static.png`. Pass when both routes are static.
- [ ] Lane 4. Open the footer on every route. Save `legal-footer.png`. Pass when both links are present.
- [ ] Lane 5. Open sign-up. Save `legal-signup-links.png`. Pass when both links are present.
- [ ] Lane 6. Grep the privacy text for each processor name. Save `legal-processors.png`. Pass when every processor in `envSchema`'s services is named.
- [ ] Lane 7. Follow the deletion path described in the policy. Save `legal-deletion-path.png`. Pass when it matches P4-AUTH's flow.
- [ ] Lane 8. Load both pages at 390 pixels. Save `legal-mobile.png`. Pass when line length stays readable.
- [ ] Lane 9. Load both in dark mode. Save `legal-dark.png`. Pass when contrast is readable.
- [ ] Lane 10. Run the e2e suite. Save `legal-e2e.png`. Pass when all specs pass.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total client chunk bytes attributable to `/privacy`, measured from a clean production build, because Next 16.3 with Turbopack no longer prints a First Load JS column.
- [ ] Probe. `pnpm build` at trunk and at the head.
- [ ] Baseline. Record the trunk value first.
- [ ] Rule. Head fails when `/privacy` grows by more than 2 kilobytes.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 2 screenshots into `/Users/smurphnerd/projects/hanzimind-evidence/review/P6-LEGAL-review-pages.png`.
- [ ] Record a 30 to 60 second video scrolling both pages. Save it as `/Users/smurphnerd/projects/hanzimind-evidence/review/P6-LEGAL-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The owner squash-merges its own PR into `hygiene` after the operator's click.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype ran before this plan. Every open question was settled by reading the code, and the three that were not, i18n, the progress row shape, and where ui-skills lives, were product calls the operator answered in chat on 2026-09-03. English only, one row per study type, and ui-skills is the MCP server now registered at user scope.

Stays unproven until P4-PROGRESS's architect run. Whether a separate progress table beats a JSONB map on the existing row. The plan assumes the table.

Stays unproven until P0-VERIFY. Whether Doppler's dev config points at a remote Neon branch. No hanzimind Postgres container was running at survey time, which suggests it does. The lane recipe sidesteps this by never using Doppler.

## Appendix B. Alternatives rejected

Landing on `main` with autopilot-full. Vercel deploys `main`, so an owner's merge would be a production deploy. The `hygiene` integration branch keeps owner merges off production and gives the operator one merge per phase to review.

Autopilot-stack with Graphite. Graphite is not installed and 34 PRs in one linear stack would serialise work that is mostly parallel within a phase.

Refactoring before deleting. Every P3 diff would carry dead code through review. P1 first makes P3 smaller.

Keeping `next-intl`. The operator confirmed English only. Deleting it removes a dependency with zero imports and the temptation to half-adopt it.

Fixing the survey's seed bugs before the hunt. The hunt would then have less to confirm and its feature-map corrections would lag. P2-HUNT confirms the seeds and the fix PRs follow with pinned tests.

A JSONB progress map instead of rows. Kept as the second architect candidate in P4-PROGRESS. Rows index and cascade better, and the gate query reads one column.

P3-RULES rejected a bare `compareCandidates`. The comparator is the wrong seam, for the reason the build
box gives. Recorded here because two independent design candidates reached it separately, and the
second was briefed to argue against it.

P3-RULES rejected a grading strategy table keyed by study type, in favour of a `switch` with an
exhaustiveness guard. The table's only real win is that today's `if / else if / else // writing`
silently grades a fifth study type as writing. A `switch` with a `never` default buys that at
none of the cost. A uniform grader context hands `checker` to three branches that never call it
and makes three synchronous branches return promises.

P3-RULES rejected fusing grading and scheduling into one entry point. It orders the timestamp
after the checker resolves, which is worth having, but a caller gets that by writing two obvious
lines, and fusing costs the cheapest test in the PR. `nextReviewAt(3, true, now)` is a one-line
assertion, while the same check through a fused entry point needs a card, a checker stub, a
synonym set and an answer engineered to grade correct.

A full CSP nonce rollout in P0. Deferred to P4-HEADERS because a broken CSP blocks every lane and the e2e suite must exist first to catch it.

TypeScript 7 in P4-UPGRADE. A compiler port with a separate migration guide. Deferred to its own program.

## Appendix C. Risks

P0-VERIFY. Doppler's dev config may point at a shared remote database. A lane that reuses it would corrupt the operator's data. The lane recipe uses local Docker only and the doctor check refuses a `DATABASE_URL` without `localhost`.

P0-SEC. A better-auth minor bump can change cookie or session shape and sign every learner out. The owner reads the changelog between the two versions and lane 3 proves sign-in.

P2-HUNT. Lanes may file duplicates or non-bugs. The reconcile step dedupes and each fix PR reproduces before fixing. A non-bug is closed with a reason in the findings file.

P3-STUDY-SVC. The served-card order is the product. Lane 9 of P3-RULES and P3-STUDY-SVC compares 20-card sequences against a trunk lane seeded identically, over a deck with no ties. A drift fails the PR.

P4-MIGRATE. Marking the baseline applied on production is a one-way step. The operator runs it by hand from the doc after the review gate, on a Neon branch first.

P4-PROGRESS. A data migration on production progress. The down script is checked in and lane 2 proves it round-trips. The operator takes a Neon branch snapshot before applying.

P4-HEADERS. A strict CSP can break audio, canvas, or the theme script in production only. Lanes 2 to 5 run in production mode, not dev.

P4-AUTH. Delete account cascades. Lane 3 and P4-INDEX lane 4 prove the cascade shape before this ships.

P5-PERF. Dynamic imports can flash an empty panel. Lane 2 checks the graph renders after the chunk loads. Any flash is a finding for P5-STATES's skeletons.

P6-LEGAL. The drafted text is not legal advice. The operator reads both pages in full at the review gate.

Every P5 PR. Visual changes are the operator's taste. The review gate exists for that.

## Appendix D. Links and reading list

Read before editing. `docs/hygiene-survey.md` for every pointer this plan cites. `CLAUDE.md` in full, especially the component and phonetic rules, since P3 and P4 touch the gate. `STUDY_FLOW.md` for the intended session shape. `docs/remote-setup.md` before P4-MIGRATE.

`skills/how/SKILL.md` runs before P3-RULES, P3-STUDY-SVC, P3-DECKS and P4-PROGRESS. `skills/interrogate/SKILL.md` runs on P4-PROGRESS and P4-HEADERS before merge-ready. `skills/blast-radius/SKILL.md` runs on P1-DEAD, P3-STUDY-SVC and P4-INDEX.

The ui-skills registry is reachable through the `ui-skills` MCP server's `list_skills` and `get_skill` tools, and by `npx ui-skills get <slug>`. P5-AUDIT vendors what it uses.

The trail per `skills/show-me-your-work/SKILL.md` lives at `/Users/smurphnerd/projects/hanzimind-evidence/decisions.tsv`, one row per decision, not committed.
