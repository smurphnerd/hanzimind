import "server-only";

import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import { escapeLike } from "@/lib/sql";
import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  buildDecompositionIndex,
  extractDeckGraph,
} from "@/server/decomposition-graph";
import { readingOf } from "@/server/study-rules";
import type {
  DeckDto,
  DeckDetailedDto,
  DeckGraphDto,
  DeckTypeCountsDto,
} from "@/definitions/definitions";
import { NotFoundError } from "@/server/endpoints/errors";
import type { VocabService } from "@/server/services/VocabService";

export class DeckService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
      vocabService: VocabService;
    },
  ) {}

  private getNumLearnersSubquery() {
    return sql<number>`CAST((
      SELECT COUNT(*)
      FROM ${schema.userDecks}
      WHERE ${schema.userDecks.deckId} = ${schema.decks.id}
    ) AS INTEGER)`;
  }

  /**
   * How many items a learner would actually get from this deck.
   *
   * Joins vocab_items and repeats the `disabled = false` filter getDeckById
   * applies, so the count on a browse card can never disagree with the list on
   * the detail page. Constituents are included because they are always studied —
   * see the note on getDeckById.
   */
  private getItemCountSubquery() {
    return sql<number>`CAST((
      SELECT COUNT(*)
      FROM ${schema.deckVocabItems}
      INNER JOIN ${schema.vocabItems}
        ON ${schema.vocabItems.id} = ${schema.deckVocabItems.vocabItemId}
      WHERE ${schema.deckVocabItems.deckId} = ${schema.decks.id}
        AND ${schema.vocabItems.disabled} = false
    ) AS INTEGER)`;
  }

  /**
   * The same population as getItemCountSubquery, bucketed by vocabType in one
   * pass, so a deck card can show what it is made of without a second query.
   * Returned as JSON rather than four correlated subqueries — one scan instead
   * of four, and the shape lines up with DeckTypeCountsDto directly.
   */
  private getTypeCountsSubquery() {
    return sql<DeckTypeCountsDto>`(
      SELECT json_build_object(
        'sentence',  COUNT(*) FILTER (WHERE ${schema.vocabItems.vocabType} = 'sentence'),
        'compound',  COUNT(*) FILTER (WHERE ${schema.vocabItems.vocabType} = 'compound'),
        'character', COUNT(*) FILTER (WHERE ${schema.vocabItems.vocabType} = 'character'),
        'component', COUNT(*) FILTER (WHERE ${schema.vocabItems.vocabType} = 'component')
      )
      FROM ${schema.deckVocabItems}
      INNER JOIN ${schema.vocabItems}
        ON ${schema.vocabItems.id} = ${schema.deckVocabItems.vocabItemId}
      WHERE ${schema.deckVocabItems.deckId} = ${schema.decks.id}
        AND ${schema.vocabItems.disabled} = false
    )`;
  }

  /**
   * The columns every deck card is built from.
   *
   * Written out three times before this — browse, deck detail and "my decks" —
   * with the three correlated subqueries copied along with them, so a card's
   * counts could only stay the same in all three by being edited in all three.
   */
  private deckHeaderColumns() {
    return {
      id: schema.decks.id,
      deckName: schema.decks.deckName,
      description: schema.decks.description,
      createdById: schema.decks.createdById,
      createdByUsername: schema.users.name,
      createdAt: schema.decks.createdAt,
      updatedAt: schema.decks.updatedAt,
      numLearners: this.getNumLearnersSubquery(),
      itemCount: this.getItemCountSubquery(),
      typeCounts: this.getTypeCountsSubquery(),
    };
  }

  /**
   * Build a deck from a list of glyphs, pulling in everything they are made of.
   *
   * Two phases, and the order is load-bearing. Everything that can fail slowly or
   * partially — DeepL, speech synthesis, the S3 upload behind addVocabItem — runs
   * first, outside any transaction; the transaction then writes only rows this
   * already holds, so it is never open across a network call.
   *
   * It does not roll back the dictionary rows addVocabItem created on the way, and
   * should not: those are corpus, not deck state, and the next deck asking for the
   * same word reuses the row and its audio rather than paying DeepL again.
   *
   * `skipped` names the requested glyphs that were refused for being disabled.
   * The deck that results is larger than the request, not smaller: constituents
   * are members too.
   */
  async createDeck(
    userId: string,
    input: { deckName: string; description: string; vocabList: string[] },
  ): Promise<{ id: string; skipped: string[] }> {
    const { deckName, description, vocabList } = input;

    // A disabled glyph is meant to behave as if deleted, so drop it from the
    // request rather than treating it as missing — it exists, it just cannot
    // be taught, and trying to "create" a single character throws.
    const rows = await this.deps.vocabService.getStoredVocabItems(vocabList);
    const storedSet = new Set(rows.map((row) => row.vocabItem));
    const usableSet = new Set(
      rows.filter((row) => !row.disabled).map((row) => row.vocabItem),
    );
    const accepted = vocabList.filter(
      (item) => !storedSet.has(item) || usableSet.has(item),
    );
    const acceptedSet = new Set(accepted);
    const skipped = vocabList.filter((item) => !acceptedSet.has(item));

    for (const vocabItem of accepted) {
      if (!usableSet.has(vocabItem)) {
        await this.deps.vocabService.addVocabItem(vocabItem);
      }
    }

    const members =
      await this.deps.vocabService.resolveConstituentClosure(accepted);

    const id = await this.deps.database.transaction(async (tx) => {
      const [deck] = await tx
        .insert(schema.decks)
        .values({ deckName, description, createdById: userId })
        .returning({ id: schema.decks.id });

      if (!deck) {
        throw new Error("Deck insert returned no row");
      }

      if (members.length > 0) {
        const rows = await tx
          .select({
            id: schema.vocabItems.id,
            vocabItem: schema.vocabItems.vocabItem,
          })
          .from(schema.vocabItems)
          .where(
            and(
              inArray(schema.vocabItems.vocabItem, members),
              // Redundant against the closure, which cannot return a disabled
              // glyph — kept because it is the last read before the insert and
              // a row can be disabled while the external calls above are running.
              eq(schema.vocabItems.disabled, false),
            ),
          );

        if (rows.length > 0) {
          const requested = new Set(vocabList);
          await tx.insert(schema.deckVocabItems).values(
            rows.map((row) => ({
              deckId: deck.id,
              vocabItemId: row.id,
              isConstituent: !requested.has(row.vocabItem),
            })),
          );
        }
      }

      return deck.id;
    });

    return { id, skipped };
  }

  async browseDeck(args: {
    search?: string;
    page: number;
    perPage: number;
  }): Promise<{ decks: DeckDto[]; total: number }> {
    const { search, page, perPage } = args;
    const offset = (page - 1) * perPage;

    // Deck names are terse, so a learner searching "HSK" should still find a deck
    // that only says so in its blurb.
    const pattern = search ? `%${escapeLike(search.trim())}%` : undefined;
    const conditions = pattern
      ? or(
          ilike(schema.decks.deckName, pattern),
          ilike(schema.decks.description, pattern),
        )
      : undefined;

    const [totalResult] = await this.deps.database
      .select({ count: count() })
      .from(schema.decks)
      .where(conditions);

    const total = totalResult?.count ?? 0;

    const decks = await this.deps.database
      .select(this.deckHeaderColumns())
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
      .where(conditions)
      .limit(perPage)
      .offset(offset)
      // `id` breaks ties. Ordering on numLearners alone leaves every deck with
      // an equal count in an order Postgres may permute between the page-1 and
      // page-2 plans, which silently duplicates some decks across pages and
      // makes others unreachable by paging.
      .orderBy(desc(this.getNumLearnersSubquery()), schema.decks.id);

    return { decks, total };
  }

  /**
   * A deck and everything a learner would actually study from it.
   *
   * Constituents are never filtered out: StudyService stores every user deck
   * with `includeConstituents: true`, so hiding them here would show a preview
   * smaller than the deck the learner ends up with.
   */
  async getDeckById(args: { deckId: string }): Promise<DeckDetailedDto> {
    const { deckId } = args;

    const [deck] = await this.deps.database
      .select(this.deckHeaderColumns())
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.decks.createdById, schema.users.id))
      .where(eq(schema.decks.id, deckId));

    if (!deck) {
      throw new NotFoundError("Deck not found");
    }

    const whereConditions = and(
      eq(schema.deckVocabItems.deckId, deckId),
      eq(schema.vocabItems.disabled, false),
    );

    const rows = await this.deps.database
      .select({
        id: schema.vocabItems.id,
        vocabItem: schema.vocabItems.vocabItem,
        translation: schema.vocabItems.translation,
        vocabType: schema.vocabItems.vocabType,
        phonetic: schema.vocabItems.phonetic,
        pinyin: schema.vocabItems.pinyin,
        audioUrl: schema.vocabItems.audioUrl,
      })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.vocabItems,
        eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
      )
      .where(whereConditions)
      // Postgres is free to return an unordered scan in a different order each
      // time; without this the preview's chips would visibly reshuffle between
      // loads of the same deck.
      .orderBy(schema.vocabItems.vocabItem);

    // A component that is not phonetic has no reading of its own, but plenty of
    // rows still store the dictionary's borrowed one. readingOf is the single
    // place that decides, so the preview cannot pronounce 亻 as 人.
    const vocabItems = rows.map(({ phonetic, ...row }) => ({
      ...row,
      ...readingOf({ ...row, phonetic, translation: row.translation }),
    }));

    return { ...deck, vocabItems };
  }

  /**
   * A deck as one graph: every item, every decomposition edge between two items of
   * the deck, and each node's depth in the deck's unlock order.
   *
   * One query and no cache. Unlike the corpus-wide graph this is a few hundred rows
   * scoped by an indexed join, and a deck's membership changes under an editor's
   * hands, so a stale index here would show someone a deck they no longer have.
   *
   * Edges are deliberately confined to the deck. A part outside it cannot be
   * learned here and so does not gate — the same rule `isUnlocked` applies — which
   * is why the levels this produces are the deck's real teaching order rather than
   * a projection of the corpus.
   */
  async getDeckGraph(args: { deckId: string }): Promise<DeckGraphDto> {
    const [deck] = await this.deps.database
      .select({ id: schema.decks.id })
      .from(schema.decks)
      .where(eq(schema.decks.id, args.deckId));

    if (!deck) {
      throw new NotFoundError("Deck not found");
    }

    const rows = await this.deps.database
      .select({
        vocabItem: schema.vocabItems.vocabItem,
        vocabType: schema.vocabItems.vocabType,
        pinyin: schema.vocabItems.pinyin,
        translation: schema.vocabItems.translation,
        decomposition: schema.vocabItems.decomposition,
      })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.vocabItems,
        eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
      )
      .where(
        and(
          eq(schema.deckVocabItems.deckId, args.deckId),
          // Disabled rows are absent from every read path, and because the
          // layering below is built from this same result set, they also stop
          // gating the characters they used to be part of.
          eq(schema.vocabItems.disabled, false),
        ),
      );

    return extractDeckGraph(buildDecompositionIndex(rows));
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
        ...this.deckHeaderColumns(),
        lastStudied: schema.userDecks.updatedAt,
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
      // Same hazard browseDeck guards against: an unordered scan may be
      // permuted between the page-1 and page-2 plans, duplicating some saved
      // decks across pages and leaving others unreachable. Most recently
      // studied first, with `id` breaking ties among decks studied together.
      .orderBy(desc(schema.userDecks.updatedAt), schema.decks.id)
      .limit(perPage)
      .offset(offset);

    return { decks, total };
  }
}
