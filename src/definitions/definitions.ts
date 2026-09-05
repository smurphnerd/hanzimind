import { z } from "@/lib/zod-jitless";

const studyTypeValues = [
  "reading",
  "listening",
  "understanding",
  "writing",
] as const;
export type StudyType = (typeof studyTypeValues)[number];

// Ordered largest to smallest. `component` is a bound radical form (亻, 氵, ⺮) —
// a graphical part of a character that is never typed as a word on its own.
const vocabTypeValues = [
  "sentence",
  "compound",
  "character",
  "component",
] as const;
export const VocabTypeEnum = z.enum(vocabTypeValues);
export type VocabType = z.infer<typeof VocabTypeEnum>;

const searchLanguageValues = ["chinese", "english"] as const;
export const SearchLanguageEnum = z.enum(searchLanguageValues);
export type SearchLanguage = z.infer<typeof SearchLanguageEnum>;

// Which script a glyph belongs to. `both` is not a fallback for "unknown" — it is
// the positive, and most common, case: over half the dictionary is written
// identically in both scripts (人, 大, 一). `simplified` and `traditional` mean the
// glyph has a distinct counterpart in the other script (国 <-> 國), which is what
// makes it unsuitable for a learner studying the other one.
const scriptValues = ["simplified", "traditional", "both"] as const;
export const ScriptEnum = z.enum(scriptValues);
export type Script = z.infer<typeof ScriptEnum>;

export type EtymologyType = "ideographic" | "pictographic" | "pictophonetic";

export const MemoryAidDto = z.object({
  id: z.string(),
  memoryAid: z.string(),
  createdById: z.string(),
  createdByUsername: z.string(),
  usageCount: z.number().int().nonnegative(),
});
export type MemoryAidDto = z.infer<typeof MemoryAidDto>;

/**
 * A memory aid as the admin dashboard sees it. Unlike the learner-facing DTO it
 * carries the moderation state an admin acts on — whether it is the starred
 * default and whether it is public — and never hides a private one.
 */
export const AdminMemoryAidDto = z.object({
  id: z.string(),
  memoryAid: z.string(),
  createdByUsername: z.string(),
  usageCount: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  isPublic: z.boolean(),
});
export type AdminMemoryAidDto = z.infer<typeof AdminMemoryAidDto>;

export const VocabItemDto = z.object({
  id: z.string(),
  vocabItem: z.string(),
  translation: z.string().nullable(),
  pinyin: z.string(),
  vocabType: z.enum(vocabTypeValues),
  script: ScriptEnum,
  audioUrl: z.string(),
  /**
   * Only meaningful on a component: whether its reading is its own and worth
   * teaching. False is the common case, and `pinyin`/`audioUrl` above have
   * already been blanked by `readingOf` for those — so this is what tells the
   * difference between "no reading to show" and "a reading we are hiding".
   * Always false for a character or compound, whose reading is never in doubt.
   */
  phonetic: z.boolean(),
  decomposition: z.string().nullable(),
  etymologyHint: z.string().nullable(),
  etymologyType: z.string().nullable(),
  /**
   * For a pictophonetic character, which part supplied the sound and which
   * supplied the meaning. Both are glyphs that should appear in `decomposition`;
   * the client tags the parts by matching against them. The role belongs to the
   * pair, not the part — 山 is the meaning in 峰 and the sound in 仙 — so it can
   * only be read off the character being looked at.
   */
  etymologyPhonetic: z.string().nullable(),
  etymologySemantic: z.string().nullable(),
  radical: z.string().nullable(),
  strokes: z.array(z.string()).nullable(), // Array of SVG path strings
  strokeMedians: z.array(z.array(z.tuple([z.number(), z.number()]))).nullable(), // Array of coordinate pairs for each stroke
  strokeMatches: z.array(z.array(z.number()).nullable()).nullable(), // Array mapping each stroke to decomposition component indices
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VocabItemDto = z.infer<typeof VocabItemDto>;

/**
 * A vocab row as the admin screen sees it.
 *
 * Carries `disabled`, which the learner-facing DTOs deliberately omit — they can
 * never contain a disabled row, so exposing the flag there would be dead weight
 * and an invitation to filter in the wrong place.
 */
export const AdminVocabItemDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  translation: true,
  pinyin: true,
  vocabType: true,
  script: true,
  decomposition: true,
  radical: true,
}).extend({
  disabled: z.boolean(),
  /**
   * Only meaningful on a component: whether its own reading is taught. A stored
   * pinyin does not imply this — most components carry one borrowed from the
   * character they abbreviate — so the admin screen edits the two separately.
   */
  phonetic: z.boolean(),
});
export type AdminVocabItemDto = z.infer<typeof AdminVocabItemDto>;

