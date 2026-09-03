/**
 * Imports memory aids extracted from two purchased books into `memory_aids`,
 * attaching each to the matching `vocab_items` row by glyph:
 *
 *   - Remembering Simplified Hanzi (Heisig & Richardson)  -> keyword + story
 *   - Reading and Writing Chinese (McNaughton)            -> (MN) mnemonic / note
 *
 * Provenance is encoded by author, not a schema column: every RSH aid is owned
 * by the `system-rsh-import` user and every RWC aid by `system-rwc-import`, so
 * the pair (vocabItemId, createdById) is unique and makes the run idempotent —
 * a second run inserts nothing.
 *
 * The book text is copyrighted, so every aid is inserted with `public = false`
 * and stays unserved until an admin reviews and rewrites it. `defaultMemoryAidId`
 * is set to the RSH aid when present, otherwise the RWC aid, and ONLY when the
 * glyph has no default yet — an admin's existing choice is never clobbered.
 *
 * Reads DATABASE_URL straight from the environment (no env.ts validation, so it
 * needs no S3/auth secrets). Run against the Neon dev database via:
 *
 *   doppler run --config prod_test -- \
 *     ./node_modules/.bin/tsx scripts/backfill-book-memory-aids.ts --dry-run
 *
 * Drop --dry-run to write.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { pino } from "pino";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";

const dryRun = process.argv.includes("--dry-run");
const EXTRACT_DIR = join(process.cwd(), "books", "extracted");
const CHUNK = 1000;

const RSH_USER = {
  id: "system-rsh-import",
  name: "RSH Import (Remembering Simplified Hanzi)",
  email: "rsh-import@system.local",
} as const;
const RWC_USER = {
  id: "system-rwc-import",
  name: "RWC Import (Reading and Writing Chinese)",
  email: "rwc-import@system.local",
} as const;

type RshFrame = {
  frame: number;
  keyword: string | null;
  char: string | null;
  story: string | null;
  primitive: string | null;
};
type RwcEntry = {
  char: string | null;
  mnemonic: string | null;
  explanation: string | null;
};

const readJsonl = <T>(file: string): T[] =>
  readFileSync(join(EXTRACT_DIR, file), "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);

/** RSH aid body: keyword, then the story and/or the primitive note. */
function rshBody(f: RshFrame): string | null {
  if (!f.keyword) return null;
  const parts: string[] = [];
  if (f.story) parts.push(f.story);
  if (f.primitive) parts.push(`As a primitive element: ${f.primitive}`);
  if (parts.length === 0) return null; // keyword alone is not a mnemonic
  return `${f.keyword}\n\n${parts.join("\n\n")}`;
}

