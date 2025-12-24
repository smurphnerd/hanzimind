import { z } from "zod/v4";

export const studyTypeValues = [
  "reading",
  "listening",
  "understanding",
  "writing",
] as const;
export const StudyTypeEnum = z.enum(studyTypeValues);
export type StudyType = z.infer<typeof StudyTypeEnum>;

const vocabTypeValues = ["sentence", "compound", "character"] as const;
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
  usageCount: z.number().int().positive(),
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

export const VocabItemDetailedDto = VocabItemDto.extend({
  memoryAids: z.array(MemoryAidDto).nullable(),
  constituents: z.array(z.string()).nullable(),
});
export type VocabItemDetailedDto = z.infer<typeof VocabItemDetailedDto>;

const VocabItemStudyReadingDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
}).extend({
  studyType: z.literal("reading"),
});

const VocabItemStudyListeningDto = VocabItemDto.pick({
  id: true,
  audioUrl: true,
}).extend({
  studyType: z.literal("listening"),
});

const VocabItemStudyUnderstandingDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  audioUrl: true,
}).extend({
  studyType: z.literal("understanding"),
});

const VocabItemStudyWritingDto = VocabItemDto.pick({
  id: true,
  translation: true,
}).extend({
  studyType: z.literal("writing"),
});

const VocabItemStudyNewDto = VocabItemDto.extend({
  studyType: z.literal("new"),
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

export const DeckDto = z.object({
  id: z.string(),
  deckName: z.string(),
  description: z.string(),
  createdById: z.string(),
  createdByUsername: z.string(),
  numLearners: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DeckDto = z.infer<typeof DeckDto>;

export const DeckVocabItemSummaryDto = VocabItemDto.pick({
  id: true,
  vocabItem: true,
  vocabType: true,
  translation: true,
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
});
export type UserVocabItemDto = z.infer<typeof UserVocabItemDto>;
