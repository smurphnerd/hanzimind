import { z } from "zod";
import { ORPCError } from "@orpc/client";

import { authProcedure } from "@/server/endpoints/procedure";
import {
  UserVocabItemDto,
  StudyAnswerDto,
  VocabItemStudyDto,
} from "@/definitions/definitions";

const deckSettingsSchema = z.object({
  includeConstituents: z.boolean(),
  readingEnabled: z.boolean(),
  listeningEnabled: z.boolean(),
  understandingEnabled: z.boolean(),
  writingEnabled: z.boolean(),
});

export const studyRouter = {
  addDeck: authProcedure
    .input(
      z
        .object({
          deckId: z.string(),
        })
        .merge(deckSettingsSchema),
    )
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;

      try {
        await context.cradle.studyService.addDeck({
          userId,
          deckId: input.deckId,
          includeConstituents: input.includeConstituents,
          readingEnabled: input.readingEnabled,
          listeningEnabled: input.listeningEnabled,
          understandingEnabled: input.understandingEnabled,
          writingEnabled: input.writingEnabled,
        });

        return { success: true };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to add deck to study list",
          cause: error,
        });
      }
    }),

  updateDeckSettings: authProcedure
    .input(
      z
        .object({
          deckId: z.string(),
        })
        .merge(deckSettingsSchema),
    )
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;

      try {
        await context.cradle.studyService.updateDeckSettings({
          userId,
          deckId: input.deckId,
          includeConstituents: input.includeConstituents,
          readingEnabled: input.readingEnabled,
          listeningEnabled: input.listeningEnabled,
          understandingEnabled: input.understandingEnabled,
          writingEnabled: input.writingEnabled,
        });

        return { success: true };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to update deck settings",
          cause: error,
        });
      }
    }),

  submitAnswer: authProcedure
    .input(z.object({ deckId: z.string(), answer: StudyAnswerDto }))
    .output(
      z.object({
        correct: z.boolean(),
        userVocabItem: UserVocabItemDto,
        nextVocabItem: VocabItemStudyDto,
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      const { deckId, answer } = input;

      const correct = await context.cradle.studyService.processAnswer(
        answer,
        userId,
      );
      const userVocabItem = await context.cradle.studyService.getUserVocabItem(
        userId,
        answer.vocabItemId,
      );
      const nextVocabItem = await context.cradle.studyService.getNextVocabItem(
        userId,
        deckId,
      );
      console.log(nextVocabItem);

      return { correct, userVocabItem, nextVocabItem };
    }),

  nextVocabItem: authProcedure
    .input(z.object({ deckId: z.string() }))
    .output(VocabItemStudyDto)
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      const { deckId } = input;

      const nextVocabItem = await context.cradle.studyService.getNextVocabItem(
        userId,
        deckId,
      );

      return nextVocabItem;
    }),

  markAsSeenAndGetNext: authProcedure
    .input(z.object({ deckId: z.string(), vocabItemId: z.string() }))
    .output(VocabItemStudyDto.nullable())
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      const { deckId, vocabItemId } = input;

      // Mark vocab item as seen
      await context.cradle.studyService.markVocabItemAsSeen(
        userId,
        vocabItemId,
      );

      // Get next vocab item
      const nextVocabItem = await context.cradle.studyService.getNextVocabItem(
        userId,
        deckId,
      );

      return nextVocabItem;
    }),
};
