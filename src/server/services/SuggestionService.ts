import "server-only";

import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Logger } from "pino";

import { pageRange } from "@/lib/pagination";
import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import {
  type AdminSuggestionDto,
  SUGGESTION_RATE_LIMIT,
  type SuggestionCountDto,
  type SuggestionDto,
  type SuggestionKind,
  type SuggestionStatus,
} from "@/definitions/definitions";
import { foreignKeyConstraint, NotFoundError } from "@/server/endpoints/errors";

/** The joined shape the review queue reads, shared so every read path agrees. */
const REVIEW_SELECTION = {
  id: schema.suggestions.id,
  kind: schema.suggestions.kind,
  body: schema.suggestions.body,
  status: schema.suggestions.status,
  vocabItemId: schema.suggestions.vocabItemId,
  memoryAidId: schema.suggestions.memoryAidId,
  adminNote: schema.suggestions.adminNote,
  createdAt: schema.suggestions.createdAt,
  updatedAt: schema.suggestions.updatedAt,
  createdById: schema.suggestions.createdById,
  createdByUsername: schema.users.name,
  createdByEmail: schema.users.email,
  vocabItem: schema.vocabItems.vocabItem,
  vocabType: schema.vocabItems.vocabType,
  translation: schema.vocabItems.translation,
  pinyin: schema.vocabItems.pinyin,
  memoryAid: schema.memoryAids.memoryAid,
  resolvedById: schema.suggestions.resolvedById,
  resolvedAt: schema.suggestions.resolvedAt,
};

/** What `create` gives back — the filer's own row, without the review joins. */
const OWN_SELECTION = {
  id: schema.suggestions.id,
  kind: schema.suggestions.kind,
  body: schema.suggestions.body,
  status: schema.suggestions.status,
  vocabItemId: schema.suggestions.vocabItemId,
  memoryAidId: schema.suggestions.memoryAidId,
  adminNote: schema.suggestions.adminNote,
  createdAt: schema.suggestions.createdAt,
  updatedAt: schema.suggestions.updatedAt,
};

/**
 * Has this user used up their allowance?
 *
 * Split out from the query so the boundary is testable on its own. The count is
 * what they have *already* filed, so being level with the limit means the next
 * one is over it.
 */
export function isOverSuggestionRateLimit(recentCount: number): boolean {
  return recentCount >= SUGGESTION_RATE_LIMIT;
}

/**
 * Learner-reported corrections, and the queue an admin drains them through.
 *
 * The rate limit counts the `suggestions` rows themselves rather than keeping a
 * counter table or an in-memory Map: it needs no second table, it cleans itself
 * up as rows age out of the window, and it survives a redeploy.
 */
export class SuggestionService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
    },
  ) {}

  async create(args: {
    userId: string;
    kind: SuggestionKind;
    body: string;
    vocabItemId?: string | null;
    memoryAidId?: string | null;
  }): Promise<SuggestionDto> {
    const [row] = await this.deps.database
      .insert(schema.suggestions)
      .values({
        createdById: args.userId,
        kind: args.kind,
        body: args.body,
        vocabItemId: args.vocabItemId ?? null,
        memoryAidId: args.memoryAidId ?? null,
      })
      .returning(OWN_SELECTION)
      .catch((error: unknown) => {
        const constraint = foreignKeyConstraint(error);
        if (constraint?.includes("memory_aid")) {
          throw new NotFoundError("Memory aid not found");
        }
        if (constraint?.includes("vocab_item")) {
          throw new NotFoundError("Vocab item not found");
        }
        throw error;
      });

    if (!row) {
      throw new Error("Failed to record the suggestion");
    }

    this.deps.logger.info(
      { suggestionId: row.id, kind: row.kind, userId: args.userId },
      "Learner filed a suggestion",
    );

    return row;
  }

  /** How many this user filed inside the window — the rate limiter's only input. */
  async countRecentForUser(userId: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);

    const rows = await this.deps.database
      .select({ count: count() })
      .from(schema.suggestions)
      .where(
        and(
          eq(schema.suggestions.createdById, userId),
          gt(schema.suggestions.createdAt, since),
        ),
      );

    return rows[0]?.count ?? 0;
  }

  /** Newest first, because a review queue is worked from the top. */
  async list(args: {
    status?: SuggestionStatus;
    page: number;
    pageSize: number;
  }): Promise<{
    items: AdminSuggestionDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (args.page - 1) * args.pageSize;
    const where = args.status
      ? eq(schema.suggestions.status, args.status)
      : undefined;

    const [items, total] = await Promise.all([
      this.reviewQuery()
        .where(where)
        .orderBy(desc(schema.suggestions.createdAt))
        .limit(args.pageSize)
        .offset(offset),
      this.deps.database
        .select({ count: count() })
        .from(schema.suggestions)
        .where(where)
        .then((result) => result[0]?.count ?? 0),
    ]);

    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize,
      totalPages: pageRange(args.page, args.pageSize, total).totalPages,
    };
  }

  /** How many sit in each bucket, so the queue can show what it is filtering. */
  async counts(): Promise<SuggestionCountDto[]> {
    return await this.deps.database
      .select({ status: schema.suggestions.status, count: count() })
      .from(schema.suggestions)
      .groupBy(schema.suggestions.status);
  }

  /**
   * Closes a suggestion out, or reopens it.
   *
   * Reopening clears the reviewer stamp: leaving "resolved by X at Y" on a row
   * that is open again would read as a decision that still stands.
   */
  async setStatus(args: {
    id: string;
    status: SuggestionStatus;
    adminNote?: string | null;
    reviewerId: string;
  }): Promise<AdminSuggestionDto> {
    const isOpen = args.status === "open";

    const update: {
      status: SuggestionStatus;
      resolvedById: string | null;
      resolvedAt: Date | null;
      adminNote?: string | null;
    } = {
      status: args.status,
      resolvedById: isOpen ? null : args.reviewerId,
      resolvedAt: isOpen ? null : new Date(),
    };

    if (args.adminNote !== undefined) {
      update.adminNote = args.adminNote?.trim() || null;
    }

    const [updated] = await this.deps.database
      .update(schema.suggestions)
      .set(update)
      .where(eq(schema.suggestions.id, args.id))
      .returning({ id: schema.suggestions.id });

    if (!updated) {
      throw new NotFoundError("Suggestion not found");
    }

    this.deps.logger.info(
      {
        suggestionId: args.id,
        status: args.status,
        reviewerId: args.reviewerId,
      },
      "Admin reviewed a suggestion",
    );

    const [refreshed] = await this.reviewQuery().where(
      eq(schema.suggestions.id, args.id),
    );

    if (!refreshed) {
      throw new NotFoundError("Suggestion not found");
    }

    return refreshed;
  }

  /**
   * The joined read, minus its filters.
   *
   * `createdById` is NOT NULL against a table nothing deletes from, so the inner
   * join can never hide a suggestion — it only keeps the filer's name
   * non-nullable. The two targets are genuinely optional, hence left joins.
   */
  private reviewQuery() {
    return this.deps.database
      .select(REVIEW_SELECTION)
      .from(schema.suggestions)
      .innerJoin(
        schema.users,
        eq(schema.suggestions.createdById, schema.users.id),
      )
      .leftJoin(
        schema.vocabItems,
        eq(schema.suggestions.vocabItemId, schema.vocabItems.id),
      )
      .leftJoin(
        schema.memoryAids,
        eq(schema.suggestions.memoryAidId, schema.memoryAids.id),
      );
  }
}
