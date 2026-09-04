# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup

```bash
pnpm install                    # Install dependencies
pnpm dev-containers             # Start Docker services (PostgreSQL, MinIO)
pnpm db:push                    # Push database schema changes
pnpm db:seed                    # Seed database with vocabulary data
```

### Development

```bash
pnpm dev                        # Start Next.js dev server (http://localhost:3000)
pnpm email                      # Start email dev server (http://localhost:3100)
pnpm typecheck                  # Run TypeScript type checking
```

### Testing & Building

```bash
pnpm test                       # Run unit tests (Vitest)
pnpm test-e2e                   # Run end-to-end tests (Playwright)
pnpm build                      # Build for production
pnpm start                      # Start production server
```

## Architecture Overview

### Dependency Injection (Awilix)

The application uses **Awilix** for dependency injection. All services are registered in `src/server/initialization.ts` and accessed via the `container.cradle` object.

**Key services in the container:**

- `logger` - Pino logger instance
- `database` - Drizzle ORM database connection
- `auth` - Better Auth authentication instance
- `storage` - S3StorageAdapter for file storage (MinIO in dev)
- `email` - EmailAdapter (SMTP in dev, SES in prod)
- `translator` - TranslatorService (DeepL + pinyin-pro)
- `tts` - TTSService (MS Edge TTS for audio generation)
- `vocabService` - VocabService for vocabulary management
- `deckService` - DeckService for deck management
- `studyService` - StudyService for study session management

**When adding new services:**

1. Create the service class in `src/server/services/`
2. Add to `Cradle` type in `src/server/initialization.ts`
3. Register in the container with appropriate lifetime (singleton/scoped)

### API Layer (oRPC)

The API uses **oRPC** (not tRPC) for type-safe RPC communication between client and server.

**Server-side:**

- Router defined in `src/server/endpoints/router.ts`
- Sub-routers: `vocabRouter`, `decksRouter`
- Procedures defined with `commonProcedure` or `authProcedure`
- Context includes `headers` and `cradle` (DI container)

**Client-side:**

- Client setup in `src/lib/orpc.client.tsx`
- Use `useORPC()` hook to access RPC methods
- TanStack Query integration for caching/state management
- **Prefer `useSuspenseQuery`** with `ErrorBoundary` and `Suspense` components over `useQuery`
- Example: `orpc.vocab.list.queryOptions({ input: { page, pageSize } })`

**Creating new endpoints:**

1. Define procedure in appropriate router file
2. Use `.input()` for Zod validation
3. Access dependencies via `context.cradle`
4. Client automatically gets type-safe methods

### Authentication (Better Auth)

- Auth configured in `src/server/auth.ts`
- Client-side: `authClient.useSession()` hook
- Server-side: Use `authProcedure` for protected endpoints
- Important: `ApiClientProvider` clears queries when user logs out

### Database (Drizzle ORM + PostgreSQL)

- Schema: `src/server/database/schema.ts`
- Migrations: Use `pnpm db:push` to sync schema
- Seeding: `src/server/database/seed/` contains seed scripts

**Key tables:**

- `vocabItems` - Components, characters, compounds, and sentences with stroke data, audio, etymology
- `decks` - User-created vocabulary decks
- `deckVocabItems` - Links vocab items to decks
- `userVocabItems` - Tracks user progress per vocab item

### Vocabulary Item Types

Vocab items are categorized by `vocabType`, ordered largest to smallest:

- `sentence` - Full sentence (split by word boundaries using `Intl.Segmenter`)
- `compound` - Multi-character word (split by individual characters)
- `character` - Single Chinese character (has strokes, radicals, etymology)
- `component` - A bound radical form (亻, 氵, ⺮, 糹) — a graphical part of a
  character that is never typed as a word on its own. This is the floor of the
  hierarchy: components never decompose further and are introduced before
  everything built from them.

**Components are quizzed on meaning — and, for a phonetic, on its sound**
Most bound forms have no pronunciation of their own. The dictionary gives 亻 the
same "rén" as 人 — borrowed, and worse than nothing on a card — so those are
stored with `pinyin` and `audioUrl` empty (both columns are NOT NULL; `""` is the
sentinel) and are served for `understanding` only. Because meaning is the only
path for them, a component **must** have a gloss; `vocab-classification.tsv`
carries a `gloss` column for the five the dictionary leaves blank, and the
generator refuses to emit a glossless one.

