import "server-only";

import { and, inArray, desc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import { filterDecomposition } from "@/lib/decomposition";
import { readingOf } from "@/server/study-rules";
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
  buildDecompositionIndex,
  extractNeighbourhood,
  type DecompositionIndex,
  type GraphGlyph,
} from "@/server/decomposition-graph";
import {
  type AdminMemoryAidDto,
  type DecompositionGraphDto,
  MemoryAidDto,
  VocabTypeEnum,
  type VocabType,
  type SearchLanguage,
  VocabItemDetailedDto,
  VocabItemDto,
} from "@/definitions/definitions";

/**
 * The corpus only changes when an admin edits vocabulary, so the index is built
 * once and reused. Five minutes is short enough that a disable takes effect
 * without a deploy and long enough that clicking through the graph does not
 * re-scan the table on every hop.
 */
const DECOMPOSITION_INDEX_TTL_MS = 5 * 60_000;

/**
 * One vocab row as the learner-facing dictionary sees it.
 *
 * The single place a row becomes a DTO, because the two call sites drifted once
 * already: the entry page blanked a component's borrowed reading and the search
 * list returned the raw row, so 亻 was silent on one screen and said 人's "rén"
 * on the other. It also drops the admin-only columns a `select()` sweeps up.
 *
 * Exported so a test can pin that blanking without a database.
 */
