import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { adminProcedure } from "@/server/endpoints/procedure";
import {
  AdminMemoryAidDto,
  AdminSuggestionDto,
  AdminVocabCountDto,
  AdminVocabItemDto,
  MemoryAidDto,
  SuggestionCountDto,
  SuggestionStatusEnum,
  VocabTypeEnum,
} from "@/definitions/definitions";

/** Matches the definition-length ceiling; a memory aid is a sentence or two. */
const MEMORY_AID_MAX = 500;

const adminMemoryAidsOutput = z.object({
  items: z.array(AdminMemoryAidDto),
  defaultMemoryAidId: z.string().nullable(),
});

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
          // Unlike the definition this may be empty: a bound form or an
          // unromanisable glyph legitimately has no reading.
          pinyin: z.string().max(200).optional(),
        })
        // A request that changes nothing is a client bug, not a no-op worth
        // hiding — surface it rather than reporting success.
        .refine(
          (input) =>
            input.vocabType !== undefined ||
            input.disabled !== undefined ||
            input.translation !== undefined ||
            input.pinyin !== undefined,
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

  suggestionCounts: adminProcedure
    .output(z.array(SuggestionCountDto))
    .handler(async ({ context }) => {
      return await context.cradle.suggestionService.counts();
    }),

  listSuggestions: adminProcedure
    .input(
      z.object({
        status: SuggestionStatusEnum.optional(),
        page: z.number().int().positive().optional().default(1),
        pageSize: z.number().int().positive().max(200).optional().default(25),
      }),
    )
    .output(
      z.object({
        items: z.array(AdminSuggestionDto),
        pagingInfo: pagingInfoSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const { items, total, page, pageSize, totalPages } =
        await context.cradle.suggestionService.list(input);

      return { items, pagingInfo: { page, pageSize, total, totalPages } };
    }),

  listMemoryAids: adminProcedure
    .input(z.object({ vocabItemId: z.string() }))
    .output(adminMemoryAidsOutput)
    .handler(async ({ input, context }) => {
      return await context.cradle.vocabService.listMemoryAidsForItemAdmin(
        input.vocabItemId,
      );
    }),

  createMemoryAid: adminProcedure
    .input(
      z.object({
        vocabItemId: z.string(),
        memoryAid: z.string().trim().min(1).max(MEMORY_AID_MAX),
      }),
    )
    .output(MemoryAidDto)
    .handler(async ({ input, context }) => {
      try {
        return await context.cradle.vocabService.createMemoryAid({
          vocabItemId: input.vocabItemId,
          userId: context.user.id,
          memoryAid: input.memoryAid,
          // Curated by an admin: visible to everyone straight away.
          public: true,
        });
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to create memory aid",
          cause: error,
        });
      }
    }),

  setDefaultMemoryAid: adminProcedure
    .input(
      z.object({
        vocabItemId: z.string(),
        // Null clears the star.
        memoryAidId: z.string().nullable(),
      }),
    )
    .output(z.object({ defaultMemoryAidId: z.string().nullable() }))
    .handler(async ({ input, context }) => {
      try {
        return await context.cradle.vocabService.setDefaultMemoryAid({
          vocabItemId: input.vocabItemId,
          memoryAidId: input.memoryAidId,
        });
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to set the default memory aid",
          cause: error,
        });
      }
    }),

  setSuggestionStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: SuggestionStatusEnum,
        /** Omitted leaves any existing note alone; null clears it. */
        adminNote: z.string().max(1000).nullish(),
      }),
    )
    .output(AdminSuggestionDto)
    .handler(async ({ input, context }) => {
      try {
        return await context.cradle.suggestionService.setStatus({
          id: input.id,
          status: input.status,
          adminNote: input.adminNote,
          reviewerId: context.user.id,
        });
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to update the suggestion",
          cause: error,
        });
      }
    }),
};