The exception is a **phonetic component**, whose reading is its own and predicts
the reading of the characters it appears in — 艮 gěn is the clue behind 很, 跟,
根, 恨. Throwing that away would discard the most useful thing the part carries,
so a phonetic is stored **with** its pinyin and audio and is served for `reading`
and `listening` too. Today that is 艮 隹 爿 丬 龹 鬲 臼 虍, in the TSV's `phonetic`
column and pinned by `vocab-classification.test.ts`.

**The list is derived, not judged.** `dictionary.txt` tags each of its 6,966
pictophonetic characters with the glyph that supplied the sound and the glyph
that supplied the meaning, so
`scripts/build-vocab-classification.mjs` scores every component against those
labels and applies two gates — both necessary:

- **purity** ≥ 70%: of the times the component is given a role, how often it is
  the _sound_ one. A low score means the reading is borrowed, which is the whole
  failure mode: 阝 is the sound part 5 times and the meaning part 113, and its
  "yì" belongs to 邑.
- **rime** ≥ 40%: of the characters it does supply the sound for, how many still
  rhyme with it in Mandarin. The labels record Old Chinese, so 彐 is a 78%-pure
  phonetic whose series (浸 灵 雪 刍) has drifted to nothing a learner can use.

Purity alone would admit 飠饣 (80% rime, but "shí" is 食's); rime alone would
admit ⺌ and 弋, whose series no longer rhyme at all. Variant forms of one radical
are pooled, because 爿 and 丬 are one component drawn two ways and scoring them
apart passes the simplified form and fails the traditional one.

`PHONETIC_INCLUDE` is the single documented override: 隹 is 60% pure, under the
bar, but it is the sound part of 26 characters — more than any component in the
corpus — and its other uses mean "bird", which makes "zhuī" unhelpful there but
never wrong. Purity is a proxy for "is this reading borrowed"; 隹's is not. Run
the generator to see the whole scoring table before touching a threshold.

`writing` is out for every component — a pinyin IME cannot produce 亻. Reading
and listening are gated on **`vocabItems.phonetic`**, not on the pinyin being
present, and `readingOf` blanks the reading of anything that flag is false for
before it reaches a card, the dictionary or a deck preview.

That distinction is load-bearing, and production proved why. 97 of its 107
components still carry the reading the dictionary gave them — 阝 has 邑's "yì",
亻 has 人's "rén" — left over from before the component work. A rule of "a stored
reading means teach the reading" would have quizzed every one of them. The flag
makes those rows inert without deleting anything: the column keeps its value, and
nothing serves it.

`/admin/vocab` therefore has two independent switches, Phonetic and Reading.
Toggling one never touches the other, and the next `backfill-classification.ts`
run resets Phonetic from the TSV — so an admin edit is provisional until it is
recorded in the file.

**Saying it out loud in the dictionary**
`ComponentRoleBadge` states which it is — "Meaning only" or "Meaning + sound" —
on the entry header and in the search table, next to the type badge. The two
states are additive on purpose: every component is quizzed on meaning (the
generator refuses to emit one without a gloss), and a phonetic is quizzed on
sound _as well_. There is no component taught by sound alone, so the badge never
reads just "Sound".

It takes `phonetic` straight from the DTO. Do not re-derive it from an empty
`pinyin`: `readingOf` has already blanked the borrowed ones, which makes "has no
reading" and "has one we hide" identical on the client.

**`toVocabItemDto` is the only way a row becomes a dictionary DTO**
Both paths must go through it. They drifted once: `getVocabItemDetailed` mapped
field by field through `readingOf` while `searchVocabItems` returned the raw
`select()`, so 亻 was silent on its own page and offered a working play button
for 人's audio in the results table — and shipped that way. The mapper also drops
the admin-only columns (`disabled`, `defaultMemoryAidId`) that a bare `select()`
otherwise puts on the wire. Pinned by `VocabService.test.ts`.

**The gating rule that goes with it**
`weakestServableLevel` must only consider study types `canStudy` permits for that
item. Taking the minimum over every _deck-enabled_ type instead pins a
meaning-only component at level 0 forever — it can never be served for reading,
so `readingLevel` never advances — and the constituent gate then locks every
character built on it, permanently and unrecoverably. Likewise a dependency with
_no_ servable type must not gate at all. Both are covered in
`src/server/__tests__/study-rules.test.ts`; do not reintroduce a gate that reads
levels the item cannot earn. A phonetic component legitimately gates on all three
of its servable types, so 很 waits until 艮 is known by sound as well as meaning.

Audio for a phonetic is a separate job from its reading: the backfill restores
the pinyin from `dictionary.txt`, `regenerate-audio.ts` fills the object. In
between, `reading` is servable and `listening` is not — `canStudy` degrades to
that on its own, so the two scripts need no ordering contract.

The rules live in `src/server/study-rules.ts` as pure functions over a minimal
item shape, deliberately outside the 300-line `getNextVocabItem` — the deadlock
above shipped because they were untestable closures.

**Disabled items**
`vocabItems.disabled` hides a row from _every_ read path — decomposition,
dictionary, search, deck membership, and study selection — so it behaves as if
deleted. Two things get disabled: glyphs more basic than a radical (absent from
the standard 214), and glyphs with no gloss or reading, which can never produce
an answerable card.

Classification lives in `src/server/database/seed/vocab-classification.tsv`, a
hand-editable file listing only the exceptions (anything absent from it is a
`character`). Regenerate it from the rules with
`node scripts/build-vocab-classification.mjs`. `seed-dictionary.ts` reads the same
file, so a fresh seed lands in the same state as the backfill.

A component normally has to be one of the standard 214 radicals — "not a radical"
is how the generator recognises a fragment too basic to teach. `BOUND_NON_RADICAL`
is the deliberate exception for bound forms outside the 214 that still carry a
teachable gloss (㐆, 㐌, 丄, 丩, 龹). It is pinned to an exact list by
`vocab-classification.test.ts`, so widening it is an explicit edit, never a side
effect.

**Backfills, different contracts.** Pick the right one:

- `tsx scripts/backfill-classification.ts` (`--dry-run`) — **additive and
  idempotent**, and the one to reach for. It promotes glyphs the files call
  components, fills a missing component gloss, restores a phonetic component's
  reading from `dictionary.txt`, and sets `script`. It never demotes a component,
  never touches `disabled`, and never wipes a reading, so it is safe against a
  database the admin UI has been editing.
- `tsx scripts/classify-vocab.ts` (`--force`) — the original **authoritative
  overwrite**, already run. It resets classification wholesale to the TSV,
  including disabling glyphs and purging the deck links and progress that pointed
  at them, so it discards every admin decision the file does not happen to repeat.
  It strips the reading from every component the file does not call phonetic.
- `tsx scripts/backfill-etymology-roles.ts` (`--dry-run`) — unrelated to
  classification: fills `etymologyPhonetic` / `etymologySemantic` from
  `dictionary.txt` on rows seeded before those columns existed. Only writes where
  the file positively disagrees, so a hand correction survives.

**Which part did which job**
`vocabItems.etymologyPhonetic` and `etymologySemantic` name the parts that gave a
pictophonetic character its sound and its meaning — 沐 mù is 氵 (water) plus 木
mù. The dictionary view labels each decomposition tile with them, which is most
of the value of showing a decomposition at all.

They are stored **per character**, not per component, because the role belongs to
the pair: 山 is the meaning in 峰 fēng and the sound in 仙 xiān. There is no such
thing as "山 is a semantic component" — only "山 is the semantic component of 峰".
Do not be tempted to denormalise this onto the part.

The client tags tiles by matching `constituents` against the two fields. 96% of
pictophonetic characters name parts that are both in the top-level decomposition;
the rest (冒's sound is 冃, but it splits ⿱日目) simply go unlabelled rather than
being given a tile they do not have.

**Traditional vs simplified**
`vocabItems.script` is `simplified`, `traditional`, or `both`. `both` is not an
"unknown" fallback — it is the positive and most common case, over half the
dictionary (人, 大, 一 are written identically in either script). The other two mean
the glyph has a _distinct_ counterpart in the other script (国 <-> 國), which is
what makes it wrong for someone studying the other one.

Derived from Unihan's `kSimplifiedVariant` / `kTraditionalVariant` (vendored as
`scripts/data/unihan-variants.txt`) by
`node scripts/build-script-classification.mjs`, which writes
`src/server/database/seed/script-classification.tsv` — again only the exceptions,
so absence means `both`. Self-references in Unihan are ignored on purpose: 这 lists
itself under `kTraditionalVariant` beside 這, which would make the flagship
simplified glyph count as traditional. The few glyphs with distinct variants both
ways are resolved by hand in `OVERRIDES` (苧, 蒙), and the generator throws rather
than guess if a new one appears. A compound or sentence takes its script from the
characters it is written with, via `classifyScript`.

**Resolving parts:** always go through `VocabService.getVocabItemParts`, which
drops disabled parts. `filterDecomposition` in `src/lib/decomposition.ts` is
string-level only and cannot tell what is disabled — client components must
render the server-provided `constituents` array, never re-split `decomposition`.

**Decomposition graphs.** Two views over the same relation, sharing one renderer
(`src/components/decomposition-graph.tsx`), one palette module
(`src/lib/graph-palette.ts`) and one pure traversal
(`src/server/decomposition-graph.ts`). Rendered by `react-force-graph-2d` on canvas
2D — no WebGL and no web worker, so `src/proxy.ts` needs no CSP change.

The renderer takes a `GraphView`: nodes, edges, an optional `focus` (ringed), and an
optional `rows` count that switches it from a free layout to a banded one. `rows` is
deliberately a _layout_ word — what a row means belongs to the caller.

_Per entry_ — a view mode of a vocab entry, not a page: the Details/Graph toggle
lives in `VocabEntryDetail` (`src/components/vocab-entry.tsx`), so the dictionary and
the study session's first-sight card both get it from the one place.

Served by `vocab.graph`, which returns **one hop, uncapped**: the focus glyph,
every glyph directly connected to it in either direction, and every edge among
that set. The invariant is `nodes.length === focusDegree + 1`.

Both halves of that are deliberate:

- _Uncapped_, because a sampled list of a glyph's direct relationships cannot be
  told apart from a complete one — showing 12 of 口's 488 users would misinform.
  Degree bounds the response for us; the widest node in the corpus is 口 at 488,
  so ~485 nodes / 68 KiB is the worst case.
- _One hop_, because two is effectively the whole corpus. 99.9% of characters sit
  in a single connected component with a mean shortest path of 4.3 hops, so each
  extra hop dissolves the picture toward a featureless 9.5k-node ball with no
  distance variation left for a force layout to express.

_Per deck_ — the List/Graph toggle on `/decks/[deckId]`, served by `decks.graph` and
rendered by `DeckGraphPanel`. **Everything, banded by unlock depth**, with a control
for how many levels deep to show. The container widens to `max-w-7xl` in this view;
398 nodes have nowhere to go at `max-w-4xl`.

`layerByPrerequisites` assigns each node a `level`: 0 is anything with no
prerequisite _inside the deck_ (components, plus characters whose parts are not in
it), and above that a glyph sits one past its **deepest** prerequisite. The longest
path, not the shortest — a glyph is only introduced once every part is known, so the
slowest chain sets the pace. That gives the invariant the depth control depends on:
**a part always lands on a strictly lower level than the glyph it gates**, so cutting
at level N can never show something while hiding what it is built from. Verified
against the real HSK 1 deck: 640 edges, all 7 cuts, zero orphaned edges.

The relation is `constituentsOf` restricted to deck membership — the same rule
`isUnlocked` gates study on, so the tiers are the deck's real teaching order rather
than a projection of the corpus. Caveats worth knowing:

- `degree` is **deck-local** here, unlike the one-hop view. A component used by 300
  characters but 4 of these should be drawn the size it is _here_.
- Levels are structural, so they ignore per-learner study-type toggles. `isUnlocked`
  additionally lets a dependency that can never be served stop gating; with all four
  types enabled no deck row is unservable, so the two agree today. Disabling
  _understanding_ would make the meaning-only components unservable and the real
  gate shallower than shown.
- Cycles have no honest level and would be unsatisfiable anyway. There are none in
  the corpus (the relation is a DAG across all 9,574 characters), but rows are
  editable, so anything Kahn cannot drain is parked past everything that resolved
  rather than silently dropped.
- No cache, unlike `vocab.graph`: one indexed join over a few hundred rows (31ms /
  64 KiB for HSK 1), and deck membership changes under an editor's hands.

Rendering notes, each fixing a bug that was not obvious:

- `forceCollide` (from `d3-force`) sizes every node by its DRAWN radius plus a gap.
  Charge repulsion acts between centres and knows nothing about radius, so without
  this a large hub circle sits on top of its neighbours.
- Arrows read **part → whole**, so links are built with `source: edge.child,
target: edge.parent` — reversed from the wire format, which is directed
  parent→child ("is built from"). Following the arrows runs simple to complex.
- Effects that call `graph.d3Force(...)` MUST depend on whatever gates the
  renderer's mount (`size.width`, `palette`), or they run once against a null ref
  and never fire again, leaving every force silently unapplied. Worse, setting
  `graphData` REBUILDS the simulation and discards forces registered beforehand, so
  they are applied from `onEngineTick` — the first moment the simulation provably
  has its nodes. Symptom when this is wrong: tuning a force changes nothing at all.
- Collision radius is a _ratio_ of the drawn radius, never a fixed gap. The fit is
  scale-invariant, so a constant gap only inflates the layout, the fit zooms out to
  compensate, and every node ends up smaller for no gain in readability.
- Glyph level-of-detail is gated on rendered node size (`radius * scale`), never on
  `globalScale` — a 485-node hub lays out over far more graph units than a 5-node
  entry, so raw scale is not comparable between them.
- The initial fit is capped by `MAX_NODE_RADIUS_PX` rather than by setting
  force-graph's `maxZoom`, which would also stop the viewer zooming in by hand.
- Hover highlighting is skipped when the neighbourhood is not selective (>50% of
  nodes): on a hub it "selected" everything, dimming nothing and turning the picture
  into a coral starburst. Leaving the canvas needs `onPointerLeave` — force-graph
  does not fire `onNodeHover(null)`.

Banded layout (deck view only), where the non-obvious part is that nothing about it
can be a constant:

- `bandForce` measures the layout's own width **every tick** and spaces the rows to
  match the panel's aspect ratio. A gap estimated up front cannot work: how wide a
  band ends up depends on how many sublayers it bulges into, which varies with the
  deck and the depth. One estimate left the full deck filling 97% of the panel's
  height but 72% of its width, and the two-level cut only 45% of the height. Stable
  because the coupling runs one way — charge and collision set the width, the width
  sets the spacing, and nothing in the band force pushes horizontally.
- Rows are **pulled, not pinned** (`forceY`-style, not `fy`). A hard pin makes each
  band exactly one node tall, and the widest holds 91 of them — a strip far wider
  than any panel, which the fit then shrinks until the glyphs are specks.
- The link force is weakened to `0.06` when banded. At full strength links are
  shorter than the gap between bands, so they haul connected nodes off their line
  while unconnected ones stay on it — two levels deep rendered as three rows.
- Charge gets a `distanceMax`. A component with no edge into the rest feels pure
  repulsion and is flung clear, dragging the fit with it (HSK 1 has one: 彳/很/艮). A
  spring back to the centre is the wrong fix — it pulls hardest where the graph is
  widest, and at 0.18 it halved the layout's width.

The traversal is pure and lives in `src/server/decomposition-graph.ts`
(`buildDecompositionIndex`, `extractNeighbourhood`, `layerByPrerequisites`,
`extractDeckGraph`), tested in `src/server/__tests__/decomposition-graph.test.ts`.
`VocabService` owns only the single query feeding the one-hop view plus a 5-minute
index cache, and `DeckService.getDeckGraph` the single query behind the deck view — do
NOT resolve graph edges with `getVocabItemPartsDeep`, which costs two queries per
glyph and flattens the edges away. Excluding disabled and sentence rows in the query
is what makes hidden parts structurally absent instead of subtracted afterwards.

**Audio file naming:**

- Single characters: `audio/{unicode-codepoint}.mp3`
- Multi-character: `audio/{md5-hash}.mp3`

**Character stroke data (JSONB fields):**

- `strokes` - Array of SVG path strings
- `strokeMedians` - Array of arrays of coordinate pairs `[x, y]`
- `strokeMatches` - Array mapping strokes to decomposition components

### Content Security Policy (CSP)

CSP is configured in `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`)
and dynamically includes the S3 endpoint.

