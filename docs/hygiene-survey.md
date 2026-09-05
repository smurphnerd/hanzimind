# Hygiene survey, 2026-09-03

Read-only survey of the codebase before the hygiene program. Three lanes: server, client, infra. Every path is relative to the repo root. Line numbers are as of commit 0de207a.

## Server

### Giant files and functions

- `src/server/services/StudyService.ts:539-806` `getNextVocabItem` (268 lines). Seams: deck+progress query (568-619), candidate scoring/sort (636-727, pure), per-study-type DTO shaping (732-796). Pulls `strokes`/`strokeMedians`/`strokeMatches` JSONB for every deck row to serve one card (584-586).
- `StudyService.ts:359-537` `processAnswer` (179 lines) mixes grading (446-491, pure candidate) with persistence and an on-demand row insert (401-426).
- `StudyService.ts:808-948` `getUserVocabItem`: 60 lines of hand-copied column list and DTO mapping already done in `toVocabItemDto` (`VocabService.ts:53-78`) and again at 734-760.
- `StudyService.ts:309-357` `getNextReviewTime`: 6-case switch over `constants.ts:50-71` keys `LEVEL_0..5`. A table lookup.
- `VocabService.ts:410-480` `addVocabItem` recursive, side effects (TTS + S3 at 453) before the DB write, no transaction.

### Duplicated logic and one-caller wrappers

- Deck-item backfill copied verbatim: `StudyService.ts:176-204` vs `251-277`. `updateDeckSettings` (214-285) is `addDeck` (128-212) minus the upsert; `addDeck` already handles re-save via `onConflictDoUpdate`.
- Enabled-study-type derivation duplicated: `StudyService.ts:556-561` and `998-1006`.
- Deck header select block three times: `DeckService.ts:102-113`, `139-150`, `264-281`.
- LIKE-escape duplicated `VocabService.ts:498-501` and `AdminService.ts:85-87`; missing in `DeckService.ts:89-90` (raw `%${search}%`).
- `getNumLearnersSubquery()` evaluated twice per row (`DeckService.ts:110`, `123`).
- Study join column lists duplicated: `StudyService.ts:569-598` vs `1013-1031`.
- One-caller wrappers: `VocabService.getVocabItemPartsDeep` (544-549, only `decksRouter.ts:86`), `getVocabItemPartsDeepRecursive` (551-574), `getStoredVocabItems` + `getExistingVocabItems` (372-408) same query, one predicate toggled.
- `AdminService.setVocabType` (256-279) has no caller.
- Every script hand-rolls `pino(...)` and env parsing: `backfill-admin-roles.ts:29`, `backfill-book-memory-aids.ts:82`, `backfill-classification.ts:63`, `backfill-etymology-roles.ts:36`, `classify-vocab.ts:56`, `seed-hsk1-deck.ts:55`, `regenerate-audio.ts:41`, `seed-preview.ts:123`, `migrate-audio-urls.ts:25`, `seed/index.ts:20`.

### Dead code and dependencies (grep-verified)

