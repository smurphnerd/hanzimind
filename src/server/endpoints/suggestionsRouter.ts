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

      return await context.cradle.suggestionService.create({
        userId: context.user.id,
        kind: input.kind,
        body: input.body,
        vocabItemId: input.vocabItemId,
        memoryAidId: input.memoryAidId,
      });
    }),
};
