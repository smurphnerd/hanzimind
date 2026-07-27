import "server-only";

import { and, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import type { TranslatorService } from "@/server/services/TranslatorService";
import type { TTSService } from "@/server/services/TTSService";
import {
  AdminVocabItemDto,
  type VocabType,
  VocabTypeEnum,
} from "@/definitions/definitions";

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
      translator: TranslatorService;
      tts: TTSService;
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
   * Changing the type carries the reading with it, because "a component has no
   * pronunciation" is an invariant of the data, not just of the UI — a stored
   * reading would still surface through pinyin search. Going to `component`
   * clears it; coming back regenerates it.
   */
  async updateVocabItem(args: {
    id: string;
    vocabType?: VocabType;
    disabled?: boolean;
    translation?: string;
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
      audioUrl?: string;
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

    if (args.vocabType && args.vocabType !== existing.vocabType) {
      update.vocabType = args.vocabType;

      if (args.vocabType === VocabTypeEnum.enum.component) {
        update.pinyin = "";
        update.audioUrl = "";
      } else if (existing.vocabType === VocabTypeEnum.enum.component) {
        const restored = await this.restoreReading(existing.vocabItem);
        update.pinyin = restored.pinyin;
        update.audioUrl = restored.audioUrl;
      }
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

  /**
   * Rebuilds the reading of an item promoted out of `component`.
   *
   * The stored values were blanked when it became a component, so they cannot be
   * recovered from the row. pinyin-pro derives the reading from the glyph, and
   * TTS regenerates the audio; a glyph with no romanisation comes back as
   * itself, which the study rules already treat as "no reading".
   */
  private async restoreReading(
    vocabItem: string,
  ): Promise<{ pinyin: string; audioUrl: string }> {
    const pinyin = this.deps.translator.getPinyin(vocabItem);

    if (!pinyin || pinyin === vocabItem) {
      this.deps.logger.warn(
        { vocabItem },
        "No reading available when restoring from component; leaving it blank",
      );
      return { pinyin: "", audioUrl: "" };
    }

    try {
      return { pinyin, audioUrl: await this.deps.tts.getVocabAudio(vocabItem) };
    } catch (error) {
      // The reading is still worth keeping without audio — it only costs the
      // item its listening cards, and regenerate-audio.ts can fill the gap.
      this.deps.logger.warn(
        { error, vocabItem },
        "Failed to regenerate audio when restoring from component",
      );
      return { pinyin, audioUrl: "" };
    }
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
