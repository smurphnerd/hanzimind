import { inArray } from "drizzle-orm";
import { z } from "zod";
import { ORPCError } from "@orpc/client";

import { authProcedure } from "@/server/endpoints/procedure";
import { schema } from "@/server/database/schema";
import { DeckDto, DeckDetailedDto } from "@/definitions/definitions";

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
        deckName: z.string(),
        description: z.string(),
        vocabList: z.array(z.string()),
      }),
    )
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { deckName, description, vocabList } = input;
      const userId = context.user.id;

      // Check which vocab items already exist
      const existingVocabItems =
        await context.cradle.vocabService.getExistingVocabItems(vocabList);

      // Find missing vocab items
      const missingVocabItems = vocabList.filter(
        (item) => !existingVocabItems.includes(item),
      );

      // Create missing vocab items with their components
      for (const vocabItem of missingVocabItems) {
        try {
          await context.cradle.vocabService.addVocabItem(vocabItem);
        } catch (error) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: `Failed to create vocab item: ${vocabItem}`,
            cause: error,
          });
        }
      }

      const vocabSet = new Set(vocabList);
      for (const vocabItem of vocabList) {
        const components =
          await context.cradle.vocabService.getVocabItemPartsDeep(vocabItem);
        components.forEach((component) => {
          vocabSet.add(component);
        });
      }

      // Create the deck
      const deckId = await context.cradle.database.transaction(async (tx) => {
        const [deck] = await tx
          .insert(schema.decks)
          .values({
            deckName,
            description,
            createdById: userId,
          })
          .returning({ id: schema.decks.id });

        if (!deck) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create deck",
          });
        }

        const originalVocabSet = new Set(vocabList);

        if (vocabSet.size > 0) {
          const vocabItems = await tx
            .select({
              id: schema.vocabItems.id,
              vocabItem: schema.vocabItems.vocabItem,
            })
            .from(schema.vocabItems)
            .where(inArray(schema.vocabItems.vocabItem, Array.from(vocabSet)));

          if (vocabItems.length > 0) {
            await tx.insert(schema.deckVocabItems).values(
              vocabItems.map((item) => {
                const isConstituent = !originalVocabSet.has(item.vocabItem);

                return {
                  deckId: deck.id,
                  vocabItemId: item.id,
                  isConstituent,
                };
              }),
            );
          }
        }

        return deck.id;
      });

      return { id: deckId };
    }),

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
    .input(
      z.object({
        deckId: z.string(),
        includeConstituents: z.boolean().optional().default(false),
      }),
    )
    .output(DeckDetailedDto)
    .handler(async ({ input, context }) => {
      const { deckId, includeConstituents } = input;

      try {
        return await context.cradle.deckService.getDeckById({
          deckId,
          includeConstituents,
        });
      } catch (error) {
        throw new ORPCError("NOT_FOUND", {
          message: "Deck not found",
          cause: error,
        });
      }
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