**Important directives:**

- `media-src` - Must include S3 endpoint for audio playback
- `connect-src` - Must include S3 endpoint for API calls
- When adding external resources, update the CSP accordingly
- `worker-src` is set explicitly and `default-src` is `'self'`: a library that spawns
  a `blob:` web worker or compiles WASM needs the policy in `src/server/csp.ts` amended
  first, and the nonce threaded through anything it injects

### Translation & TTS Services

- **TranslatorService**: DeepL for translation, pinyin-pro for pinyin generation, `Intl.Segmenter` for sentence segmentation
- **TTSService**: MS Edge TTS for generating Chinese audio, uploads to S3/MinIO

### Environment Variables

Environment schema defined in `src/env-utils.ts`, validated in `src/env.ts`.

**Key variables:**

- `DATABASE_URL` - PostgreSQL connection string
- `S3_OPTIONS` - S3/MinIO configuration (endpoint, bucket, credentials)
- `DEEPL_API_KEY` - DeepL translation API key
- `AUTH_SECRET` - Better Auth secret
- `BASE_URL` - Application base URL
- `EMAIL_CONNECTION_URL` - SMTP connection or "ses"

### UI Components & Styling

**Tailwind CSS v4**

- Uses the new Tailwind v4 syntax with `@import "tailwindcss"`
- Theme configuration via `@theme inline` in `src/app/globals.css`
- CSS variables for colors (e.g., `--color-primary`, `--color-background`)
- Uses OKLCH color space for better perceptual uniformity
- Dark mode support with `.dark` class
- Custom radius scales: `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`

