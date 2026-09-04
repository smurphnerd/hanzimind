import { z } from "zod";

import { authProcedure } from "@/server/endpoints/procedure";
import {
  DeckProgressDto,
  UserVocabItemDto,
  StudyAnswerDto,
  VocabItemStudyDto,
} from "@/definitions/definitions";

const deckSettingsSchema = z.object({
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

      await context.cradle.studyService.addDeck({
        userId,
        deckId: input.deckId,
        readingEnabled: input.readingEnabled,
        listeningEnabled: input.listeningEnabled,
        understandingEnabled: input.understandingEnabled,
        writingEnabled: input.writingEnabled,
      });

      return { success: true };
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

      await context.cradle.studyService.updateDeckSettings({
        userId,
        deckId: input.deckId,
        readingEnabled: input.readingEnabled,
        listeningEnabled: input.listeningEnabled,
        understandingEnabled: input.understandingEnabled,
        writingEnabled: input.writingEnabled,
      });

      return { success: true };
    }),

  submitAnswer: authProcedure
    .input(z.object({ deckId: z.string(), answer: StudyAnswerDto }))
    .output(
      z.object({
        correct: z.boolean(),
        userVocabItem: UserVocabItemDto,
        nextVocabItem: VocabItemStudyDto.nullable(),
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

      return { correct, userVocabItem, nextVocabItem };
    }),

  addSynonym: authProcedure
    .input(
      z.object({
        vocabItemId: z.string(),
        synonym: z.string().min(1).max(100),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      await context.cradle.studyService.addSynonym({
        userId: context.user.id,
        vocabItemId: input.vocabItemId,
        synonym: input.synonym,
      });
      return { success: true };
    }),

  deckProgress: authProcedure
    // One call for the whole study list — the page renders up to 50 decks.
    .input(z.object({ deckIds: z.array(z.string()).max(100) }))
    .output(z.array(DeckProgressDto))
    .handler(async ({ input, context }) => {
      return context.cradle.studyService.getDeckProgress(
        context.user.id,
        input.deckIds,
      );
    }),

  nextVocabItem: authProcedure
    .input(z.object({ deckId: z.string() }))
    .output(VocabItemStudyDto.nullable())
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      const { deckId } = input;

      const nextVocabItem = await context.cradle.studyService.getNextVocabItem(
        userId,
        deckId,
      );

      return nextVocabItem;
    }),
};
