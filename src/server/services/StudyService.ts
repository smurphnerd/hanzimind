import "server-only";

import type { Logger } from "pino";
import { and, eq, inArray } from "drizzle-orm";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  emptyStudyProgress,
  type DeckProgressDto,
  type VocabItemStudyDto,
  type StudyProgressDto,
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
  selectNextCard,
  summariseDeckProgress,
  type StudiableItem,
  writableType,
} from "@/server/study-rules";
import {
  InvalidInputError,
  isForeignKeyViolation,
  NotFoundError,
} from "@/server/endpoints/errors";

/**
 * Which study types a saved deck is set to quiz, in a fixed order.
 *
 * The order is load-bearing rather than cosmetic. `selectNextCard` walks this
 * array and picks with a strict `<`, so among types at the same level the
 * earliest here wins. Two copies of this list drifting apart would change which
 * card a learner sees without changing which item.
 */
export function enabledStudyTypes(userDeck: {
  readingEnabled: boolean;
  listeningEnabled: boolean;
  understandingEnabled: boolean;
  writingEnabled: boolean;
}): StudyType[] {
  const enabled: StudyType[] = [];
  if (userDeck.readingEnabled) enabled.push("reading");
  if (userDeck.listeningEnabled) enabled.push("listening");
  if (userDeck.understandingEnabled) enabled.push("understanding");
  if (userDeck.writingEnabled) enabled.push("writing");
  return enabled;
}

/**
 * The columns selection and the progress rollup decide on, and nothing more.
 *
 * Deliberately no `strokes`, `strokeMedians` or `strokeMatches`. A deck query
 * pulls one row per item, 398 of them for HSK 1. The projection this replaces
 * came to 653,443 bytes across those rows; these columns come to 50,173, so it
 * is thirteen times smaller, and almost all of the difference is stroke JSONB.
 *
 * Nothing in the rules or the rollup reads that data, and the one card that
 * renders it is an introduction, which fetches its own full row after selection
 * rather than making every other row carry the weight.
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

/**
 * Fold the learner's progress rows into one total map per vocab item.
 *
 * Storage is sparse — a study type gets a row only once it has been answered —
 * and every rule downstream reads a total map, so the gaps are filled exactly
 * once, here. Nothing past this point has to know what a missing row meant.
 */
export function progressByItem(
  rows: readonly {
    vocabItemId: string;
    studyType: StudyType;
    level: number;
    nextAt: Date | null;
  }[],
): Map<string, StudyProgressDto> {
  const byItem = new Map<string, StudyProgressDto>();
  for (const row of rows) {
    let progress = byItem.get(row.vocabItemId);
    if (!progress) {
      progress = emptyStudyProgress();
      byItem.set(row.vocabItemId, progress);
    }
    progress[row.studyType] = { level: row.level, nextAt: row.nextAt };
  }
  return byItem;
}