export function toVocabItemDto(
  row: typeof schema.vocabItems.$inferSelect,
): VocabItemDto {
  const reading = readingOf(row);
  return {
    id: row.id,
    vocabItem: row.vocabItem,
    translation: row.translation,
    pinyin: reading.pinyin,
    vocabType: row.vocabType,
    script: row.script,
    audioUrl: reading.audioUrl,
    phonetic: row.phonetic,
    decomposition: row.decomposition,
    etymologyHint: row.etymologyHint,
    etymologyType: row.etymologyType,
    etymologyPhonetic: row.etymologyPhonetic,
    etymologySemantic: row.etymologySemantic,
    radical: row.radical,
    strokes: row.strokes,
    strokeMedians: row.strokeMedians,
    strokeMatches: row.strokeMatches,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * ORDER BY terms for a memory-aid list: the starred aid first, then most-used.
 *
 * The default term is emitted ONLY when there is a default. A bare integer
 * literal in ORDER BY is interpreted by Postgres as a select-column ordinal, so
 * a `0` fallback references a non-existent column 0 and the whole query throws —
 * which is exactly what broke every aid list that had no starred default (all of
 * them). Exported so a test can assert the term count without a database.
 */
export function memoryAidOrder(defaultMemoryAidId?: string | null) {
  const byUsage = desc(count(userVocabItems.userId));
  if (!defaultMemoryAidId) return [byUsage];
  return [
    desc(
      sql<number>`(case when ${memoryAids.id} = ${defaultMemoryAidId} then 1 else 0 end)`,
    ),
    byUsage,
  ];
}

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

  // The whole row, so callers can read admin-only columns like
  // defaultMemoryAidId that the learner-facing VocabItemDto omits.
  async getVocabItem(
    vocabItem: string,
  ): Promise<typeof schema.vocabItems.$inferSelect> {
    const vocabItemRes = await this.deps.database.query.vocabItems.findFirst({
      // Disabled items are treated as if they did not exist, so this throws for
      // them exactly as it does for an unknown glyph.
      where: (vocabItems, { and, eq }) =>
        and(
          eq(vocabItems.vocabItem, vocabItem),
          eq(vocabItems.disabled, false),
        ),
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
        // Pin the starred aid to the front, so it lands on page 1 regardless of
        // how many people happen to use it.
        defaultMemoryAidId: vocabItem.defaultMemoryAidId,
      }),
      this.countMemoryAids({
        vocabItemId: vocabItem.id,
        viewerId: args.viewerId,
      }),
    ]);

    return {
      ...toVocabItemDto(vocabItem),
      memoryAids,
      memoryAidTotal,
      defaultMemoryAidId: vocabItem.defaultMemoryAidId,
      constituents: await this.getVocabItemParts({
        vocabItem: vocabItem.vocabItem,
        vocabType: vocabItem.vocabType,
        decomposition: vocabItem.decomposition,
      }),
    };
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
    /** When set, this aid sorts ahead of everything else regardless of usage. */
    defaultMemoryAidId?: string | null;
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
      // Pin the starred aid first, then order by usage. The rank term is only
      // added when there is a default — a bare `0` here would be read as ORDER
      // BY the 0th select column, which Postgres rejects as out of range.
      .orderBy(...memoryAidOrder(args.defaultMemoryAidId))
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
    /** Curated admin aids are public immediately; a learner's own start private. */
    public?: boolean;
  }): Promise<MemoryAidDto> {
    const [memoryAidRow] = await this.deps.database
      .insert(memoryAids)
      .values({
        vocabItemId: args.vocabItemId,
        createdById: args.userId,
        memoryAid: args.memoryAid,
        public: args.public ?? false,
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
   * Every memory aid on a glyph, as an admin sees it — private ones included,
   * each tagged with its usage, whether it is public, and whether it is the
   * starred default. Ordered default first, then by usage.
   */
  async listMemoryAidsForItemAdmin(vocabItemId: string): Promise<{
    items: AdminMemoryAidDto[];
    defaultMemoryAidId: string | null;
  }> {
    const item = await this.deps.database.query.vocabItems.findFirst({
      columns: { defaultMemoryAidId: true },
      where: (vocabItems, { eq }) => eq(vocabItems.id, vocabItemId),
    });

    if (!item) {
      throw new Error(`Vocab item not found: ${vocabItemId}`);
    }

    const defaultMemoryAidId = item.defaultMemoryAidId;

    const rows = await this.deps.database
      .select({
        id: memoryAids.id,
        memoryAid: memoryAids.memoryAid,
        isPublic: memoryAids.public,
        createdByUsername: users.name,
        usageCount: count(userVocabItems.userId).as("usage_count"),
      })
      .from(memoryAids)
      .leftJoin(users, eq(memoryAids.createdById, users.id))
      .leftJoin(userVocabItems, eq(memoryAids.id, userVocabItems.memoryAidId))
      .where(eq(memoryAids.vocabItemId, vocabItemId))
      .groupBy(memoryAids.id, users.id)
      .orderBy(...memoryAidOrder(defaultMemoryAidId));

    const items = rows.map((row) => ({
      id: row.id,
      memoryAid: row.memoryAid,
      createdByUsername: row.createdByUsername ?? "Anonymous",
      usageCount: row.usageCount,
      isPublic: row.isPublic,
      isDefault: row.id === defaultMemoryAidId,
    }));

    return { items, defaultMemoryAidId };
  }

  /**
   * Star an aid as the glyph's default, or clear the star with null.
   *
   * The aid must belong to the glyph — otherwise a stray id would set a default
   * that the dictionary query could never surface, leaving a glyph that claims a
   * default it never shows.
   */
  async setDefaultMemoryAid(args: {
    vocabItemId: string;
    memoryAidId: string | null;
  }): Promise<{ defaultMemoryAidId: string | null }> {
    if (args.memoryAidId !== null) {
      const aid = await this.deps.database.query.memoryAids.findFirst({
        columns: { id: true },
        where: (memoryAids, { and, eq }) =>
          and(
            eq(memoryAids.id, args.memoryAidId!),
            eq(memoryAids.vocabItemId, args.vocabItemId),
          ),
      });

      if (!aid) {
        throw new Error("That memory aid does not belong to this glyph");
      }
    }

    await this.deps.database
      .update(schema.vocabItems)
      .set({ defaultMemoryAidId: args.memoryAidId })
      .where(eq(schema.vocabItems.id, args.vocabItemId));

    return { defaultMemoryAidId: args.memoryAidId };
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
      items: items.map(toVocabItemDto),
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

  private indexCache?: { builtAt: number; index: Promise<DecompositionIndex> };

  /**
   * One hop of the decomposition graph around a glyph, uncapped.
   *
   * The traversal itself lives in @/server/decomposition-graph — this method owns
   * only the freshness rules that need the database.
   */
  async getDecompositionGraph(
    vocabItem: string,
  ): Promise<DecompositionGraphDto> {
    // Authoritative existence check, so an unknown or disabled glyph fails the
    // same way it does on every other read path instead of returning an empty
    // graph, and so a brand-new glyph is never hidden by a stale index.
    const focus = await this.getVocabItem(vocabItem);
    if (focus.vocabType === "sentence") {
      throw new Error(
        `Sentences decompose by segmentation, not by glyph, and have no decomposition graph: ${vocabItem}`,
      );
    }

    let index = await this.decompositionIndex();
    if (!index.glyphs.has(focus.vocabItem)) {
      // The row exists but the cached index predates it. Rebuild rather than
      // report an empty neighbourhood for a glyph we just confirmed is live.
      this.indexCache = undefined;
      index = await this.decompositionIndex();
    }

    return {
      focus: focus.vocabItem,
      ...extractNeighbourhood(index, focus.vocabItem),
    };
  }

  private decompositionIndex(): Promise<DecompositionIndex> {
    const now = Date.now();
    const cached = this.indexCache;
    if (cached && now - cached.builtAt < DECOMPOSITION_INDEX_TTL_MS) {
      return cached.index;
    }

    const entry = { builtAt: now, index: this.buildDecompositionIndex() };
    // A rejected build must not be cached for the whole TTL, or one transient
    // database error breaks the view for five minutes.
    entry.index.catch(() => {
      if (this.indexCache === entry) this.indexCache = undefined;
    });
    this.indexCache = entry;

    return entry.index;
  }

  /**
   * The one query behind the graph: every teachable, non-sentence row.
   *
   * Both exclusions are load-bearing and documented on buildDecompositionIndex —
   * `disabled` rows must be absent so hidden parts cannot leak in as edges, and
   * sentences decompose by segmentation rather than by glyph.
   */
  private async buildDecompositionIndex(): Promise<DecompositionIndex> {
    const rows: GraphGlyph[] = await this.deps.database
      .select({
        vocabItem: schema.vocabItems.vocabItem,
        vocabType: schema.vocabItems.vocabType,
        pinyin: schema.vocabItems.pinyin,
        translation: schema.vocabItems.translation,
        decomposition: schema.vocabItems.decomposition,
      })
      .from(schema.vocabItems)
      .where(
        and(
          eq(schema.vocabItems.disabled, false),
          ne(schema.vocabItems.vocabType, "sentence"),
        ),
      );

    const index = buildDecompositionIndex(rows);
    this.deps.logger.debug(
      { glyphs: index.glyphs.size, composed: index.children.size },
      "Built decomposition index",
    );

    return index;
  }
}
