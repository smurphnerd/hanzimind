import "server-only";

import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import type {
  DeckDto,
  DeckDetailedDto,
  DeckVocabItemSummaryDto,
} from "@/definitions/definitions";

export class DeckService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
    },
  ) {}

  private getNumLearnersSubquery() {
    return sql<number>`CAST((
      SELECT COUNT(*)
      FROM ${schema.userDecks}
      WHERE ${schema.userDecks.deckId} = ${schema.decks.id}
    ) AS INTEGER)`;
  }

  async browseDeck(args: {
    search?: string;
    page: number;
    perPage: number;
  }): Promise<{ decks: DeckDto[]; total: number }> {
    const { search, page, perPage } = args;
    const offset = (page - 1) * perPage;

    const searchCondition = search
      ? ilike(schema.decks.deckName, `%${search}%`)
      : undefined;

    const conditions = searchCondition ? and(searchCondition) : undefined;

    const [totalResult] = await this.deps.database
      .select({ count: count() })
      .from(schema.decks)
      .where(conditions);

    const total = totalResult?.count ?? 0;

    const decks = await this.deps.database
      .select({
        id: schema.decks.id,
        deckName: schema.decks.deckName,
        description: schema.decks.description,
        createdById: schema.decks.createdById,
        createdByUsername: schema.users.name,
        createdAt: schema.decks.createdAt,
        updatedAt: schema.decks.updatedAt,
        numLearners: this.getNumLearnersSubquery(),
      })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
      .where(conditions)
      .limit(perPage)
      .offset(offset)
      .orderBy(desc(this.getNumLearnersSubquery()));

    return { decks, total };
  }

  async getDeckById(args: {
    deckId: string;
    includeConstituents: boolean;
  }): Promise<DeckDetailedDto> {
    const { deckId, includeConstituents } = args;

    const [deck] = await this.deps.database
      .select({
        id: schema.decks.id,
        deckName: schema.decks.deckName,
        description: schema.decks.description,
        createdById: schema.decks.createdById,
        createdByUsername: schema.users.name,
        createdAt: schema.decks.createdAt,
        updatedAt: schema.decks.updatedAt,
        numLearners: this.getNumLearnersSubquery(),
      })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
      .where(eq(schema.decks.id, deckId));

    if (!deck) {
      throw new Error("Deck not found");
    }

    const whereConditions = includeConstituents
      ? eq(schema.deckVocabItems.deckId, deckId)
      : and(
          eq(schema.deckVocabItems.deckId, deckId),
          eq(schema.deckVocabItems.isConstituent, false),
        );

    const vocabItems = await this.deps.database
      .select({
        id: schema.vocabItems.id,
        vocabItem: schema.vocabItems.vocabItem,
        translation: schema.vocabItems.translation,
        vocabType: schema.vocabItems.vocabType,
      })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.vocabItems,
        eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
      )
      .where(whereConditions);

    return {
      ...deck,
      vocabItems: vocabItems as DeckVocabItemSummaryDto[],
    };
  }

  async getUserDecks(args: {
    userId: string;
    page: number;
    perPage: number;
  }): Promise<{
    decks: Array<
      DeckDto & {
        lastStudied: Date;
        includeConstituents: boolean;
        readingEnabled: boolean;
        listeningEnabled: boolean;
        understandingEnabled: boolean;
        writingEnabled: boolean;
      }
    >;
    total: number;
  }> {
    const { userId, page, perPage } = args;
    const offset = (page - 1) * perPage;

    const [totalResult] = await this.deps.database
      .select({ count: count() })
      .from(schema.userDecks)
      .where(eq(schema.userDecks.userId, userId));

    const total = totalResult?.count ?? 0;

    const decks = await this.deps.database
      .select({
        id: schema.decks.id,
        deckName: schema.decks.deckName,
        description: schema.decks.description,
        createdById: schema.decks.createdById,
        createdByUsername: schema.users.name,
        createdAt: schema.decks.createdAt,
        updatedAt: schema.decks.updatedAt,
        lastStudied: schema.userDecks.updatedAt,
        numLearners: this.getNumLearnersSubquery(),
        includeConstituents: schema.userDecks.includeConstituents,
        readingEnabled: schema.userDecks.readingEnabled,
        listeningEnabled: schema.userDecks.listeningEnabled,
        understandingEnabled: schema.userDecks.understandingEnabled,
        writingEnabled: schema.userDecks.writingEnabled,
      })
      .from(schema.userDecks)
      .innerJoin(schema.decks, eq(schema.userDecks.deckId, schema.decks.id))
      .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
      .where(eq(schema.userDecks.userId, userId))
      .limit(perPage)
      .offset(offset);

    return { decks, total };
  }
}