- Zero imports: `cheerio`, `@types/cheerio`, `bufferutil`, `utf-8-validate`, `next-intl`, `sass`, `@tailwindcss/typography`, `jsdom`, `@next/env`, `@iconify/json`, `@iconify/tailwind4`, `testcontainers`, `@testcontainers/postgresql`.
- Wrong section (in `dependencies`): `vitest`, `prettier`, `prettier-plugin-tailwindcss`, `@tanstack/react-query-devtools`.
- TTS: only `GoogleTTSAPIProvider` is wired (`initialization.ts:104`, `seed/index.ts:48`). `tts/MsEdgeTTSProvider.ts`, `tts/GoogleTTSProvider.ts`, `src/types/node-gtts.d.ts` unreachable; `msedge-tts` and `node-gtts` go with them. `node-gtts` is the source of the critical `request`/`form-data` audit chain.
- `package.json:18` `test-e2e` runs Playwright; no Playwright dep, config, or `e2e/` dir.
- Unreferenced file: `src/lib/orpc.server.tsx`.
- Exported, zero non-test importers: `procedure.ts:38` `authMiddleware`; `database.ts:60` `Transaction`; `EmailAdapter.ts:8` `SendEmailArgs`; `definitions.ts:3` `studyTypeValues`, `:9` `StudyTypeEnum`, `:41` `EtymologyTypeEnum`, `:353` `UserDeckDto`, `:415`/`:426` `*Values` arrays; `lib/text-match.ts:18` `editDistance`, `:59` `typoTolerance`; `lib/pinyin.ts:72`/`:78` `canonicalPinyin*`; `lib/sounds.ts:86`/`:103`; `lib/growth.ts:1`/`:9`, `lib/vocab-type.ts:12`, `lib/graph-palette.ts:16`.
- `src/server/admin-access.ts` and `ADMIN_EMAILS` (`env-utils.ts:48`) used only by `scripts/backfill-admin-roles.ts`.
- `userDecks.includeConstituents` forced `true` on every write (`StudyService.ts:155,166,236`) yet read and shipped (`DeckService.ts:276`, `decksRouter.ts:26`).

### Boundary discipline

- `vocab.search` has no `.output()` (`vocabRouter.ts:55-59`). `decks.create` returns a bare object and does not cap `vocabList` length or `deckName`/`description` (`decksRouter.ts:41-46`).
- `vocab.search` and `vocab.get` allow `pageSize` up to 10000 (`vocabRouter.ts:16,29`).
- `StudyAnswerDto` carries `userId` and `deckId` from the client (`definitions.ts:290-300`); server ignores `userId`; `deckId` sent twice (`studyRouter.ts:83`).
- Business logic in a router: `decksRouter.ts:40-146` does vocab creation, part expansion, and a transaction against `schema`.
- Env read outside `src/env.ts`: `initialization.ts:61`, `drizzle.config.ts:10`, `seed/index.ts:15`, `migrate-audio-urls.ts:12`, `scripts/seed-preview.ts:121`, `scripts/assess-remote.ts:27,30,34`, `scripts/backfill-*.ts`. Only `VERCEL_GIT_COMMIT_SHA` (`src/env.ts:12`) is outside the schema.
- Two zod entrypoints: `zod` in routers, `zod/v4` in `definitions.ts:1` and `env-utils.ts:1`.

### Auth and authz

- `auth` registered transient (`initialization.ts:80-86`); `procedure.ts:40`, `vocabRouter.ts:39`, `api/auth/[...all]/route.ts:6` build a fresh `betterAuth(...)` per request.
- `processAnswer` inserts a `userVocabItems` row for any `vocabItemId` (`StudyService.ts:401-409`) with no deck-membership check; `addSynonym` likewise (291-307). `submitAnswer` never checks `vocabItemId` belongs to `deckId` (`studyRouter.ts:82-109`).
- `decks.getById`/`decks.graph` (`decksRouter.ts:171-201`) no ownership check (public by design); `decks.graph` on unknown id returns empty graph, not 404.
- Admin router fully gated by `adminProcedure` (`procedure.ts:67-79`). Admin plugin also exposes `/api/auth/admin/*` (ban, set-role, impersonate).

### Error handling

- Catch-all to `NOT_FOUND`: `vocabRouter.ts:46-52`, `76-82`, `decksRouter.ts:177-184`.
- Raw `error.message` to clients: `vocabRouter.ts:100-107`, `studyRouter.ts:127-133`, `adminRouter.ts:96-104,160-168,186-194,215-223`. `suggestionsRouter.ts:46-59` fixed this pattern; others not updated.
- Log-and-rethrow in `StudyService.ts:206,279,531,797,939,1072`, `VocabService.ts:471` while `loggingMiddleware` (`procedure.ts:17-36`) logs again. Every service error logged twice.
- Identity wrappers with no logging: `S3StorageAdapter.ts:56,128,150`, `EmailAdapter.ts:41,76`, `TranslatorService.ts:34-39`.
- Fire-and-forget email, no rejection handler: `auth.tsx:46`.
- `console.log` in server code: `seed/index.ts:12,18,29,82`, `migrate-audio-urls.ts:9,16,19,112`.
- `constants.ts:24-34` doc says JACCARD is 0.6, value is 0.2.

