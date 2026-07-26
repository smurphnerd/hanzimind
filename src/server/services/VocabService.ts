import "server-only";

import { and, inArray, desc, count, eq, ilike, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import { filterDecomposition } from "@/lib/decomposition";
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
      // Disabled items are treated as if they did not exist, so this throws for
      // them exactly as it does for an unknown glyph.
      where: (vocabItems, { and, eq }) =>
        and(eq(vocabItems.vocabItem, vocabItem), eq(vocabItems.disabled, false)),
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
    viewerId?: string;
  }): Promise<VocabItemDetailedDto> {
    const vocabItem = await this.getVocabItem(args.vocabItem);

    const offset = (args.memoryAidPage - 1) * args.memoryAidPageSize;
    const [memoryAids, memoryAidTotal] = await Promise.all([
      this.getMemoryAidsSortedByUsage({
        vocabItemId: vocabItem.id,
        limit: args.memoryAidPageSize,
        offset,
        viewerId: args.viewerId,
      }),
      this.countMemoryAids({
        vocabItemId: vocabItem.id,
        viewerId: args.viewerId,
      }),
    ]);

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
      memoryAidTotal,
      constituents: await this.getVocabItemParts({
        vocabItem: vocabItem.vocabItem,
        vocabType: vocabItem.vocabType,
        decomposition: vocabItem.decomposition,
      }),
    };

    return vocabItemDto;
  }

  /**
   * Visibility rule shared by the memory aid list and its total count so the
   * two can never disagree: public aids, plus the viewer's own private ones.
   */
  private memoryAidVisibilityWhere(args: {
    vocabItemId: string;
    viewerId?: string;
  }) {
    return and(
      eq(memoryAids.vocabItemId, args.vocabItemId),
      // Private aids belong to their author only.
      args.viewerId
        ? or(
            eq(memoryAids.public, true),
            eq(memoryAids.createdById, args.viewerId),
          )
        : eq(memoryAids.public, true),
    );
  }

  /** Total memory aids visible to the viewer, ignoring pagination. */
  async countMemoryAids(args: {
    vocabItemId: string;
    viewerId?: string;
  }): Promise<number> {
    const [row] = await this.deps.database
      .select({ count: count() })
      .from(memoryAids)
      .where(this.memoryAidVisibilityWhere(args));

    return Number(row?.count ?? 0);
  }

  async getMemoryAidsSortedByUsage(args: {
    vocabItemId: string;
    limit: number;
    offset: number;
    /** When set, this user's own private aids are included alongside public ones. */
    viewerId?: string;
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
      .where(
        this.memoryAidVisibilityWhere({
          vocabItemId: args.vocabItemId,
          viewerId: args.viewerId,
        }),
      )
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

  async createMemoryAid(args: {
    vocabItemId: string;
    userId: string;
    memoryAid: string;
  }): Promise<MemoryAidDto> {
    const [memoryAidRow] = await this.deps.database
      .insert(memoryAids)
      .values({
        vocabItemId: args.vocabItemId,
        createdById: args.userId,
        memoryAid: args.memoryAid,
        public: false,
      })
      .returning();

    if (!memoryAidRow) {
      throw new Error("Failed to create memory aid");
    }

    const user = await this.deps.database.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, args.userId),
    });

    return {
      id: memoryAidRow.id,
      memoryAid: memoryAidRow.memoryAid,
      createdById: memoryAidRow.createdById,
      createdByUsername: user?.name ?? "Anonymous",
      usageCount: 0,
    };
  }

  /**
   * Which of these are usable — present and not disabled.
   *
   * This is a read-path question. To ask whether a row is physically there
   * (before inserting, say) use getStoredVocabItems: `vocabItem` is unique, so a
   * disabled row still occupies its glyph.
   */
  async getExistingVocabItems(vocabList: string[]): Promise<string[]> {
    if (vocabList.length === 0) {
      return [];
    }

    const results = await this.deps.database
      .select({ vocabItem: schema.vocabItems.vocabItem })
      .from(schema.vocabItems)
      .where(
        and(
          inArray(schema.vocabItems.vocabItem, vocabList),
          eq(schema.vocabItems.disabled, false),
        ),
      );

    return results.map((r) => r.vocabItem);
  }

  /**
   * Which of these rows physically exist, disabled or not.
   *
   * Write paths must use this. Treating a disabled row as absent would send a
   * caller off to create it, and for a single character there is nothing to
   * create from — the dictionary seed is the only source — so it would throw.
   */
  async getStoredVocabItems(vocabList: string[]): Promise<string[]> {
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
      // Already stored — including as a disabled row, which still owns the glyph.
      const existing = await this.getStoredVocabItems([vocabItem]);
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
    // Trim stray whitespace and neutralise LIKE wildcards so a query of "%" or
    // "_" is matched literally instead of matching every row. Backslash is the
    // default LIKE escape character in Postgres, so it must be escaped first.
    const escapedQuery = args.query
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/[%_]/g, (char) => `\\${char}`);
    const searchPattern = `%${escapedQuery}%`;

    // Build where clause based on search language. Both the page and the count
    // query use it, so disabled items are excluded from the totals too — filtering
    // only one of the two would make the paging disagree with the result set.
    const whereClause = and(
      eq(schema.vocabItems.disabled, false),
      args.searchLanguage === "chinese"
        ? or(
            ilike(schema.vocabItems.vocabItem, searchPattern),
            ilike(schema.vocabItems.pinyin, searchPattern),
          )
        : ilike(schema.vocabItems.translation, searchPattern),
    );

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
        return this.removeDisabled(this.deps.translator.cutSentence(vocabItem));
      case "compound":
        return this.removeDisabled(vocabItem.split(""));
      case "character":
        if (!decomposition) {
          this.deps.logger.warn(
            { vocabItem },
            `No decomposition found for character ${vocabItem}`,
          );
          return [];
        }
        return this.removeDisabled(filterDecomposition(decomposition));
      // A component is a bound radical form — the floor of the hierarchy. Whatever
      // strokes it is drawn from are more basic than a radical, so we don't teach
      // them and don't decompose any further.
      case "component":
        return [];
      default:
        return [];
    }
  }

  /**
   * Drop any part that points at a disabled item. Disabled items are hidden
   * everywhere, so a decomposition must not surface them either — a character
   * built partly from a disabled fragment shows only its teachable parts.
   */
  private async removeDisabled(parts: string[]): Promise<string[]> {
    if (parts.length === 0) return [];

    const hidden = await this.deps.database
      .select({ vocabItem: schema.vocabItems.vocabItem })
      .from(schema.vocabItems)
      .where(
        and(
          inArray(schema.vocabItems.vocabItem, parts),
          eq(schema.vocabItems.disabled, true),
        ),
      );

    if (hidden.length === 0) return parts;

    const hiddenSet = new Set(hidden.map((row) => row.vocabItem));
    return parts.filter((part) => !hiddenSet.has(part));
  }
}
