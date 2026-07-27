import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { authProcedure } from "@/server/endpoints/procedure";
import { isOverSuggestionRateLimit } from "@/server/services/SuggestionService";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_RATE_WINDOW_MS,
  SuggestionDto,
  SuggestionKindEnum,
} from "@/definitions/definitions";

export const suggestionsRouter = {
  create: authProcedure
    .input(
      z.object({
        kind: SuggestionKindEnum,
        body: z.string().trim().min(1).max(SUGGESTION_BODY_MAX),
        vocabItemId: z.string().nullish(),
        memoryAidId: z.string().nullish(),
      }),
    )
    .output(SuggestionDto)
    .handler(async ({ input, context, errors }) => {
      const recent = await context.cradle.suggestionService.countRecentForUser(
        context.user.id,
        SUGGESTION_RATE_WINDOW_MS,
      );

      if (isOverSuggestionRateLimit(recent)) {
        context.cradle.logger.warn(
          { userId: context.user.id, recent },
          "Rate-limited a suggestion",
        );
        throw errors.TOO_MANY_REQUESTS();
      }

      try {
        return await context.cradle.suggestionService.create({
          userId: context.user.id,
          kind: input.kind,
          body: input.body,
          vocabItemId: input.vocabItemId,
          memoryAidId: input.memoryAidId,
        });
      } catch (error) {
        // Log the real cause, return a fixed string. Passing `error.message`
        // through hands the caller raw Postgres text — a bad vocabItemId comes
        // back as a foreign-key violation naming the table, the column and the
        // referenced table, which is both a leak and useless to the user.
        context.cradle.logger.error(
          { err: error, userId: context.user.id },
          "Failed to record a suggestion",
        );
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to record the suggestion",
          cause: error,
        });
      }
    }),
};