**shadcn/ui Components**

- **ALWAYS use shadcn components** where possible instead of building custom UI
- Style: "new-york" variant
- Install new components: `npx shadcn@latest add <component-name>`
- Components location: `src/components/ui/`
- Icon library: **lucide-react**
- Pre-configured components: Button, Card, Input, Dialog, Command, Table, Badge, etc.

**Adding New UI Components:**

1. Check if shadcn has the component first
2. Install via CLI: `npx shadcn@latest add button` (example)
3. Components are copied to your repo and can be customized
4. Use Tailwind utility classes for styling
5. Leverage CSS variables from theme (e.g., `bg-primary`, `text-muted-foreground`)

### Type Definitions

**All shared type definitions and Zod schemas must be placed in `src/definitions/definitions.ts`**.

This includes:

- DTOs (Data Transfer Objects)
- Zod validation schemas
- Enums and their Zod schemas
- Shared types used across client and server

Example:

```typescript
// src/definitions/definitions.ts
export const VocabItemDto = z.object({
  vocabItem: z.string(),
  translation: z.string().nullable(),
  // ...
});
export type VocabItemDto = z.infer<typeof VocabItemDto>;
```

## Important Patterns

### A deck create writes its new dictionary rows on the deck's transaction

The dictionary is shared, so a word one learner's create invents is a word every
other learner searches. That makes a partial create a leak rather than a mess:
the create used to insert those rows on the pool before the transaction opened,
and a failure afterwards left them behind with no deck to reach them from and no
way for the learner to remove them.

