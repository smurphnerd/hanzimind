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
import { SPACED_REPETITION_INTERVALS } from "@/server/constants";

export class StudyService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
      translationChecker: ITranslationChecker;
    },
  ) {}

  async addDeck(args: {
    userId: string;
    deckId: string;
    includeConstituents: boolean;
    readingEnabled: boolean;
    listeningEnabled: boolean;
    understandingEnabled: boolean;
    writingEnabled: boolean;
  }): Promise<void> {
    const {
      userId,
      deckId,
      includeConstituents,
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
            includeConstituents,
            readingEnabled,
            listeningEnabled,
            understandingEnabled,
            writingEnabled,
          })
          .onConflictDoNothing();

        // Get the vocab items in the deck
        const whereConditions = includeConstituents
          ? eq(schema.deckVocabItems.deckId, deckId)
          : and(
              eq(schema.deckVocabItems.deckId, deckId),
              eq(schema.deckVocabItems.isConstituent, false),
            );

        const vocabItems = await tx
          .select({
            vocabItemId: schema.deckVocabItems.vocabItemId,
          })
          .from(schema.deckVocabItems)
          .where(whereConditions);

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
    includeConstituents: boolean;
    readingEnabled: boolean;
    listeningEnabled: boolean;
    understandingEnabled: boolean;
    writingEnabled: boolean;
  }): Promise<void> {
    const {
      userId,
      deckId,
      includeConstituents,
      readingEnabled,
      listeningEnabled,
      understandingEnabled,
      writingEnabled,
    } = args;

    try {
      await this.deps.database
        .update(schema.userDecks)
        .set({
          includeConstituents,
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
    } catch (error) {
      this.deps.logger.error({ error, args }, "Error updating deck settings");
      throw error instanceof Error
        ? error
        : new Error("Failed to update deck settings");
    }
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
      const [vocabItem, userVocabItem] = await Promise.all([
        this.deps.database.query.vocabItems.findFirst({
          where: (vocabItems, { eq }) => eq(vocabItems.id, answer.vocabItemId),
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

      if (!userVocabItem) {
        throw new Error(
          `User vocab item not found for user ${userId} and vocab ${answer.vocabItemId}`,
        );
      }

      if (answer.studyType === "new") {
        this.deps.database
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

      // Check if the answer is correct based on study type
      if (answer.studyType === "reading") {
        answerCorrect = answer.answer === vocabItem.pinyin;
      } else if (answer.studyType === "listening") {
        answerCorrect =
          answer.answer === vocabItem.pinyin ||
          answer.answer === vocabItem.vocabItem;
      } else if (answer.studyType === "understanding") {
        // Use translation checker for semantic similarity
        if (!vocabItem.translation) {
          throw new Error(
            `Vocab item ${answer.vocabItemId} has no translation to check against`,
          );
        }
        answerCorrect = this.deps.translationChecker.checkSimilarity(
          answer.answer,
          vocabItem.translation,
        );
      } else {
        // writing
        answerCorrect = answer.answer === vocabItem.vocabItem;
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
  ): Promise<VocabItemStudyDto> {
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

      // Build the condition to include constituents or not
      const isConstituentCondition = userDeck.includeConstituents
        ? undefined
        : eq(schema.deckVocabItems.isConstituent, false);

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
            isConstituentCondition,
          ),
        );

      if (vocabItems.length === 0) {
        throw new Error("No vocab items found in deck");
      }

      // Filter and score vocab items for each enabled study type
      const candidates = vocabItems
        .map((item) => {
          // Calculate shared scoring metrics
          const vocabTypePriority =
            item.vocabType === "character"
              ? 1
              : item.vocabType === "compound"
                ? 2
                : 3;

          const decompositionLength =
            item.vocabType === "character" && item.decomposition
              ? item.decomposition.length
              : 999;

          // Unseen items get highest priority
          if (!item.seen) {
            return {
              ...item,
              selectedStudyType: "new" as const,
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
            minLevel,
            vocabTypePriority,
            decompositionLength,
            randomTiebreaker: Math.random(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (candidates.length === 0) {
        throw new Error("No vocab items are due for study");
      }

      // Sort by:
      // 1. Minimum level (ascending - lower level first)
      // 2. Vocab type priority (ascending - characters first)
      // 3. Decomposition length (ascending - shorter first for characters)
      // 4. Random tiebreaker
      candidates.sort((a, b) => {
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
          pinyin: selectedItem.pinyin,
          vocabType: selectedItem.vocabType,
          audioUrl: selectedItem.audioUrl,
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
        };
      }

      // Return only the fields needed for the selected study type
      const studyType = selectedItem.selectedStudyType;

      if (studyType === "reading") {
        return {
          id: selectedItem.id,
          studyType: "reading",
          vocabItem: selectedItem.vocabItem,
        };
      } else if (studyType === "listening") {
        return {
          id: selectedItem.id,
          studyType: "listening",
          audioUrl: selectedItem.audioUrl,
        };
      } else if (studyType === "understanding") {
        return {
          id: selectedItem.id,
          studyType: "understanding",
          vocabItem: selectedItem.vocabItem,
          audioUrl: selectedItem.audioUrl,
        };
      } else {
        // writing
        return {
          id: selectedItem.id,
          studyType: "writing",
          translation: selectedItem.translation,
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
        .where(eq(schema.vocabItems.id, vocabItemId))
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
        pinyin: item.pinyin,
        vocabType: item.vocabType,
        audioUrl: item.audioUrl,
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
