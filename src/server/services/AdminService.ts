import "server-only";

import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  AdminVocabItemDto,
  type Script,
  type VocabType,
} from "@/definitions/definitions";
import { InvalidInputError, NotFoundError } from "@/server/endpoints/errors";

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
    script?: Script;
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
    if (args.script) {
      filters.push(eq(schema.vocabItems.script, args.script));
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
          script: schema.vocabItems.script,
          disabled: schema.vocabItems.disabled,
          phonetic: schema.vocabItems.phonetic,
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
   * `pinyin` and `phonetic` are separate fields on purpose. Almost every
   * component stores a reading borrowed from the character it abbreviates (亻
   * holds 人's "rén"), so the presence of one says nothing about whether it
   * should be taught — `phonetic` is the flag `canStudy` and `readingOf` gate on.
   * Toggling it never touches the reading, and editing the reading never
   * implies the flag.
   *
   * Nothing here is a side effect of anything else: a type or hidden toggle
   * leaves both alone, because silently wiping a reading only ever destroyed
   * data the admin then had to retype.
   *
   * The next `backfill-classification.ts` run resets `phonetic` to whatever
   * vocab-classification.tsv says, so an edit here is provisional — record it in
   * the file to make it stick.
   */
  async updateVocabItem(args: {
    id: string;
    vocabType?: VocabType;
    disabled?: boolean;
    translation?: string;
    pinyin?: string;
    phonetic?: boolean;
  }): Promise<AdminVocabItemDto> {
    const existing = await this.deps.database.query.vocabItems.findFirst({
      where: (vocabItems, { eq }) => eq(vocabItems.id, args.id),
    });

    if (!existing) {
      throw new NotFoundError("Vocab item not found");
    }

    const update: {
      vocabType?: VocabType;
      disabled?: boolean;
      translation?: string;
      pinyin?: string;
      phonetic?: boolean;
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
        throw new InvalidInputError(
          `Refusing to clear the definition of ${existing.vocabItem}: every component is quizzed on its meaning`,
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

    if (args.phonetic !== undefined) {
      update.phonetic = args.phonetic;
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
        script: existing.script,
        disabled: existing.disabled,
        phonetic: existing.phonetic,
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
        script: schema.vocabItems.script,
        disabled: schema.vocabItems.disabled,
        phonetic: schema.vocabItems.phonetic,
        decomposition: schema.vocabItems.decomposition,
        radical: schema.vocabItems.radical,
      });

    this.deps.logger.info(
      { vocabItem: existing.vocabItem, update },
      "Admin updated a vocab item",
    );

    return updated;
  }
}