So `VocabService` is split at the seam. `prepareVocabItems` does every slow call
— DeepL, Edge TTS, the S3 upload — and returns rows **without writing them**;
`insertVocabItems` writes them on an `Executor` the caller supplies.
`DeckService.createDeck` runs the first outside any transaction and the second
inside the one that writes the deck. Do not merge them back together: moving the
network calls inside the transaction is the obvious way to make the create atomic
and the wrong one, because it holds a connection open across a per-word round
trip and the pool has ten. `DeckService.test.ts` pins both halves.

What a rollback spares is structural, not filtered. A word the dictionary already
holds is never prepared, so it is never inserted, so ROLLBACK cannot reach it —
another learner's deck keeps its row. There is no delete in this path, and adding
one would turn a leak into data loss.

Two concurrent creates naming the same new word are settled by the unique glyph
and `ON CONFLICT DO NOTHING`, never a retry or a re-check. Both prepare the word,
because neither saw the other's row when it looked; the second blocks on the
first's uncommitted index entry, then either finds the committed row or inserts
its own. One row, both decks pointing at it. The insert must not use
`.returning()` — that reports only the rows this statement wrote, so membership
built from it would drop the word the other create won. This depends on READ
COMMITTED, which is Postgres's default and which nothing here overrides; under
REPEATABLE READ the same conflict is a serialization failure.

