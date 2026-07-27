import { z } from "zod/v4";

export const studyTypeValues = [
  "reading",
  "listening",
  "understanding",
  "writing",
] as const;
export const StudyTypeEnum = z.enum(studyTypeValues);
export type StudyType = z.infer<typeof StudyTypeEnum>;

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

const etymologyTypeValues = [
  "ideographic",
  "pictographic",
  "pictophonetic",
] as const;
export const EtymologyTypeEnum = z.enum(etymologyTypeValues);
export type EtymologyType = z.infer<typeof EtymologyTypeEnum>;

export const MemoryAidDto = z.object({
  id: z.string(),
  memoryAid: z.string(),
  createdById: z.string(),
  createdByUsername: z.string(),
  usageCount: z.number().int().nonnegative(),
});
export type MemoryAidDto = z.infer<typeof MemoryAidDto>;

export const VocabItemDto = z.object({
  id: z.string(),
  vocabItem: z.string(),
  translation: z.string().nullable(),
  pinyin: z.string(),
  vocabType: z.enum(vocabTypeValues),
  audioUrl: z.string(),
  decomposition: z.string().nullable(),
  etymologyHint: z.string().nullable(),
  etymologyType: z.string().nullable(),
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
  decomposition: true,
  radical: true,
}).extend({
  disabled: z.boolean(),
});
export type AdminVocabItemDto = z.infer<typeof AdminVocabItemDto>;

export const AdminVocabCountDto = z.object({
  vocabType: z.enum(vocabTypeValues),
  disabled: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type AdminVocabCountDto = z.infer<typeof AdminVocabCountDto>;

export const VocabItemDetailedDto = VocabItemDto.extend({
  memoryAids: z.array(MemoryAidDto).nullable(),
  /** Total number of memory aids visible to the viewer, not just the current page. */
  memoryAidTotal: z.number().int().nonnegative(),
  constituents: z.array(z.string()).nullable(),
});
export type VocabItemDetailedDto = z.infer<typeof VocabItemDetailedDto>;

/**
 * Components are meaning-only — they have no reading of their own and cannot be
 * typed — so reading, listening and writing cards are unreachable for them.
 * Narrowing the vocabType here makes the API reject one rather than trusting
 * every producer to remember. See canStudy in @/server/study-rules.
 */
const quizzableByPronunciation = z.enum(["sentence", "compound", "character"]);

const VocabItemStudyReadingDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
}).extend({
  vocabType: quizzableByPronunciation,
  studyType: z.literal("reading"),
});

const VocabItemStudyListeningDto = VocabItemDto.pick({
  id: true,
  audioUrl: true,
}).extend({
  vocabType: quizzableByPronunciation,
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
  vocabType: quizzableByPronunciation,
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
}).extend({
  userId: z.string(),
  deckId: z.string(),
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
 * without a second round-trip. Both are `""` for components by design — they are
 * meaning-only — so every consumer must treat empty as "no audio", not as a bug.
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

// User deck relationship schema
export const UserDeckDto = z.object({
  userId: z.string(),
  deckId: z.string(),
  includeConstituents: z.boolean(),
  readingEnabled: z.boolean(),
  listeningEnabled: z.boolean(),
  understandingEnabled: z.boolean(),
  writingEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type UserDeckDto = z.infer<typeof UserDeckDto>;

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

export const suggestionKindValues = [
  "translation",
  "pinyin",
  "decomposition",
  "audio",
  "memoryAid",
  "other",
] as const;
export const SuggestionKindEnum = z.enum(suggestionKindValues);
export type SuggestionKind = z.infer<typeof SuggestionKindEnum>;

export const suggestionStatusValues = ["open", "resolved", "rejected"] as const;
export const SuggestionStatusEnum = z.enum(suggestionStatusValues);
export type SuggestionStatus = z.infer<typeof SuggestionStatusEnum>;

/** Free text a learner types when reporting a problem. */
export const SUGGESTION_BODY_MAX = 1000;

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
