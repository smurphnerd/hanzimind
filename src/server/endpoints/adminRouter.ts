import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { adminProcedure } from "@/server/endpoints/procedure";
import {
  AdminVocabCountDto,
  AdminVocabItemDto,
  VocabTypeEnum,
} from "@/definitions/definitions";

const listVocabItemsSchema = z.object({
  search: z.string().optional(),
  vocabType: VocabTypeEnum.optional(),
  disabled: z.boolean().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(200).optional().default(50),
});

const pagingInfoSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const adminRouter = {
  /** Counts per bucket, so the page can show what it is partitioning. */
  vocabCounts: adminProcedure
    .output(z.array(AdminVocabCountDto))
    .handler(async ({ context }) => {
      return await context.cradle.adminService.getVocabCounts();
    }),

  listVocabItems: adminProcedure
    .input(listVocabItemsSchema)
    .output(
      z.object({
        items: z.array(AdminVocabItemDto),
        pagingInfo: pagingInfoSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const { items, total, page, pageSize, totalPages } =
        await context.cradle.adminService.listVocabItems(input);

      return { items, pagingInfo: { page, pageSize, total, totalPages } };
    }),

  updateVocabItem: adminProcedure
    .input(
      z
        .object({
          id: z.string(),
          vocabType: VocabTypeEnum.optional(),
          disabled: z.boolean().optional(),
          translation: z.string().min(1).max(500).optional(),
        })
        // A request that changes nothing is a client bug, not a no-op worth
        // hiding — surface it rather than reporting success.
        .refine(
          (input) =>
            input.vocabType !== undefined ||
            input.disabled !== undefined ||
            input.translation !== undefined,
          { message: "Nothing to update" },
        ),
    )
    .output(AdminVocabItemDto)
    .handler(async ({ input, context }) => {
      try {
        return await context.cradle.adminService.updateVocabItem(input);
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to update vocab item",
          cause: error,
        });
      }
    }),
};
