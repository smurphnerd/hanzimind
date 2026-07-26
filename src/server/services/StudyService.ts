import "server-only";

import type { Logger } from "pino";
import { and, eq } from "drizzle-orm";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  type VocabItemStudyDto,
  type StudyType,
  type UserVocabItemDto,
  type StudyAnswerDto,
} from "@/definitions/definitions";
import type { ITranslationChecker } from "./TranslationChecker";
import type { VocabService } from "./VocabService";
import {
  SPACED_REPETITION_INTERVALS,
  CONSTITUENT_GATE_LEVEL,
  REQUIRE_PINYIN_TONES,
} from "@/server/constants";
import {
  canStudy,
  isUnlocked,
  pronounceableType,
  readingOf,
  servableStudyTypes,
  VOCAB_TYPE_PRIORITY,
} from "@/server/study-rules";
import { pinyinMatches } from "@/lib/pinyin";

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

    try {
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
    } catch (error) {
      this.deps.logger.error({ error, args }, "Error adding deck to study");
      throw error instanceof Error
        ? error
        : new Error("Failed to add deck to study list");
    }
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

    try {
      await this.deps.database.transaction(async (tx) => {
        await tx
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
          );

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
    } catch (error) {
      this.deps.logger.error({ error, args }, "Error updating deck settings");
      throw error instanceof Error
        ? error
        : new Error("Failed to update deck settings");
    }
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
    if (!synonym) throw new Error("Synonym cannot be empty");

    await this.deps.database
      .insert(schema.userVocabSynonyms)
      .values({
        userId: args.userId,
        vocabItemId: args.vocabItemId,
        synonym,
      })
      .onConflictDoNothing();
  }

  private getNextReviewTime(
    currentLevel: number,
    correct: boolean,
  ): { nextLevel: number; nextAt: Date } {
    const now = new Date();

    if (!correct) {
      // Incorrect answer: reset to level 0 and review in 1 minute
      return {
        nextLevel: 0,
        nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.INCORRECT),
      };
    }

    // Correct answer: advance level and set next review time
    switch (currentLevel) {
      case 0:
        return {
          nextLevel: 1,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_0),
        };
      case 1:
        return {
          nextLevel: 2,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_1),
        };
      case 2:
        return {
          nextLevel: 3,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_2),
        };
      case 3:
        return {
          nextLevel: 4,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_3),
        };
      case 4:
        return {
          nextLevel: 5,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_4),
        };
      case 5:
      default:
        return {
          nextLevel: 5,
          nextAt: new Date(now.getTime() + SPACED_REPETITION_INTERVALS.LEVEL_5),
        };
    }
  }

  async processAnswer(
    answer: StudyAnswerDto,
    userId: string,
  ): Promise<boolean> {
    try {
      // Fetch both vocab item and user progress in parallel
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
        throw new Error(`Vocab item not found: ${answer.vocabItemId}`);
      }

      // getNextVocabItem never offers a card the item can't answer, but the
      // client sends the study type back, so a stale tab or a crafted request
      // could otherwise advance e.g. readingLevel on a component using the
      // borrowed parent pinyin. Re-check server-side.
      if (
        answer.studyType !== "new" &&
        !canStudy(vocabItem, answer.studyType)
      ) {
        throw new Error(
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

      let answerCorrect = false;

      // Check if the answer is correct based on study type.
      // Pinyin is compared in canonical form so notation (nv3 / nü3 / nǚ,
      // spaced or not, any case) never decides right vs wrong.
      if (answer.studyType === "reading") {
        answerCorrect = pinyinMatches(answer.answer, vocabItem.pinyin, {
          requireTones: REQUIRE_PINYIN_TONES,
        });
      } else if (answer.studyType === "listening") {
        answerCorrect =
          pinyinMatches(answer.answer, vocabItem.pinyin, {
            requireTones: REQUIRE_PINYIN_TONES,
          }) || answer.answer.trim() === vocabItem.vocabItem.trim();
      } else if (answer.studyType === "understanding") {
        // A meaning the user has explicitly accepted for this item always
        // counts, and costs one indexed lookup.
        const normalized = answer.answer.trim().toLowerCase();
        const ownSynonym = normalized
          ? await this.deps.database.query.userVocabSynonyms.findFirst({
              where: (s, { eq, and }) =>
                and(
                  eq(s.userId, userId),
                  eq(s.vocabItemId, answer.vocabItemId),
                  eq(s.synonym, normalized),
                ),
            })
          : undefined;

        if (ownSynonym) {
          answerCorrect = true;
        } else {
          if (!vocabItem.translation) {
            throw new Error(
              `Vocab item ${answer.vocabItemId} has no translation to check against`,
            );
          }
          answerCorrect = await this.deps.translationChecker.checkSimilarity(
            answer.answer,
            vocabItem.translation,
          );
        }
      } else {
        // writing
        answerCorrect = answer.answer.trim() === vocabItem.vocabItem.trim();
      }

      // Get current level for this study type
      const levelField = `${answer.studyType}Level` as
        | "readingLevel"
        | "listeningLevel"
        | "understandingLevel"
        | "writingLevel";
      const currentLevel = userVocabItem[levelField] ?? 0;

      // Calculate next level and review time
      const { nextLevel, nextAt } = this.getNextReviewTime(
        currentLevel,
        answerCorrect,
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
    } catch (error) {
      this.deps.logger.error({ error, answer }, "Error processing answer");
      throw error instanceof Error
        ? error
        : new Error("Failed to process answer");
    }
  }

  async getNextVocabItem(
    userId: string,
    deckId: string,
  ): Promise<VocabItemStudyDto | null> {
    try {
      const userDeck = await this.deps.database.query.userDecks.findFirst({
        where: (userDecks, { eq, and }) =>
          and(eq(userDecks.userId, userId), eq(userDecks.deckId, deckId)),
      });

      if (!userDeck) {
        throw new Error(`User deck not found for user ${userId}`);
      }

      const now = new Date();

      // Determine which study types are enabled
      const enabledStudyTypes: StudyType[] = [];
      if (userDeck.readingEnabled) enabledStudyTypes.push("reading");
      if (userDeck.listeningEnabled) enabledStudyTypes.push("listening");
      if (userDeck.understandingEnabled)
        enabledStudyTypes.push("understanding");
      if (userDeck.writingEnabled) enabledStudyTypes.push("writing");

      if (enabledStudyTypes.length === 0) {
        throw new Error("No study types enabled for this deck");
      }

      // Fetch all vocab items in the deck with user progress
      const vocabItems = await this.deps.database
        .select({
          id: schema.vocabItems.id,
          vocabItem: schema.vocabItems.vocabItem,
          translation: schema.vocabItems.translation,
          pinyin: schema.vocabItems.pinyin,
          audioUrl: schema.vocabItems.audioUrl,
          vocabType: schema.vocabItems.vocabType,
          decomposition: schema.vocabItems.decomposition,
          etymologyHint: schema.vocabItems.etymologyHint,
          etymologyType: schema.vocabItems.etymologyType,
          radical: schema.vocabItems.radical,
          strokes: schema.vocabItems.strokes,
          strokeMedians: schema.vocabItems.strokeMedians,
          strokeMatches: schema.vocabItems.strokeMatches,
          createdAt: schema.vocabItems.createdAt,
          updatedAt: schema.vocabItems.updatedAt,
          seen: schema.userVocabItems.seen,
          readingLevel: schema.userVocabItems.readingLevel,
          listeningLevel: schema.userVocabItems.listeningLevel,
          understandingLevel: schema.userVocabItems.understandingLevel,
          writingLevel: schema.userVocabItems.writingLevel,
          readingNextAt: schema.userVocabItems.readingNextAt,
          listeningNextAt: schema.userVocabItems.listeningNextAt,
          understandingNextAt: schema.userVocabItems.understandingNextAt,
          writingNextAt: schema.userVocabItems.writingNextAt,
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
      const byVocabItem = new Map(vocabItems.map((i) => [i.vocabItem, i]));

      // Filter and score vocab items for each enabled study type
      const candidates = vocabItems
        .map((item) => {
          // Calculate shared scoring metrics
          const vocabTypePriority = VOCAB_TYPE_PRIORITY[item.vocabType];

          const decompositionLength =
            item.vocabType === "character" && item.decomposition
              ? item.decomposition.length
              : 999;

          // Unseen items are introductions — only offer them once their
          // constituents are known well enough.
          if (!item.seen) {
            if (
              !isUnlocked(
                item,
                byVocabItem,
                enabledStudyTypes,
                CONSTITUENT_GATE_LEVEL,
              )
            ) {
              return null;
            }
            // An intro card is pointless if nothing about it can be quizzed.
            if (servableStudyTypes(item, enabledStudyTypes).length === 0) {
              return null;
            }
            return {
              ...item,
              selectedStudyType: "new" as const,
              isNew: true,
              minLevel: -1,
              vocabTypePriority,
              decompositionLength,
              randomTiebreaker: Math.random(),
            };
          }

          // For seen items, find the study type with lowest level that's due
          let selectedStudyType: StudyType | null = null;
          let minLevel = Infinity;

          for (const studyType of enabledStudyTypes) {
            if (!canStudy(item, studyType)) continue;

            const level = item[`${studyType}Level`] ?? 0;
            const nextAt = item[`${studyType}NextAt`];
            const isDue = nextAt === null || nextAt <= now;

            if (isDue && level < minLevel) {
              minLevel = level;
              selectedStudyType = studyType;
            }
          }

          // Skip items with no due study types
          if (selectedStudyType === null) return null;

          return {
            ...item,
            selectedStudyType,
            isNew: false,
            minLevel,
            vocabTypePriority,
            decompositionLength,
            randomTiebreaker: Math.random(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (candidates.length === 0) {
        // Nothing due — the caller renders the session-complete screen.
        return null;
      }

      // Sort by:
      // 1. Due reviews before brand-new items, so a big deck doesn't front-load
      //    every introduction before you review anything (Anki's
      //    "show new cards after reviews").
      // 2. Minimum level (ascending - lower level first)
      // 3. Vocab type priority (ascending - components first, then characters)
      // 4. Decomposition length (ascending - shorter first for characters)
      // 5. Random tiebreaker
      candidates.sort((a, b) => {
        if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
        if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
        if (a.vocabTypePriority !== b.vocabTypePriority)
          return a.vocabTypePriority - b.vocabTypePriority;
        if (a.decompositionLength !== b.decompositionLength)
          return a.decompositionLength - b.decompositionLength;
        return a.randomTiebreaker - b.randomTiebreaker;
      });

      const selectedItem = candidates[0];

      // Return the full vocab item if this is the first time studying this item
      if (!selectedItem.seen) {
        return {
          id: selectedItem.id,
          vocabItem: selectedItem.vocabItem,
          translation: selectedItem.translation,
          pinyin: readingOf(selectedItem).pinyin,
          vocabType: selectedItem.vocabType,
          audioUrl: readingOf(selectedItem).audioUrl,
          decomposition: selectedItem.decomposition,
          etymologyHint: selectedItem.etymologyHint,
          etymologyType: selectedItem.etymologyType,
          radical: selectedItem.radical,
          strokes: selectedItem.strokes,
          strokeMedians: selectedItem.strokeMedians,
          strokeMatches: selectedItem.strokeMatches,
          createdAt: selectedItem.createdAt,
          updatedAt: selectedItem.updatedAt,
          studyType: "new",
          constituents: await this.deps.vocabService.getVocabItemParts({
            vocabItem: selectedItem.vocabItem,
            vocabType: selectedItem.vocabType,
            decomposition: selectedItem.decomposition,
          }),
        };
      }

      // Return only the fields needed for the selected study type
      const studyType = selectedItem.selectedStudyType;

      if (studyType === "reading") {
        return {
          id: selectedItem.id,
          studyType: "reading",
          vocabItem: selectedItem.vocabItem,
          vocabType: pronounceableType(selectedItem, studyType),
        };
      } else if (studyType === "listening") {
        return {
          id: selectedItem.id,
          studyType: "listening",
          audioUrl: selectedItem.audioUrl,
          vocabType: pronounceableType(selectedItem, studyType),
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
          vocabType: pronounceableType(selectedItem, studyType),
        };
      }
    } catch (error) {
      this.deps.logger.error(
        { error, userId, deckId },
        "Error getting next vocab item",
      );
      throw error instanceof Error
        ? error
        : new Error("Failed to get next vocab item");
    }
  }

  async getUserVocabItem(
    userId: string,
    vocabItemId: string,
  ): Promise<UserVocabItemDto> {
    try {
      // Query for vocab item, user progress, user info, and memory aid in one query
      const result = await this.deps.database
        .select({
          // Vocab item fields
          id: schema.vocabItems.id,
          vocabItem: schema.vocabItems.vocabItem,
          translation: schema.vocabItems.translation,
          pinyin: schema.vocabItems.pinyin,
          vocabType: schema.vocabItems.vocabType,
          audioUrl: schema.vocabItems.audioUrl,
          decomposition: schema.vocabItems.decomposition,
          etymologyHint: schema.vocabItems.etymologyHint,
          etymologyType: schema.vocabItems.etymologyType,
          radical: schema.vocabItems.radical,
          strokes: schema.vocabItems.strokes,
          strokeMedians: schema.vocabItems.strokeMedians,
          strokeMatches: schema.vocabItems.strokeMatches,
          createdAt: schema.vocabItems.createdAt,
          updatedAt: schema.vocabItems.updatedAt,
          // User info
          username: schema.users.name,
          // User progress fields
          seen: schema.userVocabItems.seen,
          readingLevel: schema.userVocabItems.readingLevel,
          listeningLevel: schema.userVocabItems.listeningLevel,
          understandingLevel: schema.userVocabItems.understandingLevel,
          writingLevel: schema.userVocabItems.writingLevel,
          memoryAidId: schema.userVocabItems.memoryAidId,
          readingNextAt: schema.userVocabItems.readingNextAt,
          listeningNextAt: schema.userVocabItems.listeningNextAt,
          understandingNextAt: schema.userVocabItems.understandingNextAt,
          writingNextAt: schema.userVocabItems.writingNextAt,
          // Memory aid text
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

      return {
        id: item.id,
        vocabItem: item.vocabItem,
        translation: item.translation,
        pinyin: readingOf(item).pinyin,
        vocabType: item.vocabType,
        audioUrl: readingOf(item).audioUrl,
        decomposition: item.decomposition,
        etymologyHint: item.etymologyHint,
        etymologyType: item.etymologyType,
        radical: item.radical,
        strokes: item.strokes,
        strokeMedians: item.strokeMedians,
        strokeMatches: item.strokeMatches,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        userId,
        username: item.username,
        seen: item.seen,
        readingLevel: item.readingLevel,
        listeningLevel: item.listeningLevel,
        understandingLevel: item.understandingLevel,
        writingLevel: item.writingLevel,
        memoryAidId: item.memoryAidId,
        memoryAid: item.memoryAid,
        readingNextAt: item.readingNextAt,
        listeningNextAt: item.listeningNextAt,
        understandingNextAt: item.understandingNextAt,
        writingNextAt: item.writingNextAt,
        constituents: await this.deps.vocabService.getVocabItemParts({
          vocabItem: item.vocabItem,
          vocabType: item.vocabType,
          decomposition: item.decomposition,
        }),
      };
    } catch (error) {
      this.deps.logger.error(
        { error, userId, vocabItemId },
        "Error getting user vocab item",
      );
      throw error instanceof Error
        ? error
        : new Error("Failed to get user vocab item");
    }
  }
}