`resolveConstituentClosure` takes the same executor and runs inside the
transaction, because the rows it has to see are not committed yet.

### Error Handling

Services throw errors for exceptional conditions. TanStack Query handles these errors automatically:

```typescript
async someServiceMethod(item: string): Promise<void> {
  try {
    // ... operation
  } catch (error) {
    throw error instanceof Error ? error : new Error("message");
  }
}
```

On the client side, use `useSuspenseQuery` with `ErrorBoundary` and `Suspense`:

```typescript
// Wrap component with ErrorBoundary and Suspense
<ErrorBoundary fallback={<ErrorFallback />}>
  <Suspense fallback={<LoadingSpinner />}>
    <VocabComponent />
  </Suspense>
</ErrorBoundary>

// Inside component - no need to handle loading/error states
function VocabComponent() {
  const orpc = useORPC();
  const { data } = useSuspenseQuery(
    orpc.vocab.get.queryOptions({ input: { vocabItem: word } }),
  );
  // data is always defined - no null checks needed
  return <div>{data.translation}</div>;
}
```

### Character Decomposition Filtering

When extracting components from character decompositions:

- Filter out Ideographic Description Characters (U+2FF0 to U+2FFF)
- Filter out question marks (`？` and `?`)
- Keep only actual Chinese character components

