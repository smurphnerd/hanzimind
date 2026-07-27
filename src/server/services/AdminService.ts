import "server-only";

import { and, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { AdminVocabItemDto, type VocabType } from "@/definitions/definitions";

/**
 * Reads and writes the vocabulary classification for the admin screen.
 *
 * Deliberately separate from VocabService: every read there hides disabled rows,
 * which is exactly the invariant an admin needs to break in order to see and
 * un-hide them. Keeping the two apart means the learner-facing filter can never
 * be loosened by accident to serve an admin feature.
 */
export class AdminService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
    },
  ) {}

  /** How many items sit in each bucket, disabled ones included. */
  async getVocabCounts(): Promise<
    { vocabType: VocabType; disabled: boolean; count: number }[]
  > {
    const rows = await this.deps.database
      .select({
        vocabType: schema.vocabItems.vocabType,
        disabled: schema.vocabItems.disabled,
        count: count(),
      })
      .from(schema.vocabItems)
      .groupBy(schema.vocabItems.vocabType, schema.vocabItems.disabled);

    return rows.map((row) => ({
      vocabType: row.vocabType,
      disabled: row.disabled,
      count: row.count,
    }));
  }

  /**
   * Paginated vocabulary, unfiltered by `disabled` — see the class comment.
   * `search` matches the glyph, its reading, or its definition.
   */
  async listVocabItems(args: {
    page: number;
    pageSize: number;
    vocabType?: VocabType;
    disabled?: boolean;
    search?: string;
  }): Promise<{
    items: AdminVocabItemDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (args.page - 1) * args.pageSize;

    const filters = [];
    if (args.vocabType) {
      filters.push(eq(schema.vocabItems.vocabType, args.vocabType));
    }
    if (args.disabled !== undefined) {
      filters.push(eq(schema.vocabItems.disabled, args.disabled));
    }

    const search = args.search?.trim();
    if (search) {
      // Neutralise LIKE wildcards so a query of "%" matches literally rather
      // than every row. Backslash is Postgres's default escape, so it goes first.
      const pattern = `%${search
        .replace(/\\/g, "\\\\")
        .replace(/[%_]/g, (char) => `\\${char}`)}%`;

      filters.push(
        or(
          ilike(schema.vocabItems.vocabItem, pattern),
          ilike(schema.vocabItems.pinyin, pattern),
          ilike(schema.vocabItems.translation, pattern),
        ),
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [items, total] = await Promise.all([
      this.deps.database
        .select({
          id: schema.vocabItems.id,
          vocabItem: schema.vocabItems.vocabItem,
          translation: schema.vocabItems.translation,
          pinyin: schema.vocabItems.pinyin,
          vocabType: schema.vocabItems.vocabType,
          disabled: schema.vocabItems.disabled,
          decomposition: schema.vocabItems.decomposition,
          radical: schema.vocabItems.radical,
        })
        .from(schema.vocabItems)
        .where(where)
        // Shortest first, then by glyph, so the ordering is stable across pages.
        .orderBy(
          sql`length(${schema.vocabItems.vocabItem}) asc`,
          schema.vocabItems.vocabItem,
        )
        .limit(args.pageSize)
        .offset(offset),
      this.deps.database
        .select({ count: count() })
        .from(schema.vocabItems)
        .where(where)
        .then((result) => result[0]?.count ?? 0),
    ]);

    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize,
      totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
    };
  }

  /**
   * Applies an admin's edit.
   *
   * The reading is edited explicitly and is never touched as a side effect of a
   * type or hidden toggle. A component is meaning-only, but that is enforced
   * where cards are served — canStudy gates on the type, and readingOf blanks a
   * component's reading regardless of what is stored (see study-rules) — so a
   * stored pinyin on a component is harmless, and silently wiping it on a toggle
   * only destroyed data the admin then had to retype to undo the mistake.
   */
  async updateVocabItem(args: {
    id: string;
    vocabType?: VocabType;
    disabled?: boolean;
    translation?: string;
    pinyin?: string;
  }): Promise<AdminVocabItemDto> {
    const existing = await this.deps.database.query.vocabItems.findFirst({
      where: (vocabItems, { eq }) => eq(vocabItems.id, args.id),
    });

    if (!existing) {
      throw new Error(`Vocab item not found: ${args.id}`);
    }

    const update: {
      vocabType?: VocabType;
      disabled?: boolean;
      translation?: string;
      pinyin?: string;
    } = {};

    if (args.disabled !== undefined) {
      // Only the flag. Deck membership and study progress are left alone so the
      // decision stays reversible — every read path already hides the row, and
      // deleting a learner's progress on a toggle would not be recoverable.
      update.disabled = args.disabled;
    }

    if (args.translation !== undefined) {
      const translation = args.translation.trim();
      if (translation.length === 0) {
        throw new Error(
          `Refusing to clear the definition of ${existing.vocabItem}: it is the only thing a component can be quizzed on`,
        );
      }
      update.translation = translation;
    }

    if (args.pinyin !== undefined) {
      // An empty reading is legitimate — a bound form or a glyph with no
      // romanisation has none, and the study rules already read "" as "no
      // reading cards", so this does not need the definition's non-empty guard.
      update.pinyin = args.pinyin.trim();
    }

    if (args.vocabType && args.vocabType !== existing.vocabType) {
      update.vocabType = args.vocabType;
    }

    if (Object.keys(update).length === 0) {
      // Narrowed deliberately: `existing` is the whole row, and the stroke JSONB
      // on it is large enough that returning it would dwarf the response.
      return {
        id: existing.id,
        vocabItem: existing.vocabItem,
        translation: existing.translation,
        pinyin: existing.pinyin,
        vocabType: existing.vocabType,
        disabled: existing.disabled,
        decomposition: existing.decomposition,
        radical: existing.radical,
      };
    }

    const [updated] = await this.deps.database
      .update(schema.vocabItems)
      .set(update)
      .where(eq(schema.vocabItems.id, args.id))
      .returning({
        id: schema.vocabItems.id,
        vocabItem: schema.vocabItems.vocabItem,
        translation: schema.vocabItems.translation,
        pinyin: schema.vocabItems.pinyin,
        vocabType: schema.vocabItems.vocabType,
        disabled: schema.vocabItems.disabled,
        decomposition: schema.vocabItems.decomposition,
        radical: schema.vocabItems.radical,
      });

    this.deps.logger.info(
      { vocabItem: existing.vocabItem, update },
      "Admin updated a vocab item",
    );

    return updated;
  }

  /** Bulk reclassification, for fixing a batch of glyphs in one go. */
  async setVocabType(args: {
    ids: string[];
    vocabType: VocabType;
  }): Promise<number> {
    if (args.ids.length === 0) return 0;

    const rows = await this.deps.database
      .select({
        id: schema.vocabItems.id,
        vocabItem: schema.vocabItems.vocabItem,
        vocabType: schema.vocabItems.vocabType,
      })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.id, args.ids));

    let updated = 0;
    for (const row of rows) {
      if (row.vocabType === args.vocabType) continue;
      await this.updateVocabItem({ id: row.id, vocabType: args.vocabType });
      updated++;
    }

    return updated;
  }
}
