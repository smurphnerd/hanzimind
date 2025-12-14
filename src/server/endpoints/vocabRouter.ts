import { z } from "zod";

import { commonProcedure } from "@/server/endpoints/procedure";

const listVocabItemsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(10000).optional().default(20),
});

export const vocabRouter = {
  list: commonProcedure
    .input(listVocabItemsSchema)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.listVocabItems(input);
    }),
};
