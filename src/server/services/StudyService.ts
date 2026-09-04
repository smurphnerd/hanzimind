import "server-only";

import type { Logger } from "pino";
import { and, eq, inArray } from "drizzle-orm";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  type DeckProgressDto,
  type VocabItemStudyDto,
  type StudyType,
  type UserVocabItemDto,
  type StudyAnswerDto,
} from "@/definitions/definitions";
import type { ITranslationChecker } from "./TranslationChecker";
import { toVocabItemDto, type VocabService } from "./VocabService";
import { CONSTITUENT_GATE_LEVEL } from "@/server/constants";
import {
  NO_SYNONYMS,
  gradeAnswer,
  nextReviewAt,
} from "@/server/study-scheduling";
import {
  canStudy,
  readingOf,
  emptyStages,
  selectNextCard,
  summariseDeckProgress,
  type ProgressRollupItem,
  writableType,
} from "@/server/study-rules";
import {
  InvalidInputError,
  isForeignKeyViolation,
  NotFoundError,
} from "@/server/endpoints/errors";

/**
 * The columns selection and the progress rollup decide on, and nothing more.
 *
 * Deliberately no `strokes`, `strokeMedians` or `strokeMatches`. A deck query
 * pulls one row per item, several hundred for HSK 1, and the stroke JSONB is by
 * far the widest thing on each of them. Nothing in the rules reads it, and the
 * one card that renders it is an introduction, which fetches its own full row
 * after selection rather than making every other row carry the weight.
 */
const cardColumns = {
  id: schema.vocabItems.id,
  vocabItem: schema.vocabItems.vocabItem,
  translation: schema.vocabItems.translation,
  pinyin: schema.vocabItems.pinyin,
  audioUrl: schema.vocabItems.audioUrl,
  vocabType: schema.vocabItems.vocabType,
  phonetic: schema.vocabItems.phonetic,
  script: schema.vocabItems.script,
  decomposition: schema.vocabItems.decomposition,
} as const;

/** The learner's standing against an item, as the rules read it. */
const progressColumns = {
  seen: schema.userVocabItems.seen,
  readingLevel: schema.userVocabItems.readingLevel,
  listeningLevel: schema.userVocabItems.listeningLevel,
  understandingLevel: schema.userVocabItems.understandingLevel,
  writingLevel: schema.userVocabItems.writingLevel,
  readingNextAt: schema.userVocabItems.readingNextAt,
  listeningNextAt: schema.userVocabItems.listeningNextAt,
  understandingNextAt: schema.userVocabItems.understandingNextAt,
  writingNextAt: schema.userVocabItems.writingNextAt,
} as const;