### Test coverage gaps

- `getNextReviewTime` (309-357) and grading branch of `processAnswer` (446-491): private/inline. Extract as pure functions; assert level 3 + correct gives level 4 and `LEVEL_3` offset, wrong gives 0 + `INCORRECT`; understanding accepts a stored synonym before the checker.
- `getNextVocabItem` candidate sort (719-727): extract comparator; assert due-before-new, then level, then type priority.
- `SemanticTranslationChecker` / `CompositeTranslationChecker` (`SemanticTranslationChecker.ts:135-168`): stub checkers, assert fallback only when primary rejects.
- `lib/pinyin.ts` `pinyinMatches`: `nv3`, `nü3`, `nǚ` all match; `nv` fails with `requireTones`.
- `TTSService.getVocabAudioFP` (59-75) single vs multi char naming.
- `TranslatorService.cutSentence` (42-58); `getPinyin` on a glyph with no reading returns the glyph itself.

### Scripts

- Already-run one-shots: `classify-vocab.ts`, `backfill-classification.ts`, `backfill-etymology-roles.ts`, `backfill-admin-roles.ts`, `backfill-book-memory-aids.ts`, `seed-hsk1-deck.ts`, `regenerate-audio.ts`, `assess-remote.ts`, `src/server/database/migrations/migrate-audio-urls.ts`.
- Recurring: `build-vocab-classification.mjs`, `build-script-classification.mjs` (pinned by tests), `seed-preview.ts`, `seed/index.ts`.

### Schema

- Zero secondary indexes, 19 `references(`. Hot lookups without one: `memoryAids.vocabItemId` (222-235), `suggestions(createdById, createdAt)` and `.status` (266-283), `userDecks.deckId` (203-220, `numLearners` subquery per browse row), `userVocabItems.memoryAidId` (176), `vocabItems(disabled, vocabType)`, ILIKE search columns.
- Sentinels: `pinyin`/`audioUrl` NOT NULL with `""` (113,133); `users.role` nullable text defaulting `"user"` (34).
- `userVocabItems` is one row with four `*Level`/`*NextAt` pairs (172-180); consumers index by string template (`StudyService.ts:494-518,681-682`). A `(userId, vocabItemId, studyType)` row would delete that.
- No `onDelete` on `decks.createdById`, `userVocabItems`, `deckVocabItems`, `memoryAids` (100-102, 165-170, 190-195, 227-232).

### Other production flags

- N+1: `decksRouter.ts:84-90` `getVocabItemPartsDeep` per item; each recursion level does `getVocabItem` + `removeDisabled` (`VocabService.ts:560-572,620-637`).
- `decksRouter.ts:72-81` creates vocab items (DeepL + TTS + S3 + insert) sequentially outside the transaction at 93; midway failure leaves orphans.
- `processAnswer` read-then-update without a transaction (`StudyService.ts:365-380,520-528`).
- `submitAnswer` is three round-trips (`studyRouter.ts:95-106`); `getNextVocabItem` reloads the whole deck each call.
- Unbounded reads: `getNextVocabItem`, `getDeckProgress` (568-619, 1012-1049), `listMemoryAidsForItemAdmin` (`VocabService.ts:304-317`). `buildDecompositionIndex` 5-minute TTL never invalidated by `AdminService.updateVocabItem` (`VocabService.ts:639-690`).
- `SmtpEmailAdapter` new transport per send (`EmailAdapter.ts:28`).
- `SemanticTranslationChecker` loads the model in the request path on first miss (`SemanticTranslationChecker.ts:44-49`).

## Client

### Giant components and extractable logic