export const AdminVocabCountDto = z.object({
  vocabType: z.enum(vocabTypeValues),
  disabled: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type AdminVocabCountDto = z.infer<typeof AdminVocabCountDto>;

export const SearchVocabItemsDto = z.object({
  items: z.array(VocabItemDto),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
export type SearchVocabItemsDto = z.infer<typeof SearchVocabItemsDto>;

export const VocabItemDetailedDto = VocabItemDto.extend({
  memoryAids: z.array(MemoryAidDto).nullable(),
  /** Total number of memory aids visible to the viewer, not just the current page. */
  memoryAidTotal: z.number().int().nonnegative(),
  /** The starred aid, if any — sorted to the front of `memoryAids` and shown with a star. */
  defaultMemoryAidId: z.string().nullable(),
  constituents: z.array(z.string()).nullable(),
});
export type VocabItemDetailedDto = z.infer<typeof VocabItemDetailedDto>;

/**
 * One glyph in a decomposition graph.
 *
 * `degree` is the node's degree across the WHOLE corpus, not within this
 * response. It is what makes hub components visibly large and tells the viewer
 * that 口 is shared by hundreds of characters, most of which are one hop further
 * out than this graph reaches.
 */
export const GraphNodeDto = z.object({
  vocabItem: z.string(),
  vocabType: VocabTypeEnum,
  pinyin: z.string(),
  translation: z.string().nullable(),
  degree: z.number().int().nonnegative(),
});
export type GraphNodeDto = z.infer<typeof GraphNodeDto>;

/**
 * A decomposition edge, kept directed on the wire (`parent` is built FROM
 * `child`) even though the view renders it undirected — the direction is what
 * lets the client tell "is made of" from "is used in" without a second lookup,
 * and cycles are harmless because the traversal is visited-set guarded.
 */
export const GraphEdgeDto = z.object({
  parent: z.string(),
  child: z.string(),
});
export type GraphEdgeDto = z.infer<typeof GraphEdgeDto>;

/**
 * The focus glyph, everything one hop from it, and every edge among that set.
 *
 * One hop and uncapped, which is what keeps it honest: this is the complete set
 * of a glyph's direct relationships, not a sample of them. It stays bounded
 * because degree does — the widest node in the corpus is 口 at 488, so the worst
 * case is a few hundred nodes rather than the 9.5k single component the graph
 * dissolves into at two hops or more.
 */
export const DecompositionGraphDto = z.object({
  focus: z.string(),
  nodes: z.array(GraphNodeDto),
  edges: z.array(GraphEdgeDto),
});
export type DecompositionGraphDto = z.infer<typeof DecompositionGraphDto>;

/**
 * One glyph in a deck graph: a corpus node plus its depth in the deck's unlock
 * order.
 *
 * `degree` is local to the deck here, unlike the one-hop view — the question a
 * deck answers is what it is shaped like, so a component used by three hundred
 * characters but four of *these* should be drawn the size it is here.
 */
export const DeckGraphNodeDto = GraphNodeDto.extend({
  /**
   * Levels below this glyph in the deck. 0 is a component, or a character whose
   * parts are not in this deck; anything higher is one past its deepest
   * prerequisite. See layerByPrerequisites in @/server/decomposition-graph.
   */
  level: z.number().int().nonnegative(),
});
export type DeckGraphNodeDto = z.infer<typeof DeckGraphNodeDto>;

/**
 * A whole deck as one graph, every node tagged with its unlock depth.
 *
 * Uncapped, because a deck is already bounded and curated — a few hundred rows —
 * and because the depth control is the way this view is narrowed. Filtering to
 * level <= N client-side is safe by construction: a prerequisite always sits on a
 * strictly lower level than the thing it gates, so no cut ever hides a part of
 * something it still shows.
 */
export const DeckGraphDto = z.object({
  nodes: z.array(DeckGraphNodeDto),
  edges: z.array(GraphEdgeDto),
  /** Deepest level present, so the client can size its depth control. */
  maxLevel: z.number().int().nonnegative(),
});
export type DeckGraphDto = z.infer<typeof DeckGraphDto>;

/**
 * A component cannot be typed on a pinyin IME, so a writing card is unreachable
 * for one. Narrowing the vocabType here makes the API reject it rather than
 * trusting every producer to remember. Reading and listening are *not* narrowed:
 * a phonetic component (艮 gěn behind 很, 跟, 根) keeps its own reading and is
 * quizzed on it. See canStudy in @/server/study-rules.
 */
const writable = z.enum(["sentence", "compound", "character"]);

const VocabItemStudyReadingDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  vocabType: true,
}).extend({
  studyType: z.literal("reading"),
});

const VocabItemStudyListeningDto = VocabItemDto.pick({
  id: true,
  audioUrl: true,
  vocabType: true,
}).extend({
  studyType: z.literal("listening"),
});

const VocabItemStudyUnderstandingDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  audioUrl: true,
  vocabType: true,
}).extend({
  studyType: z.literal("understanding"),
});

