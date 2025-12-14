import { z } from "zod/v4";

const vocabTypeValues = ["sentence", "compound", "character"] as const;
export const VocabTypeEnum = z.enum(vocabTypeValues);
export type VocabType = z.infer<typeof VocabTypeEnum>;

const etymologyTypeValues = [
  "ideographic",
  "pictographic",
  "pictophonetic",
] as const;
export const EtymologyTypeEnum = z.enum(etymologyTypeValues);
export type EtymologyType = z.infer<typeof EtymologyTypeEnum>;

export { vocabTypeValues, etymologyTypeValues };