- `src/app/study/[deckId]/page.tsx:571-584` 8 `useState` fields that are one state machine (phase card|result|complete, current item, last result). Reducer in `src/lib/study-session.ts` with tests. Extract `StudyCard` (121-342), `ResultCard` (344-534), `CompletionScreen`, `HanziPanel`, `Decomposition`.
- Pure logic in that page: level-key derivation (612-617), pinyin folding `ü→v` then `pinyinTone` (300-305), `canAddSynonym` (374-378), `STUDY_LABELS` typed `Record<string,string>` (44).
- `src/app/decks/page.tsx:221-347` `DeckGrid` mixes two queries, saved map, error, empty, grid, pagination. Pure: `pageRange` (300, 322-325), savedDecks→`Map` (247-260), composition-bar maths (80-133).
- `src/app/decks/[deckId]/page.tsx:295-298` groups by type inline, unmemoised. `compositionParts` duplicated at 210-245.
- `src/app/admin/vocab/page.tsx:53-427` 8 states, 2 queries, mutation, table, pagination. `countFor` (116-121) equals `suggestions/page.tsx:217-222`. Pagination maths at `vocab:395-397`, `suggestions:307-309`, `view-all-memory-aids-dialog.tsx:52-55`. `formatFiledAt` (`suggestions:54-59`). `editable-cell.tsx:43-51` commit rule pure and untested. `canBeComponent` and switch trio duplicated `vocab/page.tsx:340-382` vs `admin-vocab-editor.tsx:107-158`.
- `deck-graph-panel.tsx:29-44,57-78` depth options and band maths; `vocab-entry.tsx:44-53,212-233` glyph sizing. Pure, untested.

### CLAUDE.md rule violations

- `useQuery` with manual state: `decks/page.tsx:236-276` (documented keepPreviousData reason), `dictionary/page.tsx:33-53`, `admin/vocab/page.tsx:69-71,129-148`, `admin/suggestions/page.tsx:180-184,227-240`, `decomposition-graph-panel.tsx:40-59`, `deck-graph-panel.tsx:93,126-139`, `manage-memory-aids-dialog.tsx:65`, `view-all-memory-aids-dialog.tsx:37`. Both admin pages wrap an `ErrorBoundary` that never fires for query errors.
- Dead `Suspense` at `decks/page.tsx:465-473`.
- Hand-rolled pills where `ui/badge` exists: `item-type-badge.tsx:20-32`, `component-role-badge.tsx:32-42`, `decks/page.tsx:166-170`, `vocab-entry.tsx:151-161`, `suggestions/page.tsx:95-105`. `title=` instead of `ui/tooltip`: `decks/[deckId]/page.tsx:115`, `script-badge.tsx:49`, `segmented-toggle.tsx:55`. `segmented-toggle.tsx` reimplements `ui/tabs`. Hand-rolled separators `signin/page.client.tsx:145`, `signup/page.client.tsx:217`. `ui/form.tsx` exists but auth pages use raw `Controller`. Raw `<button>` at `manage-memory-aids-dialog.tsx:135-153`.
- `src/lib/audio.ts` exists; `dictionary/page.tsx:66-72` re-implements it.
- CLAUDE.md says `ApiClientProvider` clears queries on logout. Zero `.clear()`/`removeQueries` in `src/`; `profile/page.tsx:24-35` signs out without touching the singleton (`orpc.client.tsx:17-25`). Previous user's decks and queue stay cached.
- CLAUDE.md says OKLCH. `globals.css` has zero `oklch()`; tokens are hex plus `color-mix(in oklab)` (103-183).

### Duplicated UI

- Composition bar (`decks/page.tsx:80-133` vs `decks/[deckId]/page.tsx:210-245`). `DEFAULT_DECK_SETTINGS` inline twice (`decks/page.tsx:56-61`, `[deckId]/page.tsx:254-259`). addDeck mutation + invalidations twice.
- Graph panel chrome in `decomposition-graph-panel.tsx:44-93` and `deck-graph-panel.tsx:125-165`.
- Pagination controls three times (`vocab:392-418`, `suggestions:304-330`, `view-all:117-139`). Filter pill block identical `vocab:154-180` vs `suggestions:245-271`. `savingId` mutation scaffold three times (`vocab:88-109`, `suggestions:197-215`, `admin-vocab-editor.tsx:34-61`).
- Three memory-aid dialogs share create-form and aid-card markup (`manage:155-200`, `create:66-98`, `view-all:87-96`).
- `StatTile` twice: `src/app/page.tsx:11-45` shadows `src/components/stat-tile.tsx:26-53`.
- `EmptyState` and `PageHeader` exist but `admin/vocab/page.tsx:133-147,259-270,432-446` and `dictionary/page.tsx:128-240` hand-roll them. "Back to X" link at `decks/[deckId]/page.tsx:311-317`, `dictionary/[word]/page.tsx:60-66`.