/** The four columns a progress row contributes, wherever it is read. */
const studyProgressColumns = {
  vocabItemId: schema.userStudyProgress.vocabItemId,
  studyType: schema.userStudyProgress.studyType,
  level: schema.userStudyProgress.level,
  nextAt: schema.userStudyProgress.nextAt,
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

    const studyType = answer.studyType;

    // Read the level and write it back atomically.
    //
    // Grading happens above rather than inside, deliberately: the semantic
    // checker runs an embedding model and can take seconds, and a row lock held
    // across that would serialise every learner answering the same glyph.
    //
    // Without the lock this is a read outside any transaction followed by a
    // write, so two answers landing together both read the old level and the
    // second silently overwrites the first. The level is read again inside,
    // because the value fetched before grading may be stale by now.
    await this.deps.database.transaction(async (tx) => {
      // The lock, and the `seen` write, in one statement. An UPDATE takes the
      // same exclusive row lock a `SELECT ... FOR UPDATE` would, and this row
      // is guaranteed to exist by the block above.
      //
      // It has to be THIS row rather than the progress row the level lives on:
      // a study type has no progress row until its first answer, and locking a
      // row that is not there serialises nothing, so two concurrent first
      // answers would both read level 0 and one would be lost — the defect
      // P3-STUDY-SVC fixed.
      await tx
        .update(schema.userVocabItems)
        .set({ seen: true })
        .where(
          and(
            eq(schema.userVocabItems.userId, userId),
            eq(schema.userVocabItems.vocabItemId, answer.vocabItemId),
          ),
        );

      const [current] = await tx
        .select({ level: schema.userStudyProgress.level })
        .from(schema.userStudyProgress)
        .where(
          and(
            eq(schema.userStudyProgress.userId, userId),
            eq(schema.userStudyProgress.vocabItemId, answer.vocabItemId),
            eq(schema.userStudyProgress.studyType, studyType),
          ),
        );

      // Stamped after grading resolves, because the interval runs from when
      // the learner finished, not when they started.
      const { nextLevel, nextAt } = nextReviewAt(
        current?.level ?? 0,
        answerCorrect,
        new Date(),
      );

      await tx
        .insert(schema.userStudyProgress)
        .values({
          userId,
          vocabItemId: answer.vocabItemId,
          studyType,
          level: nextLevel,
          nextAt,
        })
        .onConflictDoUpdate({
          target: [
            schema.userStudyProgress.userId,
            schema.userStudyProgress.vocabItemId,
            schema.userStudyProgress.studyType,
          ],
          // `$onUpdateFn` fires on `.update()`, not on a conflict clause, so
          // the timestamp is set by hand or the row keeps the one it was
          // inserted with.
          set: { level: nextLevel, nextAt, updatedAt: new Date() },
        });
    });

    return answerCorrect;
  }

  /**
   * Grade one answer and hand back everything the card needs next.
   *
   * One call rather than three, because the three were always run together in
   * this order and the middle one only makes sense after the first. Keeping the
   * order here also keeps it honest: the progress row must be read AFTER
   * processAnswer has written it, or the result card shows the level the
   * learner had before they answered.
   */
  async answerAndAdvance(args: {
    userId: string;
    deckId: string;
    answer: StudyAnswerDto;
  }): Promise<{
    correct: boolean;
    userVocabItem: UserVocabItemDto;
    nextVocabItem: VocabItemStudyDto | null;
  }> {
    const { userId, deckId, answer } = args;

    const correct = await this.processAnswer(answer, userId);
    const [userVocabItem, nextVocabItem] = await Promise.all([
      this.getUserVocabItem(userId, answer.vocabItemId),
      this.getNextVocabItem(userId, deckId),
    ]);

    return { correct, userVocabItem, nextVocabItem };
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
    const enabled = enabledStudyTypes(userDeck);

    if (enabled.length === 0) {
      throw new InvalidInputError("No study types enabled for this deck");
    }

    // The deck's cards and the learner's progress against them, in parallel.
    // Two queries rather than one join: joining the per-type rows would repeat
    // every card column up to four times, which is what the projection work in
    // P3-STUDY-SVC was for. Neither query depends on the other's result.
    const [rows, progressRows] = await Promise.all([
      this.deps.database
        .select({ ...cardColumns, seen: schema.userVocabItems.seen })
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
        ),
      this.deps.database
        .select(studyProgressColumns)
        .from(schema.userStudyProgress)
        .innerJoin(
          schema.deckVocabItems,
          eq(
            schema.deckVocabItems.vocabItemId,
            schema.userStudyProgress.vocabItemId,
          ),
        )
        .where(
          and(
            eq(schema.userStudyProgress.userId, userDeck.userId),
            eq(schema.deckVocabItems.deckId, userDeck.deckId),
          ),
        ),
    ]);

    const progress = progressByItem(progressRows);
    const vocabItems = rows.map((row) => ({
      ...row,
      progress: progress.get(row.id) ?? emptyStudyProgress(),
    }));

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
      enabledStudyTypes: enabled,
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
    const [result, progressRows] = await Promise.all([
      this.deps.database
        .select({
          item: schema.vocabItems,
          username: schema.users.name,
          seen: schema.userVocabItems.seen,
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
        .limit(1),
      // At most four rows, keyed on this table's primary key.
      this.deps.database
        .select(studyProgressColumns)
        .from(schema.userStudyProgress)
        .where(
          and(
            eq(schema.userStudyProgress.userId, userId),
            eq(schema.userStudyProgress.vocabItemId, vocabItemId),
          ),
        ),
    ]);

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
      progress:
        progressByItem(progressRows).get(vocabItemId) ?? emptyStudyProgress(),
      memoryAidId,
      memoryAid,
      constituents: await this.deps.vocabService.getVocabItemParts({
        vocabItem: item.item.vocabItem,
        vocabType: item.item.vocabType,
        decomposition: item.item.decomposition,
      }),
    };
  }

  /**
   * Every deck this learner has saved, with its standing.
   *
   * Batched on purpose: the study list renders up to 50 decks, and a call per
   * deck would be 50 round trips for one screen.
   *
   * The caller does not say which decks, and there is no entry for one the
   * learner has not saved. It used to take ids, which only `getUserDecks` could
   * supply, so the page had to fetch its deck list and wait for it before it
   * could ask for progress at all. The ids were never anything but the set this
   * query already filters by, since it matches on `userId` too.
   */
  async getDeckProgress(userId: string): Promise<DeckProgressDto[]> {
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
      .where(eq(schema.userDecks.userId, userId));

    if (userDecks.length === 0) return [];

    const enabledByDeck = new Map<string, StudyType[]>(
      userDecks.map((deck) => [deck.deckId, enabledStudyTypes(deck)]),
    );

    // The same join getNextVocabItem selects from, widened to every enrolled
    // deck at once. Disabled items are excluded here too, so they neither
    // count towards progress nor gate anything.
    const [rows, progressRows] = await Promise.all([
      this.deps.database
        .select({
          deckId: schema.deckVocabItems.deckId,
          ...cardColumns,
          seen: schema.userVocabItems.seen,
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
        ),
      // Every progress row this learner has, without a deck join. The join
      // would repeat a row for each deck the item belongs to, and the rollup
      // wants all of their decks anyway; rows for items no longer in a deck
      // simply go unread.
      this.deps.database
        .select(studyProgressColumns)
        .from(schema.userStudyProgress)
        .where(eq(schema.userStudyProgress.userId, userId)),
    ]);

    const progress = progressByItem(progressRows);
    const itemsByDeck = new Map<string, StudiableItem[]>();
    for (const row of rows) {
      const item = {
        ...row,
        progress: progress.get(row.id) ?? emptyStudyProgress(),
      };
      const items = itemsByDeck.get(row.deckId);
      if (items) items.push(item);
      else itemsByDeck.set(row.deckId, [item]);
    }

    const now = new Date();

    return [...enabledByDeck].map(([deckId, enabled]) => {
      return summariseDeckProgress({
        deckId,
        items: itemsByDeck.get(deckId) ?? [],
        enabledStudyTypes: enabled,
        gateLevel: CONSTITUENT_GATE_LEVEL,
        now,
      });
    });
  }
}