const VocabItemStudyWritingDto = VocabItemDto.pick({
  id: true,
  translation: true,
}).extend({
  vocabType: writable,
  studyType: z.literal("writing"),
});

const VocabItemStudyNewDto = VocabItemDto.extend({
  studyType: z.literal("new"),
  /**
   * The teachable parts of this item, already resolved server-side. Prefer this
   * over splitting `decomposition` on the client — only the server knows which
   * parts are disabled and must not be shown.
   */
  constituents: z.array(z.string()),
});

export const VocabItemStudyDto = z.discriminatedUnion("studyType", [
  VocabItemStudyReadingDto,
  VocabItemStudyListeningDto,
  VocabItemStudyUnderstandingDto,
  VocabItemStudyWritingDto,
  VocabItemStudyNewDto,
]);
export type VocabItemStudyDto = z.infer<typeof VocabItemStudyDto>;

export const StudyAnswerDto = z.object({
  vocabItemId: z.string(),
  studyType: z.enum([...studyTypeValues, "new"]),
  answer: z.string(),
});
export type StudyAnswerDto = z.infer<typeof StudyAnswerDto>;

/** How many non-disabled items a deck holds, split by type. */
export const DeckTypeCountsDto = z.object({
  sentence: z.number().int().nonnegative(),
  compound: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
  component: z.number().int().nonnegative(),
});
export type DeckTypeCountsDto = z.infer<typeof DeckTypeCountsDto>;

export const DeckDto = z.object({
  id: z.string(),
  deckName: z.string(),
  description: z.string(),
  createdById: z.string(),
  createdByUsername: z.string(),
  numLearners: z.number(),
  /**
   * Non-disabled items in the deck, constituents included. Counted with the same
   * `disabled = false` filter `getDeckById` applies, so the browse card and the
   * detail page can never disagree.
   */
  itemCount: z.number().int().nonnegative(),
  /** The same items as `itemCount`, split by type, so a card can show what a deck is made of. */
  typeCounts: DeckTypeCountsDto,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DeckDto = z.infer<typeof DeckDto>;

/**
 * `pinyin` and `audioUrl` are carried so the deck preview can pronounce a row
 * without a second round-trip. Both are `""` for a meaning-only component by
 * design — a phonetic one keeps its reading — so every consumer must treat empty
 * as "no audio", not as a bug.
 */
export const DeckVocabItemSummaryDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  vocabType: true,
  translation: true,
  pinyin: true,
  audioUrl: true,
});
export type DeckVocabItemSummaryDto = z.infer<typeof DeckVocabItemSummaryDto>;

export const DeckDetailedDto = DeckDto.extend({
  vocabItems: z.array(DeckVocabItemSummaryDto),
});
export type DeckDetailedDto = z.infer<typeof DeckDetailedDto>;

export const UserVocabItemDto = VocabItemDto.extend({
  userId: z.string(),
  username: z.string(),
  seen: z.boolean(),
  readingLevel: z.number(),
  listeningLevel: z.number(),
  understandingLevel: z.number(),
  writingLevel: z.number(),
  memoryAidId: z.string().nullable(),
  memoryAid: z.string().nullable(),
  readingNextAt: z.date().nullable(),
  listeningNextAt: z.date().nullable(),
  understandingNextAt: z.date().nullable(),
  writingNextAt: z.date().nullable(),
  /** See VocabItemStudyNewDto.constituents — resolved server-side, disabled parts removed. */
  constituents: z.array(z.string()),
});
export type UserVocabItemDto = z.infer<typeof UserVocabItemDto>;

/**
 * A learner's standing in one deck.
 *
 * `total` counts only items the viewer's enabled study types can actually quiz;
 * items with no servable type are reported separately as `unstudiable` and kept
 * out of every other figure. Folding them in would bucket them at stage 0
 * forever — `weakestServableLevel` returns Infinity for them and
 * `growthStage(Infinity)` silently reads as "Not started" — permanently
 * inflating the not-started segment with items nobody can ever grow.
 */
export const DeckProgressDto = z.object({
  deckId: z.string(),
  total: z.number().int().nonnegative(),
  unstudiable: z.number().int().nonnegative(),
  /** Items answered at least once. Not the same as level > 0 — a wrong answer leaves the item seen at level 0. */
  seen: z.number().int().nonnegative(),
  dueNow: z.number().int().nonnegative(),
  /** Unlocked and never seen: available to start right now. */
  newAvailable: z.number().int().nonnegative(),
  /** Unseen and still gated behind constituents that have not grown enough. */
  locked: z.number().int().nonnegative(),
  /** Item counts per growth stage, index 0..5 (Not started → Evergreen). Sums to `total`. */
  byStage: z.array(z.number().int().nonnegative()).length(6),
});
export type DeckProgressDto = z.infer<typeof DeckProgressDto>;