### Client-Side State Management

- **Prefer `useSuspenseQuery`** with React's `Suspense` and `ErrorBoundary` for cleaner code
  - No need to manually handle loading/error states
  - Data is always defined (no null checks needed)
  - Better UX with declarative loading/error boundaries
- Use regular `useQuery` only when you need granular control over loading/error states
- TanStack Query for server state management with automatic caching
- Auth state affects query cache (cleared on logout via `ApiClientProvider`)
- For protected queries, wait for auth to load: `enabled: !isAuthPending` (when using `useQuery`)
- With `useSuspenseQuery`, wrap components requiring auth with appropriate boundaries

### Suspense & ErrorBoundary Pattern

**Best Practice:** Wrap data-fetching components with `Suspense` and `ErrorBoundary` at the route/page level.

```typescript
// app/some-page/page.tsx
export default function SomePage() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<LoadingSkeleton />}>
        <DataComponent />
      </Suspense>
    </ErrorBoundary>
  );
}

// DataComponent.tsx - Clean component without loading/error handling
function DataComponent() {
  const orpc = useORPC();
  const { data } = useSuspenseQuery(
    orpc.decks.browse.queryOptions({ input: { page: 1, perPage: 50 } }),
  );

  return (
    <div>
      {data.decks.map(deck => (
        <DeckCard key={deck.id} deck={deck} />
      ))}
    </div>
  );
}
```

**Benefits:**

- Cleaner component code - no `isLoading` or `error` checks
- Consistent loading/error UX across the app
- Better code splitting and lazy loading
- TypeScript knows `data` is always defined

**When to use `useQuery` instead:**

- Mutations with `useMutation`
- Polling or refetching scenarios
- When you need fine-grained control over loading states (e.g., showing inline loading)
- Optional/dependent queries that shouldn't block rendering

### Stroke Animation

Character stroke animations use CSS keyframes with:

- Sequential delays for stroke-by-stroke drawing
- `stroke-dasharray` and `stroke-dashoffset` for drawing effect
- Blue while animating, black when complete
- Unique animation IDs per render to allow replay

## Testing Guidelines

### When to Write Tests

**ALWAYS write tests for logic-heavy components**, including:

1. **Service Layer Logic**
   - Business logic in service classes
   - Complex calculations or algorithms
   - State transformations
   - Data validation logic

2. **Utility Functions**
   - Pure functions with complex logic
   - String manipulation or parsing
   - Date/time calculations
   - Custom validators

