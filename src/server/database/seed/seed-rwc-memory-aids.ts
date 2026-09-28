import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";

import type { Drizzle } from "../database";
import { schema } from "../schema";

/**
 * Memory aids adapted from *Reading and Writing Chinese* (William McNaughton,
 * Tuttle), one per glyph, in rwc-memory-aids.jsonl beside this file.
 *
 * The file holds our own wording, not the book's. The book is copyrighted, so
 * its etymology notes and (MN) mnemonics were restated fresh — facts and images
 * kept, sentences not — which is also what makes them read as app copy rather
 * than as book prose full of serial numbers and page references. Each aid is
 * public and carries RWC_SOURCE as its credit line. The verbatim extraction
 * stays under books/ (gitignored); see scripts/extract-rwc.mjs.
 */
export const RWC_SOURCE =
  "Adapted from Reading and Writing Chinese by William McNaughton (Tuttle)";

/**
 * Every imported aid is owned by this user. The id is what makes the import
 * idempotent: (vocabItemId, createdById) identifies the RWC aid for a glyph, so
 * a re-run updates it in place, and a learner who pinned it keeps their pin.
 * It has no credential account, so nobody can sign in as it.
 */
export const RWC_AUTHOR = {
  id: "system-rwc-import",
  name: "HanziMind",
  email: "rwc-import@system.local",
} as const;

export function loadRwcMemoryAids(): Map<string, string> {
  const path = join(
    process.cwd(),
    "src/server/database/seed/rwc-memory-aids.jsonl",
  );
  const aids = new Map<string, string>();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const { glyph, memoryAid } = JSON.parse(line) as {
      glyph: string;
      memoryAid: string;
    };
    if (aids.has(glyph))
      throw new Error(`duplicate RWC memory aid for ${glyph}`);
    aids.set(glyph, memoryAid);
  }
  return aids;
}

export type RwcImportItem = {
  id: string;
  vocabItem: string;
  defaultMemoryAidId: string | null;
};

export type RwcImportExistingAid = {
  id: string;
  vocabItemId: string;
  memoryAid: string;
  source: string | null;
  public: boolean;
};

export type RwcImportPlan = {
  inserts: { id: string; vocabItemId: string; memoryAid: string }[];
  updates: { id: string; memoryAid: string }[];
  /** RWC aids for glyphs the file no longer has an aid for. */
  deletes: string[];
  /** vocabItemId -> the RWC aid to star. */
  setDefaults: Map<string, string>;
  /** vocabItemIds whose default is private and that have no RWC aid to take over. */
  clearDefaults: string[];
};

/**
 * Decide what the import writes, without touching the database.
 *
 * `items` are the enabled vocab rows; a glyph with an aid but no row is simply
 * not imported. `privateAidIds` holds whichever current defaults are private.
 *
 * The default rule: an RWC aid becomes a glyph's starred default only when the
 * glyph has none, or when its default is private. A public default was chosen
 * by an admin or is another source's curated pick, and is never replaced. A
 * private default is never served (StudyService only falls back to a public
 * one), so it is replaced when there is an RWC aid and cleared when there is
 * not — the setDefaultMemoryAid invariant is that a default is public.
 */
export function planRwcImport(args: {
  aids: Map<string, string>;
  items: RwcImportItem[];
  existing: RwcImportExistingAid[];
  privateAidIds: Set<string>;
  newId?: () => string;
}): RwcImportPlan {
  const newId = args.newId ?? (() => crypto.randomUUID());
  const existingByItem = new Map<string, RwcImportExistingAid>();
  const deletes: string[] = [];
  for (const aid of args.existing) {
    // At most one RWC aid per glyph; any extra is a leftover to remove.
    if (existingByItem.has(aid.vocabItemId)) deletes.push(aid.id);
    else existingByItem.set(aid.vocabItemId, aid);
  }

  const plan: RwcImportPlan = {
    inserts: [],
    updates: [],
    deletes,
    setDefaults: new Map(),
    clearDefaults: [],
  };

  const covered = new Set<string>();
  for (const item of args.items) {
    const text = args.aids.get(item.vocabItem);
    let aidId: string | null = null;
    if (text !== undefined) {
      covered.add(item.id);
      const current = existingByItem.get(item.id);
      if (current) {
        aidId = current.id;
        if (
          current.memoryAid !== text ||
          current.source !== RWC_SOURCE ||
          !current.public
        ) {
          plan.updates.push({ id: current.id, memoryAid: text });
        }
      } else {
        aidId = newId();
        plan.inserts.push({ id: aidId, vocabItemId: item.id, memoryAid: text });
      }
    }

    const defaultIsPrivate =
      item.defaultMemoryAidId !== null &&
      args.privateAidIds.has(item.defaultMemoryAidId);
    if (aidId && (item.defaultMemoryAidId === null || defaultIsPrivate)) {
      if (item.defaultMemoryAidId !== aidId)
        plan.setDefaults.set(item.id, aidId);
    } else if (defaultIsPrivate) {
      plan.clearDefaults.push(item.id);
    }
  }

  for (const [vocabItemId, aid] of existingByItem) {
    if (!covered.has(vocabItemId)) plan.deletes.push(aid.id);
  }
  return plan;
}