async function main() {
  const logger = pino({ transport: { target: "pino-pretty" } });
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  logger.info(
    { host: url.replace(/.*@([^/?]+).*/, "$1"), dryRun },
    "Connecting",
  );
  const db = getDatabase(logger, url);

  // Best content per glyph from each book.
  const rsh = new Map<string, string>();
  for (const f of readJsonl<RshFrame>("rsh-frames.jsonl")) {
    if (!f.char) continue;
    const body = rshBody(f);
    if (body && !rsh.has(f.char)) rsh.set(f.char, body);
  }
  const rwc = new Map<string, string>();
  for (const e of readJsonl<RwcEntry>("rwc-entries.jsonl")) {
    if (!e.char) continue;
    const body = e.mnemonic || e.explanation || null;
    if (body && !rwc.has(e.char)) rwc.set(e.char, body);
  }
  logger.info(
    { rsh: rsh.size, rwc: rwc.size },
    "Loaded book aids with content",
  );

  // Corpus: glyph -> { id, defaultMemoryAidId }.
  const rows = await db
    .select({
      id: schema.vocabItems.id,
      glyph: schema.vocabItems.vocabItem,
      def: schema.vocabItems.defaultMemoryAidId,
    })
    .from(schema.vocabItems);
  logger.info({ vocabItems: rows.length }, "Fetched corpus");
  if (rows.length === 0)
    throw new Error(
      "vocab_items is empty — push the schema and seed the dictionary first",
    );
  const byGlyph = new Map(rows.map((r) => [r.glyph, r]));

  // Existing import-owned aids, for idempotency: `${vocabItemId}:${userId}` -> aidId.
  const existing = await db
    .select({
      id: schema.memoryAids.id,
      vocabItemId: schema.memoryAids.vocabItemId,
      createdById: schema.memoryAids.createdById,
    })
    .from(schema.memoryAids)
    .where(inArray(schema.memoryAids.createdById, [RSH_USER.id, RWC_USER.id]));
  const existingAid = new Map(
    existing.map((a) => [`${a.vocabItemId}:${a.createdById}`, a.id]),
  );

  // Plan inserts + default assignments.
  type AidRow = {
    id: string;
    memoryAid: string;
    vocabItemId: string;
    createdById: string;
    public: boolean;
  };
  const inserts: AidRow[] = [];
  const setDefault: { vocabItemId: string; aidId: string }[] = [];
  let skippedExisting = 0;
  let noVocab = 0;
  let defaultAlreadySet = 0;

  const plan = (glyph: string, body: string, userId: string): string | null => {
    const v = byGlyph.get(glyph);
    if (!v) {
      noVocab++;
      return null;
    }
    const key = `${v.id}:${userId}`;
    const already = existingAid.get(key);
    if (already) {
      skippedExisting++;
      return already;
    }
    const id = crypto.randomUUID();
    inserts.push({
      id,
      memoryAid: body,
      vocabItemId: v.id,
      createdById: userId,
      public: false,
    });
    existingAid.set(key, id);
    return id;
  };

  const glyphs = new Set([...rsh.keys(), ...rwc.keys()]);
  for (const glyph of glyphs) {
    const v = byGlyph.get(glyph);
    const rshBodyText = rsh.get(glyph);
    const rwcBodyText = rwc.get(glyph);
    const rshId = rshBodyText ? plan(glyph, rshBodyText, RSH_USER.id) : null;
    const rwcId = rwcBodyText ? plan(glyph, rwcBodyText, RWC_USER.id) : null;
    if (!v) continue;
    const preferred = rshId ?? rwcId;
    if (preferred) {
      if (v.def) defaultAlreadySet++;
      else setDefault.push({ vocabItemId: v.id, aidId: preferred });
    }
  }

  logger.info(
    {
      toInsert: inserts.length,
      rshInserts: inserts.filter((i) => i.createdById === RSH_USER.id).length,
      rwcInserts: inserts.filter((i) => i.createdById === RWC_USER.id).length,
      skippedExisting,
      defaultsToSet: setDefault.length,
      defaultAlreadySet,
      glyphsWithoutVocabItem: noVocab,
    },
    dryRun ? "DRY RUN — no writes" : "Writing",
  );

  if (dryRun) {
    const sample = inserts.slice(0, 3);
    for (const s of sample)
      logger.info(
        { user: s.createdById, preview: s.memoryAid.slice(0, 90) },
        "sample aid",
      );
    return;
  }

  // Ensure the two import authors exist.
  await db
    .insert(schema.users)
    .values([
      { ...RSH_USER, emailVerified: true },
      { ...RWC_USER, emailVerified: true },
    ])
    .onConflictDoNothing();

  for (let i = 0; i < inserts.length; i += CHUNK)
    await db.insert(schema.memoryAids).values(inserts.slice(i, i + CHUNK));
  logger.info({ inserted: inserts.length }, "Inserted memory aids");

  let defaultsSet = 0;
  for (const { vocabItemId, aidId } of setDefault) {
    const r = await db
      .update(schema.vocabItems)
      .set({ defaultMemoryAidId: aidId })
      .where(
        and(
          eq(schema.vocabItems.id, vocabItemId),
          isNull(schema.vocabItems.defaultMemoryAidId),
        ),
      );
    defaultsSet += r.rowCount ?? 0;
  }
  logger.info({ defaultsSet }, "Set default memory aids");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
