import { z } from "zod";

import { authProcedure, commonProcedure } from "@/server/endpoints/procedure";
import {
  DecompositionGraphDto,
  MEMORY_AID_MAX,
  MemoryAidDto,
  SearchLanguageEnum,
  SearchVocabItemsDto,
  VocabItemDetailedDto,
} from "@/definitions/definitions";

const searchVocabItemsSchema = z.object({
  query: z.string().min(1),
  searchLanguage: SearchLanguageEnum,
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
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
          .max(100)
          .optional()
          .default(20),
      }),
    )
    .output(VocabItemDetailedDto)
    .handler(async ({ input, context }) => {
      // Public endpoint: include the viewer's own private memory aids when
      // they happen to be signed in, but never anyone else's.
      const session = await context.cradle.auth.api.getSession({
        headers: context.headers,
      });
      return await context.cradle.vocabService.getVocabItemDetailed({
        ...input,
        viewerId: session?.user?.id,
      });
    }),

  search: commonProcedure
    .input(searchVocabItemsSchema)
    .output(SearchVocabItemsDto)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.searchVocabItems(input);
    }),

  /**
   * One hop of the decomposition graph around a glyph, with every connection.
   *
   * Uncapped by design — a partial list of a glyph's direct relationships cannot
   * be told apart from a complete one, so sampling would misinform. Degree keeps
   * it bounded: the widest node in the corpus is 口 at 488.
   */
  graph: commonProcedure
    .input(z.object({ vocabItem: z.string().min(1) }))
    .output(DecompositionGraphDto)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.getDecompositionGraph(
        input.vocabItem,
      );
    }),

  createMemoryAid: authProcedure
    .input(
      z.object({
        vocabItemId: z.string(),
        memoryAid: z.string().trim().min(1).max(MEMORY_AID_MAX),
      }),
    )
    .output(MemoryAidDto)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.createMemoryAid({
        vocabItemId: input.vocabItemId,
        userId: context.user.id,
        memoryAid: input.memoryAid,
      });
    }),
};