/** Postgres caps a statement at 65535 bound parameters; stay well clear. */
const BATCH = 1000;

function* chunks<T>(values: T[]): Generator<T[]> {
  for (let i = 0; i < values.length; i += BATCH)
    yield values.slice(i, i + BATCH);
}

/**
 * Bring the database's RWC memory aids in line with rwc-memory-aids.jsonl.
 * Idempotent: a second run plans nothing. Writes happen in one transaction.
 */
export async function importRwcMemoryAids(
  database: Drizzle,
  logger: Logger,
  options: { dryRun?: boolean } = {},
): Promise<RwcImportPlan> {
  const aids = loadRwcMemoryAids();

  const items: RwcImportItem[] = [];
  for (const glyphs of chunks([...aids.keys()])) {
    items.push(
      ...(await database
        .select({
          id: schema.vocabItems.id,
          vocabItem: schema.vocabItems.vocabItem,
          defaultMemoryAidId: schema.vocabItems.defaultMemoryAidId,
          disabled: schema.vocabItems.disabled,
        })
        .from(schema.vocabItems)
        .where(inArray(schema.vocabItems.vocabItem, glyphs))
        .then((rows) => rows.filter((row) => !row.disabled))),
    );
  }

  const existing = await database
    .select({
      id: schema.memoryAids.id,
      vocabItemId: schema.memoryAids.vocabItemId,
      memoryAid: schema.memoryAids.memoryAid,
      source: schema.memoryAids.source,
      public: schema.memoryAids.public,
    })
    .from(schema.memoryAids)
    .where(eq(schema.memoryAids.createdById, RWC_AUTHOR.id))
    .orderBy(schema.memoryAids.createdAt);

  // Every private aid that is currently somebody's default, corpus-wide: a
  // private default on a glyph with no RWC aid is cleared too.
  const privateDefaults = await database
    .select({
      vocabItemId: schema.vocabItems.id,
      vocabItem: schema.vocabItems.vocabItem,
      defaultMemoryAidId: schema.vocabItems.defaultMemoryAidId,
      disabled: schema.vocabItems.disabled,
    })
    .from(schema.vocabItems)
    .innerJoin(
      schema.memoryAids,
      eq(schema.memoryAids.id, schema.vocabItems.defaultMemoryAidId),
    )
    .where(eq(schema.memoryAids.public, false));
  const privateAidIds = new Set(
    privateDefaults.map((row) => row.defaultMemoryAidId!),
  );
  const planned = new Set(items.map((item) => item.id));
  for (const row of privateDefaults) {
    if (planned.has(row.vocabItemId)) continue;
    items.push({
      id: row.vocabItemId,
      vocabItem: row.vocabItem,
      defaultMemoryAidId: row.defaultMemoryAidId,
    });
  }

  const plan = planRwcImport({ aids, items, existing, privateAidIds });
  logger.info(
    {
      aidsInFile: aids.size,
      matchedGlyphs: items.filter((item) => aids.has(item.vocabItem)).length,
      inserts: plan.inserts.length,
      updates: plan.updates.length,
      deletes: plan.deletes.length,
      setDefaults: plan.setDefaults.size,
      clearDefaults: plan.clearDefaults.length,
      dryRun: Boolean(options.dryRun),
    },
    "RWC memory aid import plan",
  );
  if (options.dryRun) return plan;

  await database.transaction(async (tx) => {
    await tx
      .insert(schema.users)
      .values({ ...RWC_AUTHOR, emailVerified: true })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { name: RWC_AUTHOR.name },
      });

    for (const batch of chunks(plan.deletes)) {
      // Release everything that points at a stale aid before deleting it, the
      // same references account deletion releases.
      await tx
        .update(schema.vocabItems)
        .set({ defaultMemoryAidId: null })
        .where(inArray(schema.vocabItems.defaultMemoryAidId, batch));
      await tx
        .update(schema.userVocabItems)
        .set({ memoryAidId: null })
        .where(inArray(schema.userVocabItems.memoryAidId, batch));
      await tx
        .update(schema.suggestions)
        .set({ memoryAidId: null })
        .where(inArray(schema.suggestions.memoryAidId, batch));
      await tx
        .delete(schema.memoryAids)
        .where(inArray(schema.memoryAids.id, batch));
    }

    for (const batch of chunks(plan.inserts)) {
      await tx.insert(schema.memoryAids).values(
        batch.map((aid) => ({
          ...aid,
          createdById: RWC_AUTHOR.id,
          source: RWC_SOURCE,
          public: true,
        })),
      );
    }

    for (const aid of plan.updates) {
      await tx
        .update(schema.memoryAids)
        .set({ memoryAid: aid.memoryAid, source: RWC_SOURCE, public: true })
        .where(eq(schema.memoryAids.id, aid.id));
    }

    for (const [vocabItemId, aidId] of plan.setDefaults) {
      await tx
        .update(schema.vocabItems)
        .set({ defaultMemoryAidId: aidId })
        .where(eq(schema.vocabItems.id, vocabItemId));
    }

    for (const batch of chunks(plan.clearDefaults)) {
      await tx
        .update(schema.vocabItems)
        .set({ defaultMemoryAidId: null })
        .where(inArray(schema.vocabItems.id, batch));
    }
  });

  return plan;
}