// ---------------------------------------------------------------------------
// Suggestions (learner-reported corrections, reviewed in the admin screen)
// ---------------------------------------------------------------------------

const suggestionKindValues = [
  "translation",
  "pinyin",
  "decomposition",
  "audio",
  "memoryAid",
  "other",
] as const;
export const SuggestionKindEnum = z.enum(suggestionKindValues);
export type SuggestionKind = z.infer<typeof SuggestionKindEnum>;

const suggestionStatusValues = ["open", "resolved", "rejected"] as const;
export const SuggestionStatusEnum = z.enum(suggestionStatusValues);
export type SuggestionStatus = z.infer<typeof SuggestionStatusEnum>;

/** Free text a learner types when reporting a problem. */
export const SUGGESTION_BODY_MAX = 1000;

export const MEMORY_AID_MAX = 1000;

export const DECK_NAME_MAX = 80;
export const DECK_DESCRIPTION_MAX = 500;
/**
 * How many glyphs one deck create may name.
 *
 * Also, at present, what keeps the create under Postgres's 65,535 bound
 * parameters per statement. `VocabService.insertVocabItems` sends every word a
 * create invented as ONE multi-row INSERT at 7 parameters a row, so it fails
 * above about 9,362 new rows in a single create — unreachable from 200 words,
 * whose parts are already in the dictionary, and unreachable in practice
 * because resolving that many new words would take over an hour of DeepL and
 * speech synthesis first. Raising this materially means chunking that insert.
 */
export const DECK_ITEMS_MAX = 200;

/**
 * How many suggestions one account may file per hour. Enforced by counting the
 * user's own recent rows rather than a shared counter table, so it is
 * self-cleaning and survives a redeploy.
 */
export const SUGGESTION_RATE_LIMIT = 10;
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000;

export const SuggestionDto = z.object({
  id: z.string(),
  kind: SuggestionKindEnum,
  body: z.string(),
  status: SuggestionStatusEnum,
  vocabItemId: z.string().nullable(),
  memoryAidId: z.string().nullable(),
  adminNote: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SuggestionDto = z.infer<typeof SuggestionDto>;

/**
 * A suggestion as the review queue sees it: joined to whoever filed it and to
 * the vocab row it is about, so the admin never has to look either one up.
 */
export const AdminSuggestionDto = SuggestionDto.extend({
  createdById: z.string(),
  createdByUsername: z.string(),
  createdByEmail: z.string(),
  /** Null when the suggestion is not about a specific vocab row. */
  vocabItem: z.string().nullable(),
  vocabType: z.enum(vocabTypeValues).nullable(),
  translation: z.string().nullable(),
  pinyin: z.string().nullable(),
  /** The memory-aid text being reported, when the target is a memory aid. */
  memoryAid: z.string().nullable(),
  resolvedById: z.string().nullable(),
  resolvedAt: z.date().nullable(),
});
export type AdminSuggestionDto = z.infer<typeof AdminSuggestionDto>;

export const SuggestionCountDto = z.object({
  status: SuggestionStatusEnum,
  count: z.number().int().nonnegative(),
});
export type SuggestionCountDto = z.infer<typeof SuggestionCountDto>;

/**
 * Longest each caller-supplied auth field may be, shared so the sign-up form
 * and the server agree on one number.
 *
 * These are a security bound before they are a validation nicety. The auth
 * routes that answer a question about one email address are held to a fixed
 * response-time bucket (`src/server/auth-timing.ts`), and a bucket only hides
 * the difference between two paths while both fit inside it. The caller decides
 * how much work one of them does: a sign-up for a free address renders the
 * submitted `name` into a verification email, a sign-up for a taken one does
 * not, and a 4 MB name pushed the free path into its third bucket while the
 * taken path stayed in its first — disjoint distributions, one request, a
 * sharper oracle than the one the bucket closed. No quantum is large enough to
 * survive an unbounded input, so the input is what has to be bounded.
 *
 * `name` matches the sign-up form's own rule, so no honest request is ever
 * refused by it. The two URL fields are generous for a real callback and
 * useless as a lever. Password length is better-auth's own (10 to 128).
 */
export const AUTH_FIELD_LIMITS = {
  /** Same 30 the sign-up form asks for. */
  name: 30,
  /** RFC 5321's maximum path length for an address. */
  email: 254,
  newEmail: 254,
  image: 2048,
  callbackURL: 512,
  redirectTo: 512,
} as const;
export type AuthField = keyof typeof AUTH_FIELD_LIMITS;
