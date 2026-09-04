import { z } from "zod";

import { authProcedure } from "@/server/endpoints/procedure";
import {
  DECK_DESCRIPTION_MAX,
  DECK_ITEMS_MAX,
  DECK_NAME_MAX,
  DeckDetailedDto,
  DeckDto,
  DeckGraphDto,
} from "@/definitions/definitions";

const browseDecksSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
});

const getUserDecksSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
});

const userDeckResponseSchema = DeckDto.extend({
  lastStudied: z.date(),
  includeConstituents: z.boolean(),
  readingEnabled: z.boolean(),
  listeningEnabled: z.boolean(),
  understandingEnabled: z.boolean(),
  writingEnabled: z.boolean(),
});

const pagingInfoSchema = z.object({
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
});

export const decksRouter = {
  create: authProcedure
    .input(
      z.object({
        deckName: z.string().trim().min(1).max(DECK_NAME_MAX),
        description: z.string().trim().max(DECK_DESCRIPTION_MAX),
        vocabList: z.array(z.string()).max(DECK_ITEMS_MAX),
      }),
    )
    .output(z.object({ id: z.string(), skipped: z.array(z.string()) }))
    .handler(async ({ input, context }) =>
      context.cradle.deckService.createDeck(context.user.id, input),
    ),

  browse: authProcedure
    .input(browseDecksSchema)
    .output(
      z.object({
        decks: z.array(DeckDto),
        pagingInfo: pagingInfoSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const { search, page, perPage } = input;

      const { decks, total } = await context.cradle.deckService.browseDeck({
        search,
        page,
        perPage,
      });

      return {
        decks,
        pagingInfo: { page, perPage, total },
      };
    }),

  getById: authProcedure
    .input(z.object({ deckId: z.string() }))
    .output(DeckDetailedDto)
    .handler(async ({ input, context }) => {
      const { deckId } = input;

      return await context.cradle.deckService.getDeckById({ deckId });
    }),

  /**
   * A deck as one graph, uncapped, with every node's unlock depth.
   *
   * Separate from `getById` rather than folded into it: the graph needs each item's
   * `decomposition`, which the preview does not, and it is only fetched when a
   * viewer switches to that view.
   */
  graph: authProcedure
    .input(z.object({ deckId: z.string() }))
    .output(DeckGraphDto)
    .handler(async ({ input, context }) => {
      return await context.cradle.deckService.getDeckGraph({
        deckId: input.deckId,
      });
    }),

  getUserDecks: authProcedure
    .input(getUserDecksSchema)
    .output(
      z.object({
        decks: z.array(userDeckResponseSchema),
        pagingInfo: pagingInfoSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const { page, perPage } = input;
      const userId = context.user.id;

      const { decks, total } = await context.cradle.deckService.getUserDecks({
        userId,
        page,
        perPage,
      });

      return {
        decks,
        pagingInfo: { page, perPage, total },
      };
    }),
};
