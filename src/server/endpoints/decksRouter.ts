import { and, count, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { authProcedure } from "@/server/endpoints/procedure";
import { schema } from "@/server/database/schema";

const createDeckSchema = z.object({
  deckName: z.string().min(1),
  description: z.string().min(1),
  vocabList: z.array(z.string()).optional().default([]),
});

const browseDecksSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
});

const getUserDecksSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
});

const deckResponseSchema = z.object({
  id: z.string(),
  deckName: z.string(),
  description: z.string(),
  createdById: z.string(),
  createdByUsername: z.string(),
  createdDate: z.date(),
  numLearners: z.number(),
});

const userDeckResponseSchema = deckResponseSchema.extend({
  lastStudied: z.date(),
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
        const result =
          await context.cradle.vocabService.addVocabItem(vocabItem);

        if (result.isErr()) {
          throw result.error;
        }
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
          throw new Error("Failed to create deck");
        }

        if (vocabList.length > 0) {
          const vocabItems = await tx
            .select({ id: schema.vocabItems.id })
            .from(schema.vocabItems)
            .where(inArray(schema.vocabItems.vocabItem, vocabList));

          if (vocabItems.length > 0) {
            await tx.insert(schema.deckVocabItems).values(
              vocabItems.map((item) => ({
                deckId: deck.id,
                vocabItemId: item.id,
              })),
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
        decks: z.array(deckResponseSchema),
        pagingInfo: pagingInfoSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const { search, page, perPage } = input;
      const userId = context.user.id;
      const offset = (page - 1) * perPage;

      const searchCondition = search
        ? ilike(schema.decks.deckName, `%${search}%`)
        : undefined;

      const conditions = searchCondition ? and(searchCondition) : undefined;

      const [totalResult] = await context.cradle.database
        .select({ count: count() })
        .from(schema.decks)
        .where(conditions);

      const total = totalResult?.count ?? 0;

      const results = await context.cradle.database
        .select({
          id: schema.decks.id,
          deckName: schema.decks.deckName,
          description: schema.decks.description,
          createdById: schema.decks.createdById,
          createdByUsername: schema.users.name,
          createdDate: schema.decks.createdAt,
          numLearners: sql<number>`(
            SELECT COUNT(*)
            FROM ${schema.userDecks}
            WHERE ${schema.userDecks.deckId} = ${schema.decks.id}
          )`,
        })
        .from(schema.decks)
        .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
        .where(conditions)
        .limit(perPage)
        .offset(offset);

      return {
        decks: results,
        pagingInfo: { page, perPage, total },
      };
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
      const offset = (page - 1) * perPage;

      const [totalResult] = await context.cradle.database
        .select({ count: count() })
        .from(schema.userDecks)
        .where(eq(schema.userDecks.userId, userId));

      const total = totalResult?.count ?? 0;

      const results = await context.cradle.database
        .select({
          id: schema.decks.id,
          deckName: schema.decks.deckName,
          description: schema.decks.description,
          createdById: schema.decks.createdById,
          createdByUsername: schema.users.name,
          createdDate: schema.decks.createdAt,
          lastStudied: schema.userDecks.updatedAt,
          numLearners: sql<number>`(
            SELECT COUNT(*)
            FROM ${schema.userDecks}
            WHERE ${schema.userDecks.deckId} = ${schema.decks.id}
          )`,
        })
        .from(schema.userDecks)
        .innerJoin(schema.decks, eq(schema.userDecks.deckId, schema.decks.id))
        .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
        .where(eq(schema.userDecks.userId, userId))
        .limit(perPage)
        .offset(offset);

      return {
        decks: results,
        pagingInfo: { page, perPage, total },
      };
    }),
};
