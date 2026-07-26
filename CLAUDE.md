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

**Components are understanding-only, and carry no reading**
A bound form has no pronunciation of its own. The dictionary gives 亻 the same
"rén" as 人 — borrowed, and worse than nothing on a card — so components are
stored with `pinyin` and `audioUrl` empty (both columns are NOT NULL; `""` is the
sentinel) and are served for `understanding` only. `reading` and `listening` are
unanswerable, and `writing` is impossible on a pinyin IME. Because meaning is the
only path, a component **must** have a gloss; `vocab-classification.tsv` carries a
`gloss` column for the five the dictionary leaves blank, and the generator refuses
to emit a glossless one.

**The gating rule that goes with it**
`weakestServableLevel` must only consider study types `canStudy` permits for that
item. Taking the minimum over every *deck-enabled* type instead pins a component
at level 0 forever — it can never be served for reading, so `readingLevel` never
advances — and the constituent gate then locks every character built on it,
permanently and unrecoverably. Likewise a dependency with *no* servable type must
not gate at all. Both are covered in `src/server/__tests__/study-rules.test.ts`;
do not reintroduce a gate that reads levels the item cannot earn.

The rules live in `src/server/study-rules.ts` as pure functions over a minimal
item shape, deliberately outside the 300-line `getNextVocabItem` — the deadlock
above shipped because they were untestable closures.

**Disabled items**
`vocabItems.disabled` hides a row from *every* read path — decomposition,
dictionary, search, deck membership, and study selection — so it behaves as if
deleted. Two things get disabled: glyphs more basic than a radical (absent from
the standard 214), and glyphs with no gloss or reading, which can never produce
an answerable card.

Classification lives in `src/server/database/seed/vocab-classification.tsv`, a
hand-editable file listing only the exceptions (anything absent from it is a
`character`). Apply edits with `tsx scripts/classify-vocab.ts` (supports
`--dry-run`); regenerate the whole file from the rules with
`node scripts/build-vocab-classification.mjs`. `seed-dictionary.ts` reads the same
file, so a fresh seed lands in the same state as the backfill.

**Resolving parts:** always go through `VocabService.getVocabItemParts`, which
drops disabled parts. `filterDecomposition` in `src/lib/decomposition.ts` is
string-level only and cannot tell what is disabled — client components must
render the server-provided `constituents` array, never re-split `decomposition`.

**Audio file naming:**
- Single characters: `audio/{unicode-codepoint}.mp3`
- Multi-character: `audio/{md5-hash}.mp3`

**Character stroke data (JSONB fields):**
- `strokes` - Array of SVG path strings
- `strokeMedians` - Array of arrays of coordinate pairs `[x, y]`
- `strokeMatches` - Array mapping strokes to decomposition components

### Content Security Policy (CSP)
CSP is configured in `src/middleware.ts` and dynamically includes the S3 endpoint.

**Important directives:**
- `media-src` - Must include S3 endpoint for audio playback
- `connect-src` - Must include S3 endpoint for API calls
- When adding external resources, update the CSP accordingly

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

### Error Handling
Services throw errors for exceptional conditions. TanStack Query handles these errors automatically:
```typescript
async addVocabItem(item: string): Promise<void> {
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