3. **Critical User Flows**
   - Authentication logic
   - Payment processing
   - Data persistence operations
   - Spaced repetition algorithms

**Examples of logic-heavy components that need tests:**

- Translation similarity checkers (`TranslationChecker.ts`)
- Spaced repetition scheduling (`StudyService.getNextReviewTime`)
- Character decomposition parsing
- Audio file generation logic
- Scoring/grading algorithms

### What to Test

**Focus on:**

- **Input/Output behavior**: Given specific inputs, verify expected outputs
- **Edge cases**: Empty strings, null values, boundary conditions
- **Error handling**: Verify errors are thrown for invalid inputs
- **Business rules**: Ensure business logic is correctly implemented
- **State transitions**: Verify state changes happen correctly

**Don't test:**

- Simple getters/setters without logic
- External library functionality (assume they work)
- Trivial pass-through functions
- UI components without complex logic (use E2E tests instead)

### Test Structure

**Location:** Place tests next to the file being tested with `__tests__/` subdirectory:

```
src/server/services/
  TranslationChecker.ts
  __tests__/
    TranslationChecker.test.ts
```

**Naming convention:** `<ComponentName>.test.ts` or `<ComponentName>.test.tsx`

**Test organization:**

```typescript
import { describe, it, expect } from "vitest";
import { MyService } from "../MyService";

describe("MyService", () => {
  // Group related tests
  describe("methodName", () => {
    it("should do X when Y", () => {
      // Arrange
      const service = new MyService();
      const input = "test";

      // Act
      const result = service.methodName(input);

      // Assert
      expect(result).toBe("expected");
    });

    it("should handle edge case Z", () => {
      // Test edge cases
    });

    it("should throw error for invalid input", () => {
      // Test error conditions
    });
  });
});
```

### Testing Best Practices

1. **One assertion per test** (when possible)
   - Makes failures easier to debug
   - Each test should verify one specific behavior

2. **Descriptive test names**
   - Use "should" statements: `should return true when input is valid`
   - Be specific about the scenario being tested

3. **AAA pattern** (Arrange, Act, Assert)
   - Arrange: Set up test data
   - Act: Execute the code under test
   - Assert: Verify the results

4. **Test edge cases**
   - Empty inputs
   - Null/undefined values
   - Boundary values (min/max)
   - Invalid inputs

5. **Mock external dependencies**
   - Database calls
   - API requests
   - File system operations
   - Use `vitest.mock()` for mocking

### Example: Testing a Service Method

```typescript
// TranslationChecker.test.ts
import { describe, it, expect } from "vitest";
import { JaccardTranslationChecker } from "../TranslationChecker";

describe("JaccardTranslationChecker", () => {
  const checker = new JaccardTranslationChecker();

  describe("getSimilarityScore", () => {
    it("should return 1.0 for identical strings", () => {
      const score = checker.getSimilarityScore("hello", "hello");
      expect(score).toBe(1.0);
    });

    it("should return 0.0 for completely different strings", () => {
      const score = checker.getSimilarityScore("hello", "goodbye");
      expect(score).toBe(0.0);
    });

    it("should handle empty strings", () => {
      const score = checker.getSimilarityScore("", "");
      expect(score).toBe(1.0);
    });

    it("should be case insensitive", () => {
      const score = checker.getSimilarityScore("Hello", "hello");
      expect(score).toBe(1.0);
    });
  });
});
```

### Running Tests

```bash
pnpm test                    # Run all tests
pnpm test TranslationChecker # Run specific test file
pnpm test -- --watch        # Run in watch mode
pnpm test -- --coverage     # Generate coverage report
```

### Test Configuration

Tests are configured in `vitest.config.ts`:

- Uses Node environment for server-side tests
- Supports TypeScript path aliases (`@/`)
- Mocks `server-only` module for testing
- Outputs JUnit reports to `test-results/vitest/`

### When NOT to Write Unit Tests

Skip unit tests for:

- Simple UI components → Use E2E tests (`pnpm test-e2e`)
- Database schema → Trust Drizzle ORM
- Third-party library wrappers → Trust the library
- Configuration files → Rely on TypeScript type checking

**Remember:** Write tests for any logic that could break. If you're implementing complex business logic, write tests first (TDD) or immediately after implementation.