export class StudyService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
      translationChecker: ITranslationChecker;
      vocabService: VocabService;
    },
  ) {}

  async addDeck(args: {
    userId: string;
    deckId: string;
    readingEnabled: boolean;
    listeningEnabled: boolean;
    understandingEnabled: boolean;
    writingEnabled: boolean;
  }): Promise<void> {
    const {
      userId,
      deckId,
      readingEnabled,
      listeningEnabled,
      understandingEnabled,
      writingEnabled,
    } = args;

    await this.deps.database.transaction(async (tx) => {
      // Create the deck relationship
      await tx
        .insert(schema.userDecks)
        .values({
          userId,
          deckId,
          // Constituents are always part of a deck now — you learn the parts
          // before the words built from them (see CONSTITUENT_GATE_LEVEL).
          includeConstituents: true,
          readingEnabled,
          listeningEnabled,
          understandingEnabled,
          writingEnabled,
        })
        // Re-saving a deck you already study should apply the new settings
        // rather than silently keeping the old ones.
        .onConflictDoUpdate({
          target: [schema.userDecks.userId, schema.userDecks.deckId],
          set: {
            includeConstituents: true,
            readingEnabled,
            listeningEnabled,
            understandingEnabled,
            writingEnabled,
          },
        })
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) {
            throw new NotFoundError("Deck not found");
          }
          throw error;
        });

      // Every item in the deck, constituents included — but not disabled ones,
      // which must never get a progress row to be served from.
      const vocabItems = await tx
        .select({
          vocabItemId: schema.deckVocabItems.vocabItemId,
        })
        .from(schema.deckVocabItems)
        .innerJoin(
          schema.vocabItems,
          eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
        )
        .where(
          and(
            eq(schema.deckVocabItems.deckId, deckId),
            eq(schema.vocabItems.disabled, false),
          ),
        );

      // Create userVocabItems for all vocab items in the deck
      // Items start with seen=false (default), levels at 0 (default), and no nextAt times
      if (vocabItems.length > 0) {
        await tx
          .insert(schema.userVocabItems)
          .values(
            vocabItems.map((item) => ({
              userId,
              vocabItemId: item.vocabItemId,
            })),
          )
          .onConflictDoNothing();
      }
    });
  }

  async updateDeckSettings(args: {
    userId: string;
    deckId: string;
    readingEnabled: boolean;
    listeningEnabled: boolean;
    understandingEnabled: boolean;
    writingEnabled: boolean;
  }): Promise<void> {
    const {
      userId,
      deckId,
      readingEnabled,
      listeningEnabled,
      understandingEnabled,
      writingEnabled,
    } = args;

    await this.deps.database.transaction(async (tx) => {
      const updated = await tx
        .update(schema.userDecks)
        .set({
          includeConstituents: true,
          readingEnabled,
          listeningEnabled,
          understandingEnabled,
          writingEnabled,
        })
        .where(
          and(
            eq(schema.userDecks.userId, userId),
            eq(schema.userDecks.deckId, deckId),
          ),
        )
        .returning({ deckId: schema.userDecks.deckId });

      if (updated.length === 0) {
        throw new NotFoundError("This deck is not on your study list");
      }

      // Back-fill progress rows for any deck item that doesn't have one yet,
      // otherwise it gets served as a new card but can't be answered.
      const vocabItems = await tx
        .select({
          vocabItemId: schema.deckVocabItems.vocabItemId,
        })
        .from(schema.deckVocabItems)
        .innerJoin(
          schema.vocabItems,
          eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
        )
        .where(
          and(
            eq(schema.deckVocabItems.deckId, deckId),
            eq(schema.vocabItems.disabled, false),
          ),
        );

      if (vocabItems.length > 0) {
        await tx
          .insert(schema.userVocabItems)
          .values(
            vocabItems.map((item) => ({
              userId,
              vocabItemId: item.vocabItemId,
            })),
          )
          .onConflictDoNothing();
      }
    });
  }

  /**
   * Whether this learner was ever offered this item in this deck. Membership
   * alone is not enough: any deck id can be named, and most common characters
   * sit in a public deck.
   */
  async isStudyingItemInDeck(
    userId: string,
    deckId: string,
    vocabItemId: string,
  ): Promise<boolean> {
    const row = await this.deps.database
      .select({ vocabItemId: schema.deckVocabItems.vocabItemId })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.userDecks,
        eq(schema.userDecks.deckId, schema.deckVocabItems.deckId),
      )
      .where(
        and(
          eq(schema.deckVocabItems.deckId, deckId),
          eq(schema.deckVocabItems.vocabItemId, vocabItemId),
          eq(schema.userDecks.userId, userId),
        ),
      )
      .limit(1);

    return row.length > 0;
  }

  /**
   * The meanings this learner has accepted for this item, verbatim as stored.
   *
   * Fetched only where the lookup this replaces ran, an understanding card with
   * a non-blank answer, so the query count on every other path is unchanged.
   * The predicate loses its third column and now returns the learner's whole
   * set for the item rather than at most one row, which is the same index and a
   * handful of rows.
   */
  private async acceptedSynonyms(
    userId: string,
    answer: StudyAnswerDto,
  ): Promise<ReadonlySet<string>> {
    if (answer.studyType !== "understanding") return NO_SYNONYMS;
    if (!answer.answer.trim()) return NO_SYNONYMS;

    const rows = await this.deps.database
      .select({ synonym: schema.userVocabSynonyms.synonym })
      .from(schema.userVocabSynonyms)
      .where(
        and(
          eq(schema.userVocabSynonyms.userId, userId),
          eq(schema.userVocabSynonyms.vocabItemId, answer.vocabItemId),
        ),
      );

    return new Set(rows.map((row) => row.synonym));
  }

  /**
   * Record an extra meaning the user wants accepted for an item in future.
   * Idempotent — re-adding the same synonym is a no-op.
   */
  async addSynonym(args: {
    userId: string;
    vocabItemId: string;
    synonym: string;
  }): Promise<void> {
    const synonym = args.synonym.trim().toLowerCase();
    if (!synonym) throw new InvalidInputError("Synonym cannot be empty");

    await this.deps.database
      .insert(schema.userVocabSynonyms)
      .values({
        userId: args.userId,
        vocabItemId: args.vocabItemId,
        synonym,
      })
      .onConflictDoNothing()
      .catch((error: unknown) => {
        if (isForeignKeyViolation(error)) {
          throw new NotFoundError("Vocab item not found");
        }
        throw error;
      });
  }

  async processAnswer(
    answer: StudyAnswerDto,
    userId: string,
  ): Promise<boolean> {
    // Fetch the item and the user's progress in parallel. Whether the deck
    // teaches this item is settled before the call, by the router's
    // assertStudyingItemInDeck.
    const [vocabItem, existingUserVocabItem] = await Promise.all([
      this.deps.database.query.vocabItems.findFirst({
        where: (vocabItems, { and, eq }) =>
          and(
            eq(vocabItems.id, answer.vocabItemId),
            eq(vocabItems.disabled, false),
          ),
      }),
      this.deps.database.query.userVocabItems.findFirst({
        where: (userVocabItems, { eq, and }) =>
          and(
            eq(userVocabItems.vocabItemId, answer.vocabItemId),
            eq(userVocabItems.userId, userId),
          ),
      }),
    ]);

    if (!vocabItem) {
      throw new InvalidInputError("That item is not available to study");
    }

    // getNextVocabItem never offers a card the item can't answer, but the
    // client sends the study type back, so a stale tab or a crafted request
    // could otherwise advance e.g. writingLevel on a component, which no
    // pinyin IME can produce. Re-check server-side.
    if (answer.studyType !== "new" && !canStudy(vocabItem, answer.studyType)) {
      throw new InvalidInputError(
        `Study type "${answer.studyType}" is not valid for ${vocabItem.vocabType} ${vocabItem.vocabItem}`,
      );
    }

    let userVocabItem = existingUserVocabItem;

    if (!userVocabItem) {
      // The item is studiable (it was served by getNextVocabItem) but has no
      // progress row — e.g. it became part of the deck after the row was
      // created. Create it on demand (seen=false, levels 0) so a missing row
      // can never make a card unanswerable.
      await this.deps.database
        .insert(schema.userVocabItems)
        .values({ userId, vocabItemId: answer.vocabItemId })
        .onConflictDoNothing();

      userVocabItem = await this.deps.database.query.userVocabItems.findFirst({
        where: (userVocabItems, { eq, and }) =>
          and(
            eq(userVocabItems.vocabItemId, answer.vocabItemId),
            eq(userVocabItems.userId, userId),
          ),
      });

      if (!userVocabItem) {
        throw new Error(
          `User vocab item not found for user ${userId} and vocab ${answer.vocabItemId}`,
        );
      }
    }

    if (answer.studyType === "new") {
      // NOTE: this must be awaited — Drizzle query builders are lazy, so
      // without it the row is never updated and the item is served as "new"
      // forever.
      await this.deps.database
        .update(schema.userVocabItems)
        .set({
          seen: true,
        })
        .where(
          and(
            eq(schema.userVocabItems.userId, userId),
            eq(schema.userVocabItems.vocabItemId, answer.vocabItemId),
          ),
        );
      return true;
    }

    const answerCorrect = await gradeAnswer({
      card: vocabItem,
      studyType: answer.studyType,
      answer: answer.answer,
      synonyms: await this.acceptedSynonyms(userId, answer),
      checker: this.deps.translationChecker,
    });

    // Get current level for this study type
    const levelField = `${answer.studyType}Level` as
      | "readingLevel"
      | "listeningLevel"
      | "understandingLevel"
      | "writingLevel";
    const currentLevel = userVocabItem[levelField] ?? 0;

    // Stamped after grading resolves, because the semantic checker can take
    // seconds and the interval runs from when the learner finished, not started.
    const { nextLevel, nextAt } = nextReviewAt(
      currentLevel,
      answerCorrect,
      new Date(),
    );

    // Update user vocab item with new level, next review time, and mark as seen
    const updateData: Partial<typeof schema.userVocabItems.$inferInsert> = {
      seen: true, // Mark the item as seen once they submit an answer
    };
    updateData[levelField] = nextLevel;
    updateData[
      `${answer.studyType}NextAt` as
        | "readingNextAt"
        | "listeningNextAt"
        | "understandingNextAt"
        | "writingNextAt"
    ] = nextAt;

    await this.deps.database
      .update(schema.userVocabItems)
      .set(updateData)
      .where(
        and(
          eq(schema.userVocabItems.userId, userId),
          eq(schema.userVocabItems.vocabItemId, answer.vocabItemId),
        ),
      );

    return answerCorrect;
  }

  async getNextVocabItem(
    userId: string,
    deckId: string,
  ): Promise<VocabItemStudyDto | null> {
    const userDeck = await this.deps.database.query.userDecks.findFirst({
      where: (userDecks, { eq, and }) =>
        and(eq(userDecks.userId, userId), eq(userDecks.deckId, deckId)),
    });

    if (!userDeck) {
      throw new NotFoundError("This deck is not on your study list");
    }

    const now = new Date();

    // Determine which study types are enabled
    const enabledStudyTypes: StudyType[] = [];
    if (userDeck.readingEnabled) enabledStudyTypes.push("reading");
    if (userDeck.listeningEnabled) enabledStudyTypes.push("listening");
    if (userDeck.understandingEnabled) enabledStudyTypes.push("understanding");
    if (userDeck.writingEnabled) enabledStudyTypes.push("writing");

    if (enabledStudyTypes.length === 0) {
      throw new InvalidInputError("No study types enabled for this deck");
    }

    // Fetch all vocab items in the deck with user progress
    const vocabItems = await this.deps.database
      .select({
        ...cardColumns,
        ...progressColumns,
      })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.vocabItems,
        eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
      )
      .leftJoin(
        schema.userVocabItems,
        and(
          eq(schema.userVocabItems.vocabItemId, schema.vocabItems.id),
          eq(schema.userVocabItems.userId, userDeck.userId),
        ),
      )
      .where(
        and(
          eq(schema.deckVocabItems.deckId, userDeck.deckId),
          // Disabled items are never served, and because the prerequisite
          // gating below is built from this same result set, they also stop
          // gating the characters they used to be part of.
          eq(schema.vocabItems.disabled, false),
        ),
      );

    if (vocabItems.length === 0) {
      // Empty deck (or no items match the current settings) — nothing to study.
      return null;
    }

    // --- Prerequisite gating -------------------------------------------
    // A word/sentence stays locked until every constituent character that is
    // also in this deck is known to at least CONSTITUENT_GATE_LEVEL. This is
    // what paces the deck: only the parts are available up front, and the
    // things built from them unlock as those parts mature.
    // The rules themselves live in @/server/study-rules as pure functions so
    // they can be tested without a database.
    const selection = selectNextCard(vocabItems, {
      enabledStudyTypes,
      gateLevel: CONSTITUENT_GATE_LEVEL,
      now,
    });

    if (!selection) {
      // Nothing due — the caller renders the session-complete screen.
      return null;
    }

    const selectedItem = selection.item;

    // An introduction shows the whole dictionary entry, including stroke order,
    // which is the one card that needs the columns the deck query leaves
    // behind. One row, once, rather than several hundred rows every time.
    if (selection.studyType === "new") {
      const row = await this.deps.vocabService.getVocabItem(
        selectedItem.vocabItem,
      );
      return {
        ...toVocabItemDto(row),
        studyType: "new",
        constituents: await this.deps.vocabService.getVocabItemParts({
          vocabItem: selectedItem.vocabItem,
          vocabType: selectedItem.vocabType,
          decomposition: selectedItem.decomposition,
        }),
      };
    }

    // Return only the fields needed for the selected study type
    const studyType = selection.studyType;

    if (studyType === "reading") {
      return {
        id: selectedItem.id,
        studyType: "reading",
        vocabItem: selectedItem.vocabItem,
        vocabType: selectedItem.vocabType,
      };
    } else if (studyType === "listening") {
      return {
        id: selectedItem.id,
        studyType: "listening",
        audioUrl: selectedItem.audioUrl,
        vocabType: selectedItem.vocabType,
      };
    } else if (studyType === "understanding") {
      return {
        id: selectedItem.id,
        studyType: "understanding",
        vocabItem: selectedItem.vocabItem,
        audioUrl: readingOf(selectedItem).audioUrl,
        vocabType: selectedItem.vocabType,
      };
    } else {
      // writing
      return {
        id: selectedItem.id,
        studyType: "writing",
        translation: selectedItem.translation,
        vocabType: writableType(selectedItem, studyType),
      };
    }
  }

  async getUserVocabItem(
    userId: string,
    vocabItemId: string,
  ): Promise<UserVocabItemDto> {
    // One row, so the full vocab record is worth selecting: UserVocabItemDto
    // extends VocabItemDto and needs the stroke data the deck query drops.
    // Selecting the table itself rather than naming columns is what lets
    // toVocabItemDto take it, which is the only sanctioned way a row becomes a
    // dictionary DTO.
    const result = await this.deps.database
      .select({
        item: schema.vocabItems,
        username: schema.users.name,
        ...progressColumns,
        memoryAidId: schema.userVocabItems.memoryAidId,
        memoryAid: schema.memoryAids.memoryAid,
      })
      .from(schema.vocabItems)
      .innerJoin(
        schema.userVocabItems,
        and(
          eq(schema.userVocabItems.vocabItemId, schema.vocabItems.id),
          eq(schema.userVocabItems.userId, userId),
        ),
      )
      .innerJoin(schema.users, eq(schema.users.id, userId))
      .leftJoin(
        schema.memoryAids,
        eq(schema.memoryAids.id, schema.userVocabItems.memoryAidId),
      )
      .where(
        and(
          eq(schema.vocabItems.id, vocabItemId),
          eq(schema.vocabItems.disabled, false),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      throw new Error(
        `Vocab item ID"${vocabItemId}" not found for user ${userId}`,
      );
    }

    const item = result[0];

    // Until a learner pins their own aid, they see the glyph's starred
    // default. The join above only carries their pick, so fall back to the
    // default's text with one small lookup when they have none.
    let memoryAidId = item.memoryAidId;
    let memoryAid = item.memoryAid;
    if (!memoryAidId && item.item.defaultMemoryAidId) {
      const fallback = await this.deps.database.query.memoryAids.findFirst({
        columns: { id: true, memoryAid: true },
        where: (memoryAids, { eq }) =>
          eq(memoryAids.id, item.item.defaultMemoryAidId!),
      });
      if (fallback) {
        memoryAidId = fallback.id;
        memoryAid = fallback.memoryAid;
      }
    }

    return {
      ...toVocabItemDto(item.item),
      userId,
      username: item.username,
      seen: item.seen,
      readingLevel: item.readingLevel,
      listeningLevel: item.listeningLevel,
      understandingLevel: item.understandingLevel,
      writingLevel: item.writingLevel,
      memoryAidId,
      memoryAid,
      readingNextAt: item.readingNextAt,
      listeningNextAt: item.listeningNextAt,
      understandingNextAt: item.understandingNextAt,
      writingNextAt: item.writingNextAt,
      constituents: await this.deps.vocabService.getVocabItemParts({
        vocabItem: item.item.vocabItem,
        vocabType: item.item.vocabType,
        decomposition: item.item.decomposition,
      }),
    };
  }

  /**
   * Each requested deck's standing for the current learner.
   *
   * Batched on purpose: the study list renders up to 50 decks, and a call per
   * deck would be 50 round-trips for one screen. Unlike getNextVocabItem this
   * tolerates a deck the viewer has not enrolled in — the caller may be showing
   * any deck — and reports it as an empty garden rather than throwing.
   *
   * Returns one entry per requested id, in the order asked for.
   */
  async getDeckProgress(
    userId: string,
    deckIds: string[],
  ): Promise<DeckProgressDto[]> {
    if (deckIds.length === 0) return [];

    const notEnrolled = (deckId: string): DeckProgressDto => ({
      deckId,
      total: 0,
      unstudiable: 0,
      seen: 0,
      dueNow: 0,
      newAvailable: 0,
      locked: 0,
      byStage: emptyStages(),
    });

    // Settings are per user-deck, so what counts as studiable differs between
    // decks and has to be read before the items can be bucketed.
    const userDecks = await this.deps.database
      .select({
        deckId: schema.userDecks.deckId,
        readingEnabled: schema.userDecks.readingEnabled,
        listeningEnabled: schema.userDecks.listeningEnabled,
        understandingEnabled: schema.userDecks.understandingEnabled,
        writingEnabled: schema.userDecks.writingEnabled,
      })
      .from(schema.userDecks)
      .where(
        and(
          eq(schema.userDecks.userId, userId),
          inArray(schema.userDecks.deckId, [...new Set(deckIds)]),
        ),
      );

    if (userDecks.length === 0) return deckIds.map(notEnrolled);

    const enabledByDeck = new Map<string, StudyType[]>(
      userDecks.map((deck) => {
        const enabled: StudyType[] = [];
        if (deck.readingEnabled) enabled.push("reading");
        if (deck.listeningEnabled) enabled.push("listening");
        if (deck.understandingEnabled) enabled.push("understanding");
        if (deck.writingEnabled) enabled.push("writing");
        return [deck.deckId, enabled];
      }),
    );

    // The same join getNextVocabItem selects from, widened to every enrolled
    // deck at once. Disabled items are excluded here too, so they neither
    // count towards progress nor gate anything.
    const rows = await this.deps.database
      .select({
        deckId: schema.deckVocabItems.deckId,
        ...cardColumns,
        ...progressColumns,
      })
      .from(schema.deckVocabItems)
      .innerJoin(
        schema.vocabItems,
        eq(schema.deckVocabItems.vocabItemId, schema.vocabItems.id),
      )
      .leftJoin(
        schema.userVocabItems,
        and(
          eq(schema.userVocabItems.vocabItemId, schema.vocabItems.id),
          eq(schema.userVocabItems.userId, userId),
        ),
      )
      .where(
        and(
          inArray(schema.deckVocabItems.deckId, [...enabledByDeck.keys()]),
          eq(schema.vocabItems.disabled, false),
        ),
      );

    const itemsByDeck = new Map<string, ProgressRollupItem[]>();
    for (const row of rows) {
      const items = itemsByDeck.get(row.deckId);
      if (items) items.push(row);
      else itemsByDeck.set(row.deckId, [row]);
    }

    const now = new Date();

    return deckIds.map((deckId) => {
      const enabledStudyTypes = enabledByDeck.get(deckId);
      if (!enabledStudyTypes) return notEnrolled(deckId);

      return summariseDeckProgress({
        deckId,
        items: itemsByDeck.get(deckId) ?? [],
        enabledStudyTypes,
        gateLevel: CONSTITUENT_GATE_LEVEL,
        now,
      });
    });
  }
}
