import "server-only";

import { inArray, desc, count, eq, ilike, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import {
  memoryAids,
  schema,
  users,
  userVocabItems,
} from "@/server/database/schema";
import type { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import type { TranslatorService } from "@/server/services/TranslatorService";
import type { TTSService } from "@/server/services/TTSService";
import {
  MemoryAidDto,
  VocabTypeEnum,
  type VocabType,
  type SearchLanguage,
  VocabItemDetailedDto,
  VocabItemDto,
} from "@/definitions/definitions";

export class VocabService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
      translator: TranslatorService;
      tts: TTSService;
      storage: S3StorageAdapter;
    },
  ) {}

  async getVocabItem(vocabItem: string): Promise<VocabItemDto> {
    const vocabItemRes = await this.deps.database.query.vocabItems.findFirst({
      where: (vocabItems, { eq }) => eq(vocabItems.vocabItem, vocabItem),
    });

    if (!vocabItemRes) {
      throw new Error(`Vocab item not found: ${vocabItem}`);
    }

    return vocabItemRes;
  }

  async getVocabItemDetailed(args: {
    vocabItem: string;
    memoryAidPage: number;
    memoryAidPageSize: number;
  }): Promise<VocabItemDetailedDto> {
    const vocabItem = await this.getVocabItem(args.vocabItem);

    const offset = (args.memoryAidPage - 1) * args.memoryAidPageSize;
    const memoryAids = await this.getMemoryAidsSortedByUsage({
      vocabItemId: vocabItem.id,
      limit: args.memoryAidPageSize,
      offset,
    });

    // Transform to VocabItemDto
    const vocabItemDto: VocabItemDetailedDto = {
      id: vocabItem.id,
      vocabItem: vocabItem.vocabItem,
      translation: vocabItem.translation,
      pinyin: vocabItem.pinyin,
      vocabType: vocabItem.vocabType,
      audioUrl: vocabItem.audioUrl,
      decomposition: vocabItem.decomposition,
      etymologyHint: vocabItem.etymologyHint,
      etymologyType: vocabItem.etymologyType,
      radical: vocabItem.radical,
      strokes: vocabItem.strokes,
      strokeMedians: vocabItem.strokeMedians,
      strokeMatches: vocabItem.strokeMatches,
      createdAt: vocabItem.createdAt,
      updatedAt: vocabItem.updatedAt,
      memoryAids,
      constituents: await this.getVocabItemParts({
        vocabItem: vocabItem.vocabItem,
        vocabType: vocabItem.vocabType,
        decomposition: vocabItem.decomposition,
      }),
    };

    return vocabItemDto;
  }

  async getMemoryAidsSortedByUsage(args: {
    vocabItemId: string;
    limit: number;
    offset: number;
  }): Promise<MemoryAidDto[]> {
    const rows = await this.deps.database
      .select({
        // Select all fields from memoryAids
        id: memoryAids.id,
        memoryAid: memoryAids.memoryAid,
        vocabItemId: memoryAids.vocabItemId,
        createdById: memoryAids.createdById,
        createdAt: memoryAids.createdAt,
        createdByUsername: users.name,
        usageCount: count(userVocabItems.userId).as("usage_count"),
      })
      .from(memoryAids)
      .leftJoin(users, eq(memoryAids.createdById, users.id))
      .leftJoin(userVocabItems, eq(memoryAids.id, userVocabItems.memoryAidId))
      .where(eq(memoryAids.vocabItemId, args.vocabItemId))
      .groupBy(memoryAids.id, users.id)
      .orderBy(desc(count(userVocabItems.userId)))
      .limit(args.limit)
      .offset(args.offset);

    return rows.map((row) => ({
      id: row.id,
      memoryAid: row.memoryAid,
      createdById: row.createdById,
      createdByUsername: row.createdByUsername ?? "Anonymous",
      usageCount: row.usageCount,
    }));
  }

  async getExistingVocabItems(vocabList: string[]): Promise<string[]> {
    if (vocabList.length === 0) {
      return [];
    }

    const results = await this.deps.database
      .select({ vocabItem: schema.vocabItems.vocabItem })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.vocabItem, vocabList));

    return results.map((r) => r.vocabItem);
  }

  async addVocabItem(vocabItem: string): Promise<void> {
    try {
      // Check if it already exists
      const existing = await this.getExistingVocabItems([vocabItem]);
      if (existing.length > 0) {
        return;
      }

      // Check if it's a sentence by cutting it
      const parts = this.deps.translator.cutSentence(vocabItem);

      let componentsToAdd: string[];
      let translation: string;
      let vocabType: VocabType;

      // Is a sentence (multiple parts)
      if (parts.length > 1) {
        translation = await this.deps.translator.translateSentence(vocabItem);
        componentsToAdd = parts;
        vocabType = VocabTypeEnum.enum.sentence;
      } else if (vocabItem.length > 1) {
        // Is a compound word
        translation = await this.deps.translator.translateSentence(vocabItem);
        componentsToAdd = vocabItem.split("");
        vocabType = VocabTypeEnum.enum.compound;
      } else {
        // Is a single character should be in the dictionary
        throw new Error(
          `Cannot add vocab item with single character: ${vocabItem}`,
        );
      }

      const pinyinParts: string[] = [];
      for (const part of parts) {
        pinyinParts.push(this.deps.translator.getPinyin(part));
      }
      const pinyin = pinyinParts.join(" ");

      if (!pinyin) {
        throw new Error(`No pinyin found for vocab item: ${vocabItem}`);
      }

      // Generate audio and get URL
      const audioUrl = await this.deps.tts.getVocabAudio(vocabItem);

      // Recursively create components
      for (const component of componentsToAdd) {
        await this.addVocabItem(component);
      }

      // Create the vocab item
      await this.deps.database
        .insert(schema.vocabItems)
        .values({
          vocabItem,
          translation,
          pinyin,
          vocabType,
          audioUrl,
        })
        .returning({ id: schema.vocabItems.id });
    } catch (error) {
      this.deps.logger.error(
        { error, vocabItem },
        "Error adding vocab item with components",
      );
      throw error instanceof Error
        ? error
        : new Error("Failed to add vocab item with components");
    }
  }

  async searchVocabItems(args: {
    query: string;
    searchLanguage: SearchLanguage;
    page: number;
    pageSize: number;
  }): Promise<{
    items: VocabItemDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (args.page - 1) * args.pageSize;
    const searchPattern = `%${args.query}%`;

    // Build where clause based on search language
    const whereClause =
      args.searchLanguage === "chinese"
        ? or(
            ilike(schema.vocabItems.vocabItem, searchPattern),
            ilike(schema.vocabItems.pinyin, searchPattern),
          )
        : ilike(schema.vocabItems.translation, searchPattern);

    const [items, totalResult] = await Promise.all([
      this.deps.database
        .select()
        .from(schema.vocabItems)
        .where(whereClause)
        .orderBy(sql`length(${schema.vocabItems.vocabItem}) asc`)
        .limit(args.pageSize)
        .offset(offset),
      this.deps.database
        .select({ count: count() })
        .from(schema.vocabItems)
        .where(whereClause)
        .then((result) => result[0]?.count ?? 0),
    ]);

    const total = Number(totalResult);
    const totalPages = Math.ceil(total / args.pageSize);

    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize,
      totalPages,
    };
  }

  async getVocabItemPartsDeep(vocabItemStr: string): Promise<string[]> {
    const partsSet = new Set<string>();
    await this.getVocabItemPartsDeepRecursive(vocabItemStr, partsSet);

    return Array.from(partsSet);
  }

  async getVocabItemPartsDeepRecursive(
    vocabItemStr: string,
    partsSet: Set<string>,
  ) {
    if (partsSet.has(vocabItemStr)) {
      return;
    }
    partsSet.add(vocabItemStr);

    const vocabItem = await this.getVocabItem(vocabItemStr);
    const parts = await this.getVocabItemParts({
      vocabItem: vocabItem.vocabItem,
      vocabType: vocabItem.vocabType,
      decomposition: vocabItem.decomposition,
    });

    if (parts.length === 0) {
      return;
    }

    for (const part of parts) {
      await this.getVocabItemPartsDeepRecursive(part, partsSet);
    }
  }

  async getVocabItemParts({
    vocabItem,
    vocabType,
    decomposition,
  }: {
    vocabItem: string;
    vocabType?: VocabType;
    decomposition?: string | null;
  }): Promise<string[]> {
    if (!vocabType) {
      const fullVocabItem = await this.getVocabItem(vocabItem);
      vocabType = fullVocabItem.vocabType;
      decomposition = fullVocabItem.decomposition;
    }

    switch (vocabType) {
      case "sentence":
        return this.deps.translator.cutSentence(vocabItem);
      case "compound":
        return vocabItem.split("");
      case "character":
        if (!decomposition) {
          this.deps.logger.warn(
            { vocabItem },
            `No decomposition found for character ${vocabItem}`,
          );
          return [];
        }
        return Array.from(decomposition).filter((char) => {
          const codePoint = char.codePointAt(0);
          if (!codePoint) return false;

          if (char === "？" || char === "?") return false;

          if (codePoint >= 0x2ff0 && codePoint <= 0x2fff) return false;

          return true;
        });
      default:
        return [];
    }
  }
}