### State smells

- Two window-level `keydown` Enter listeners (`study/[deckId]/page.tsx:170-181,393-396`). Enter anywhere submits.
- `editable-cell.tsx:36-41` `useState(serverValue)` plus set-during-render, no key. `suggestions/page.tsx:71` mirrors `adminNote`, never resyncs.
- `decks/page.tsx:352-355,445-447` mirrored search state; `[deckId]/page.tsx:254` never seeds from saved settings, so re-saving resets all modes to true.
- `decks/new/page.tsx:16-20` `useEffect` auth redirect racing a card.
- `theme-toggle.tsx:11-28` renders `Moon` pre-mount, static `aria-label`.
- Index keys: `study/[deckId]/page.tsx:92`, `dictionary/page.tsx:171`, `admin/vocab/page.tsx:251-253`, `suggestions/page.tsx:277`, `manage-memory-aids-dialog.tsx:104`.
- `savingId` duplicates `mutation.variables` (`vocab:63`, `suggestions:178`). Floating promise `create-memory-aid-dialog.tsx:37`.

### UX and a11y

- Bug: `study/[deckId]/page.tsx:308` template `text-2xl${isHanziAnswer ? "hanzi" : ""}` yields `text-2xlhanzi`.
- i18n: `next-intl` installed, zero imports. Hand pluralisation `decks/page.tsx:104,183,186`, `[deckId]/page.tsx:336,339`, `decomposition-graph-panel.tsx:87-88`.
- No `lang="zh"` anywhere; root `lang="en"` (`layout.tsx:50`). 13 hanzi spans plus `page.tsx:144-146`, `suggestions:79-83`.
- Header `header.tsx:46` `hidden sm:flex` nav with no mobile menu. No skip link, nav lacks `aria-label`.
- Auth forms: no `autoComplete`; validation on submit only; failure is a toast (`signin:70-75`); `signin:20` enforces `min(8)` on sign-in password.
- Icon-only without label: `dictionary/page.tsx:184-192` Play. `admin/vocab/page.tsx:215-227` Switch name includes count. Row `onClick` + `window.location.href` at `dictionary/page.tsx:172-178`.
- Colour-only: `suggestions:48-52` status, `vocab:283` hidden rows via `opacity-50`.
- Audio: `audio.ts:20` toasts on failure, no pending state; listening autoplay (`study:137-143`) blocked by policy then toasts.
- Study session: no progress, deck name, or exit control. Initial null item shows "cleared every card" (`536-559`, `665-667`). Result card shows only `newLevel`.
- Spinner vs skeleton inconsistent: `decks/new/page.tsx:26`, `dictionary/page.tsx:123`, `page.tsx:53`, `report-issue-dialog.tsx:126`; bare "Loading..." `view-all:72`.
- Missing error states: `decks/[deckId]`, `dictionary/[word]` (404 renders as crash card via `error-boundary.tsx:52`), `/`, `/profile`, `/verified`. `view-all-memory-aids-dialog` shows "No memory aids found" on failure.
- `error-boundary.tsx:60-66` "Try again" reloads the page; no `QueryErrorResetBoundary`.
- `prefers-reduced-motion` only in confetti (`confetti-burst.tsx:38`), not `character-strokes.tsx:109` or graph layout.
- Mobile: `h-[68vh]/[60vh]` canvases, `character-strokes.tsx:104` fixed `h-64 w-64`, dictionary `table-fixed`.
- Home dashboard hard-coded fake stats (`page.tsx:75,84,112`).

