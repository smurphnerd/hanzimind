import { z } from "zod";
import { ORPCError } from "@orpc/client";

import { commonProcedure } from "@/server/endpoints/procedure";
import {
  SearchLanguageEnum,
  VocabItemDetailedDto,
} from "@/definitions/definitions";

const searchVocabItemsSchema = z.object({
  query: z.string().min(1),
  searchLanguage: SearchLanguageEnum,
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(10000).optional().default(20),
});

export const vocabRouter = {
  get: commonProcedure
    .input(
      z.object({
        vocabItem: z.string(),
        memoryAidPage: z.number().int().positive().optional().default(1),
        memoryAidPageSize: z
          .number()
          .int()
          .positive()
          .max(10000)
          .optional()
          .default(20),
      }),
    )
    .output(VocabItemDetailedDto)
    .handler(async ({ input, context }) => {
      try {
        return await context.cradle.vocabService.getVocabItemDetailed(input);
      } catch (error) {
        throw new ORPCError("NOT_FOUND", {
          message:
            error instanceof Error ? error.message : "Vocab item not found",
          cause: error,
        });
      }
    }),

  search: commonProcedure
    .input(searchVocabItemsSchema)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.searchVocabItems(input);
    }),
};
