import "server-only";

import { and, inArray, desc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import { filterDecomposition } from "@/lib/decomposition";
import { escapeLike } from "@/lib/sql";
import { readingOf } from "@/server/study-rules";
import { pageRange } from "@/lib/pagination";
import type { Drizzle, Executor } from "@/server/database/database";
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
import {
  InvalidInputError,
  isForeignKeyViolation,
  NotFoundError,
} from "@/server/endpoints/errors";

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
 * A dictionary row a create needs but the dictionary does not hold yet: fully
 * resolved — translated, transcribed, its audio already uploaded — and written
 * nowhere.
 *
 * The whole point of it being a value rather than a side effect. Resolving one
 * costs a DeepL call and a speech-synthesis upload, so it cannot happen inside a
 * transaction; writing one has to happen inside the caller's transaction, or a
 * create that fails afterwards leaves the learner's words in the shared
 * dictionary with no deck to reach them from. The type is the seam between
 * those two halves.
 */
export type PreparedVocabItem = {
  vocabItem: string;
  translation: string;
  pinyin: string;
  vocabType: VocabType;
  audioUrl: string;
};

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
      throw new NotFoundError(`Vocab item not found: ${vocabItem}`);
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
      .returning()
      .catch((error: unknown) => {
        if (isForeignKeyViolation(error)) {
          throw new NotFoundError("Vocab item not found");
        }
        throw error;
      });

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
      throw new NotFoundError("Vocab item not found");
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
        throw new InvalidInputError(
          "That memory aid does not belong to this glyph",
        );
      }
    }

    await this.deps.database
      .update(schema.vocabItems)
      .set({ defaultMemoryAidId: args.memoryAidId })
      .where(eq(schema.vocabItems.id, args.vocabItemId));

    return { defaultMemoryAidId: args.memoryAidId };
  }

  /**
   * A disabled row still occupies its unique glyph, so a write path must not read
   * it as absent and go off to create it: there is nothing to build a single
   * character from but the dictionary seed, and resolveNewVocabItem throws.
   */
  async getStoredVocabItems(
    vocabList: string[],
  ): Promise<{ vocabItem: string; disabled: boolean }[]> {
    if (vocabList.length === 0) {
      return [];
    }

    return this.deps.database
      .select({
        vocabItem: schema.vocabItems.vocabItem,
        disabled: schema.vocabItems.disabled,
      })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.vocabItem, vocabList));
  }

  /**
   * Resolve every glyph in `vocabList` the dictionary does not already hold,
   * plus everything those glyphs are written with, and return the rows —
   * without writing any of them.
   *
   * Nothing here writes, so the caller can insert the result inside its own
   * transaction and have a later failure discard it. That is also what makes the
   * discarding safe without a "was this ours" filter: a glyph the dictionary
   * already holds is never prepared, so it is never inserted, so a rollback has
   * nothing of it to undo. Another learner's word is not spared by a check — it
   * is out of reach of an operation that never wrote it.
   *
   * One membership query per level of the hierarchy, batched across the whole
   * frontier, rather than one per glyph. Same shape as
   * resolveConstituentClosure, and for the same reason.
   */
  async prepareVocabItems(vocabList: string[]): Promise<PreparedVocabItem[]> {
    const prepared: PreparedVocabItem[] = [];
    // Every glyph that has reached a frontier, which deduplicates within a level
    // as well as across them. Two words sharing a part used to be reconciled by
    // the first one's INSERT being visible to the second one's lookup, and there
    // are no inserts here to see.
    const seen = new Set(vocabList);
    let frontier = Array.from(seen);

    while (frontier.length > 0) {
      const stored = new Set(
        (await this.getStoredVocabItems(frontier)).map((row) => row.vocabItem),
      );

      const next: string[] = [];
      for (const vocabItem of frontier) {
        // Already stored — including as a disabled row, which still owns the glyph.
        if (stored.has(vocabItem)) {
          continue;
        }

        const { row, parts } = await this.resolveNewVocabItem(vocabItem);
        prepared.push(row);

        for (const part of parts) {
          if (!seen.has(part)) {
            seen.add(part);
            next.push(part);
          }
        }
      }

      frontier = next;
    }

    return prepared;
  }

  /**
   * Everything the dictionary needs in order to hold a glyph it has never seen,
   * and the parts that have to be resolved after it.
   *
   * Every call that can fail slowly lives here and nowhere else: DeepL for the
   * gloss, Edge TTS and the S3 upload for the audio. Keeping them out of
   * insertVocabItems is what lets the insert run on a caller's transaction
   * without holding one open across a network round trip.
   */
  private async resolveNewVocabItem(
    vocabItem: string,
  ): Promise<{ row: PreparedVocabItem; parts: string[] }> {
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
      throw new InvalidInputError(
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

    return {
      row: { vocabItem, translation, pinyin, vocabType, audioUrl },
      parts: componentsToAdd,
    };
  }

  /**
   * Write prepared rows on the caller's executor, so that when it is a
   * transaction they live or die with everything else it writes.
   *
   * ON CONFLICT DO NOTHING against the unique glyph is the whole of the
   * concurrency story, and it is deliberately not a retry and not a re-check.
   * Two creates naming the same new word both prepare it, because neither saw
   * the other's row when it looked. The first to reach this statement holds an
   * uncommitted unique-index entry and the second blocks on it rather than
   * failing. If the first commits, the second's insert resolves to DO NOTHING
   * and its later read finds the committed row, so one row exists and both decks
   * point at it. If the first rolls back, the second's insert simply succeeds.
   * Neither outcome needs a second attempt and neither leaves a duplicate.
   *
   * The wait is bounded because this transaction issues no network call, and the
   * read that follows is a separate statement, so READ COMMITTED — the default,
   * which nothing here overrides — gives it a snapshot taken after the other
   * transaction ended. Raising the isolation level would break this: under
   * REPEATABLE READ the same conflict is a serialization failure instead.
   *
   * Deliberately not `.returning()`. That yields only the rows this statement
   * actually inserted, so deck membership built from it would silently drop the
   * word a concurrent create won the race for. Membership is resolved by reading
   * back the glyphs, which finds the row whoever wrote it.
   */
  async insertVocabItems(
    executor: Executor,
    prepared: PreparedVocabItem[],
  ): Promise<void> {
    if (prepared.length === 0) {
      return;
    }

    await executor
      .insert(schema.vocabItems)
      .values(prepared)
      .onConflictDoNothing({ target: schema.vocabItems.vocabItem });
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
    const escapedQuery = escapeLike(args.query.trim());
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
    // Was a bare ceil, so an empty search reported 0 pages while the admin and
    // suggestion lists reported 1 for the same situation.
    const totalPages = pageRange(args.page, args.pageSize, total).totalPages;

    return {
      items: items.map(toVocabItemDto),
      total,
      page: args.page,
      pageSize: args.pageSize,
      totalPages,
    };
  }

  /**
   * Every glyph a deck built from `vocabItems` has to contain: the items
   * themselves plus their parts, their parts' parts, and so on to the
   * components.
   *
   * One query per level of the hierarchy, batched across every item, rather than
   * two per glyph visited — so the cost tracks the depth of the hierarchy, which
   * is four, and not the size of the request.
   *
   * Disabled and absent glyphs drop out because the level query selects neither.
   * Dropping an absent one is a deliberate change: it is a part no learner could
   * be taught, and it is not reported in `skipped`, which names refused requests.
   *
   * Takes an executor because a deck create runs it on the transaction that has
   * just inserted the words it invented. Those rows are not committed yet, so a
   * pooled connection would not see them and the deck would be built without the
   * very glyphs the learner typed.
   */
  async resolveConstituentClosure(
    vocabItems: string[],
    executor: Executor = this.deps.database,
  ): Promise<string[]> {
    const resolved = new Set<string>();
    let frontier = Array.from(new Set(vocabItems));

    while (frontier.length > 0) {
      const rows = await executor
        .select({
          vocabItem: schema.vocabItems.vocabItem,
          vocabType: schema.vocabItems.vocabType,
          decomposition: schema.vocabItems.decomposition,
        })
        .from(schema.vocabItems)
        .where(
          and(
            inArray(schema.vocabItems.vocabItem, frontier),
            eq(schema.vocabItems.disabled, false),
          ),
        );

      const next = new Set<string>();
      for (const row of rows) {
        resolved.add(row.vocabItem);
        for (const part of this.rawParts(row)) {
          next.add(part);
        }
      }

      // The only thing standing between this and an infinite walk. Filtering here
      // rather than as parts are collected is what makes it sufficient on its own:
      // the whole level is resolved by now, so it also drops a glyph that a later
      // sibling in this same level turned out to resolve.
      frontier = Array.from(next).filter((glyph) => !resolved.has(glyph));
    }

    return Array.from(resolved);
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

    return this.removeDisabled(
      this.rawParts({ vocabItem, vocabType, decomposition }),
    );
  }

  /**
   * How a row splits, before anything is dropped for being disabled — the one
   * place that answers it. getVocabItemParts filters the result with a query;
   * resolveConstituentClosure gets the same filtering free from the level query
   * it already ran.
   */
  private rawParts({
    vocabItem,
    vocabType,
    decomposition,
  }: {
    vocabItem: string;
    vocabType: VocabType;
    decomposition?: string | null;
  }): string[] {
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
        return filterDecomposition(decomposition);
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
   * Drops the cached index so the next graph is built from current rows.
   *
   * The TTL exists because the corpus only changes when an admin edits
   * vocabulary — but then it does change, and the admin is the one person
   * looking at the result. Called by AdminService after a write, so a glyph
   * disabled in /admin/vocab is gone from its parent's graph on the next look
   * rather than up to five minutes later.
   */
  invalidateDecompositionIndex(): void {
    this.indexCache = undefined;
  }

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