### Routes (empty / error / auth)

- `/` fake dashboard or landing. n/a / no / session spinner.
- `/study` yes / boundary only / server `authProcedure` (perPage 50 silent cap, `study/page.tsx:43`).
- `/study/[deckId]` n/a / boundary only / server only.
- `/decks` yes / inline, sniffs `/unauthorized/i` / server only.
- `/decks/[deckId]` yes / boundary only / server only.
- `/decks/new` n/a / toast / client `useSession` redirect, the only client guard.
- `/dictionary` no pagination despite server support. yes / yes+retry / public.
- `/dictionary/[word]` aids only / boundary only / public; "Create my own" fails signed out.
- `/admin/*` yes / yes / client-only gate `admin/layout.tsx:23-69`, procedures are the real gate.
- `/signin`, `/signup` toast only. `/profile` no redirect signed-out. `/verified`, `/privacy`, `/resources` static.

### Theme

- `page.tsx:97` `bg-white` breaks in dark. `mika.tsx:16-19` hex, `confetti-burst.tsx:51` hex fallback.
- `/opacity` on `color-mix` tokens breaks in dark (`deck-settings-dialog.tsx:120-122` documents it); check `bg-success/15` at `page.tsx:25`, `suggestions:50`, `verified:21`.
- `app-toaster.tsx:8-12` reads `resolvedTheme` unguarded.

### Perf

- `react-force-graph-2d` is `dynamic()` (`decomposition-graph.tsx:39-45`) but panels are static imports (`vocab-entry.tsx:10` → `decomposition-graph-panel.tsx:7` → `d3-force`), so `/dictionary/[word]`, `/study/[deckId]`, `/decks/[deckId]` ship d3-force in the Details view.
- `ReactQueryDevtools` unconditional (`orpc.client.tsx:56`). `retry: () => false` globally (`queryClient.ts:11`).
- `layout.tsx:34` `force-dynamic` at root disables static for `/privacy`, `/resources`. `header.tsx` client component in root layout.
- No virtualisation: `decks/[deckId]/page.tsx:170-181`; `decks/page.tsx:54` fetches 100 saved decks per mount for badges.
- Audio never preloaded or reused.

## Infra

### CI/CD

- No `.github/`. No husky or lint-staged. `development/ci.Dockerfile` is an orphan (pnpm + playwright image, no COPY/CMD, referenced by nothing).
- No `playwright.config.*`, no specs, `playwright` not in package.json. `test/` holds only `test/mocks/server-only.ts`.
- No `format`/`format:check` script despite prettier config.
- Every runtime script wraps `doppler run --` except `build`. CI needs `GIT_SHA` (`src/env-utils.ts:17`; `src/env.ts:12` falls back to `VERCEL_GIT_COMMIT_SHA` only).
- Minimal CI: install, `pnpm lint`, `pnpm typecheck`, `prettier --check .`, `vitest run` (junit at `test-results/vitest/junit.xml`), `next build` with stub env.

### Env and secrets

- Schema `src/env-utils.ts:12-49`. `BASE_URL` plain string, `AUTH_SECRET` no min length.
- No tracked env files. `.env.local-backup` on disk (gitignored) holds real-looking values for all 9 required vars including `AUTH_SECRET` and `DEEPL_API_KEY`. Delete or move to Doppler.
- No `.env.example`; README.md:68-84 omits `GIT_SHA`, `LOG_LEVEL`, `ADMIN_EMAILS`, `NODE_ENV`. No `doppler.yaml`.

### Security headers (`src/proxy.ts`)

