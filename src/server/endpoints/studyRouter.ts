import { z } from "zod";

import { authProcedure } from "@/server/endpoints/procedure";
import { InvalidInputError } from "@/server/endpoints/errors";
import type { StudyService } from "@/server/services/StudyService";
import {
  DeckProgressDto,
  UserVocabItemDto,
  StudyAnswerDto,
  VocabItemStudyDto,
} from "@/definitions/definitions";

/** Refuse the write at the boundary, before any service touches the item. */
async function assertStudyingItemInDeck(
  studyService: Pick<StudyService, "isStudyingItemInDeck">,
  userId: string,
  deckId: string,
  vocabItemId: string,
): Promise<void> {
  if (await studyService.isStudyingItemInDeck(userId, deckId, vocabItemId)) {
    return;
  }

  throw new InvalidInputError("That item is not in a deck you are studying.");
}

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

      await assertStudyingItemInDeck(
        context.cradle.studyService,
        userId,
        deckId,
        answer.vocabItemId,
      );

      return context.cradle.studyService.answerAndAdvance({
        userId,
        deckId,
        answer,
      });
    }),

  addSynonym: authProcedure
    .input(
      z.object({
        deckId: z.string(),
        vocabItemId: z.string(),
        synonym: z.string().min(1).max(100),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      await assertStudyingItemInDeck(
        context.cradle.studyService,
        context.user.id,
        input.deckId,
        input.vocabItemId,
      );

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