- `:8` skips `/_next/*` and `/api/*`, so `/api/auth/*` and `/api/rpc/*` get no headers.
- CSP `:26-37`: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src 'unsafe-inline'`, `frame-ancestors 'none'`, `object-src 'none'`. No nonce, `base-uri`, `form-action`, `worker-src`.
- HSTS `:42` `max-age=3600`, no includeSubDomains/preload.
- Missing: Referrer-Policy, Permissions-Policy, X-Content-Type-Options. `next.config.ts` has no `headers()`.

### Auth (`src/server/auth.tsx`)

- Email+password only, `requireEmailVerification: true`. Verification send is `void` (`:46`).
- Rate limit `:30-33` defaults, no per-route rules. No `session` block. No password policy beyond defaults.
- Not configured: password reset, change email, delete account. Only `EmailVerificationEmail.tsx` exists.

### Database

- `drizzle.config.ts` sets `out: ./drizzle` but no `drizzle/` dir and zero `*.sql`. `drizzle-kit push` only.
- `pg.Pool({max: 10})` singleton (`database.ts:32-41`). Up to 10 connections per warm lambda; `docs/remote-setup.md:22-30` relies on the Neon `-pooler` string, unenforced.
- Backups: zero mentions.
- `development/docker-compose.yaml` runs postgres:17, `adobe/s3mock`, Mailpit. Not MinIO, contrary to CLAUDE.md and README.

### Dependencies

- No `packageManager`, `engines`, `.nvmrc`.
- `pnpm audit --prod`: 189 vulns (7 critical, 85 high, 86 moderate, 11 low). Critical: better-auth x2, `@orpc/client` prototype pollution (fixed >=1.13.6, on 1.12.3), `fast-xml-parser` via aws-sdk, `form-data` via `node-gtts>request`, `protobufjs`, `vitest`. High: `next` 16.1.1 DoS (13 advisories), `drizzle-orm` SQL injection via JSON path keys, `nanoid`, `undici`, `sharp`, `ws`.
- Majors behind: `@next/env` 15, testcontainers 11→12, awilix 12→13, eslint 9→10, pino 9→10, nodemailer 7→9, react-email 4→6, `@react-email/components` 0.3→1.0, typescript 5.9→7, `@types/node` 24→26, lucide-react 0.525→1.39, jsdom 26→30, nanoid 5→6. ~45 minor/patch behind (better-auth 1.4.6→1.7.2, next →16.3.4, zod →4.5.4).

### Docs drift

- CLAUDE.md container list (`:35-56`) misses `ttsProvider`, `translationChecker`, `adminService`, `suggestionService`. Router list (`:59-60`) misses `study`, `suggestions`, `admin`. Undocumented scripts: `build:local`, `lint`, `lint:fix`, `db:migrate-audio-urls`. Doppler never mentioned. "MinIO" wrong.
- `AGENTS.md` untracked byte copy of CLAUDE.md except lines 1 and 3.
- CLAUDE.md rationale sections (candidates for `docs/`): `:116-213`, `:214-251`, `:252-267`, `:268-285`, `:291-408`. Testing guidelines `:615-797` generic. ~300 of 797 lines are essay.
- `README.md` line 3 cites `@xenova/transformers` (not installed), line 18 MinIO, no Doppler.
- `STUDY_FLOW.md:392-400` describes a throw now a nullable return (`StudyService.ts:542`); never mentions `study-rules.ts`.
- `WIREFRAMES.md` pre-redesign, stale. `FUTURE_ADDITIONS.md:54-68` lists shipped features.

### Observability

- pino consistent (63 calls, 10 files). `console.*` only in seed/migration scripts and `error-boundary.tsx:38`.
- No request id. No Sentry/PostHog/analytics/OpenTelemetry. No `instrumentation.ts`.
- No health endpoint; `appRouter.ping` (`router.ts:9`) unauthenticated.
- No `src/app/error.tsx`, `global-error.tsx`, `not-found.tsx`. `RPCHandler` route has no `onError`.

### Repo hygiene

- `.claude/worktrees/dashboard-real-stats` is a live locked worktree at 2fb827b, 0 ahead of main, 1.7G `node_modules`. Removable.
- `books/` 51M untracked. `src/server/database/seed/graphics.txt` 30.8 MB tracked at HEAD.

### Legal and product

- `src/app/privacy/page.tsx:25-27` placeholder. No terms. No consent banner (none needed today).
- Email templates: only verification.
