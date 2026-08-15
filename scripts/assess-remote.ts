/**
 * READ-ONLY assessment of whatever database DATABASE_URL points at.
 *
 * Compares the live schema against src/server/database/schema.ts and reports
 * row counts and data-quality gaps. It issues SELECTs only — no DDL, no writes,
 * no seeding. Safe to run against production.
 *
 * Run with:  doppler run --project hanzimind --config prod -- \
 *              ./node_modules/.bin/tsx scripts/assess-remote.ts
 */
import pg from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import { isTable } from "drizzle-orm";

import { schema } from "@/server/database/schema";

function redact(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.username ? "***:***@" : ""}${url.host}${url.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

async function main() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const s3Raw = process.env["S3_OPTIONS"];
  const s3 = s3Raw ? (JSON.parse(s3Raw) as Record<string, unknown>) : null;

  console.log(`\nTarget: ${redact(connectionString)}`);
  console.log(`NODE_ENV: ${process.env["NODE_ENV"] ?? "(unset)"}\n`);

  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 15_000,
    ...(/@(localhost|127\.0\.0\.1)/.test(connectionString)
      ? {}
      : /[?&]sslmode=/.test(connectionString)
        ? {}
        : { ssl: { rejectUnauthorized: true } }),
  });

  // ---- What the code expects -------------------------------------------
  // Drizzle is configured with casing: "snake_case", so a column declared as
  // `userId` is `user_id` in the database. getTableConfig reports the declared
  // name, so convert before comparing or every table looks like it has drifted.
  const toSnakeCase = (name: string) =>
    name
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .toLowerCase();

  const expected = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!isTable(value)) continue;
    const config = getTableConfig(value);
    expected.set(
      config.name,
      new Set(config.columns.map((column) => toSnakeCase(column.name))),
    );
  }

  // ---- What the database actually has ----------------------------------
  const { rows: liveColumns } = await pool.query<{
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );

  const live = new Map<string, Set<string>>();
  for (const row of liveColumns) {
    const columns = live.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    live.set(row.table_name, columns);
  }

  console.log("── SCHEMA ─────────────────────────────────────────────");
  let drift = 0;

  for (const [table, columns] of [...expected].sort()) {
    const liveCols = live.get(table);
    if (!liveCols) {
      drift++;
      console.log(`  MISSING TABLE   ${table}`);
      continue;
    }
    const missing = [...columns].filter((c) => !liveCols.has(c));
    const extra = [...liveCols].filter((c) => !columns.has(c));
    if (missing.length === 0 && extra.length === 0) {
      console.log(`  ok              ${table}`);
    } else {
      drift++;
      console.log(`  DRIFT           ${table}`);
      if (missing.length)
        console.log(
          `                    missing columns: ${missing.join(", ")}`,
        );
      if (extra.length)
        console.log(`                    extra columns:   ${extra.join(", ")}`);
    }
  }

  const unexpected = [...live.keys()].filter(
    (t) => !expected.has(t) && !t.startsWith("__drizzle"),
  );
  if (unexpected.length) {
    console.log(`  (tables in DB not in schema: ${unexpected.join(", ")})`);
  }

  // ---- Data ------------------------------------------------------------
  console.log("\n── DATA ───────────────────────────────────────────────");
  const countable = [...expected.keys()].filter((t) => live.has(t)).sort();
  for (const table of countable) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    console.log(`  ${String(rows[0]?.count ?? 0).padStart(7)}  ${table}`);
  }

  if (live.has("vocab_items")) {
    const { rows } = await pool.query<Record<string, number>>(
      `SELECT count(*)::int                                                        AS total,
              count(*) FILTER (WHERE coalesce(audio_url,'') <> '')::int            AS with_audio,
              count(*) FILTER (WHERE coalesce(pinyin,'') <> '')::int               AS with_pinyin,
              count(*) FILTER (WHERE coalesce(translation,'') <> '')::int          AS with_definition,
              count(*) FILTER (WHERE strokes IS NOT NULL)::int                     AS with_strokes,
              count(*) FILTER (WHERE audio_url LIKE '%localhost%')::int            AS localhost_audio
         FROM vocab_items`,
    );
    const stats = rows[0];
    if (stats) {
      console.log("\n── VOCAB QUALITY ──────────────────────────────────────");
      console.log(`  total             ${stats["total"]}`);
      console.log(`  with audio        ${stats["with_audio"]}`);
      console.log(`  with pinyin       ${stats["with_pinyin"]}`);
      console.log(`  with definition   ${stats["with_definition"]}`);
      console.log(`  with strokes      ${stats["with_strokes"]}`);
      console.log(
        `  localhost audio   ${stats["localhost_audio"]}${Number(stats["localhost_audio"]) > 0 ? "   <-- unreachable for clients" : ""}`,
      );

      const { rows: sample } = await pool.query<{ audio_url: string }>(
        `SELECT audio_url FROM vocab_items WHERE coalesce(audio_url,'') <> '' LIMIT 1`,
      );
      if (sample[0]) {
        try {
          const url = new URL(sample[0].audio_url);
          console.log(`  audio host        ${url.host}`);
        } catch {
          console.log(`  audio host        (unparseable)`);
        }
      }
    }
  }

  if (s3) {
    console.log("\n── S3 CONFIG (non-secret fields) ──────────────────────");
    console.log(
      `  endpoint          ${String(s3["endpoint"] ?? "(default AWS)")}`,
    );
    console.log(`  region            ${String(s3["region"] ?? "(unset)")}`);
    console.log(`  bucket            ${String(s3["bucketName"] ?? "(unset)")}`);
    console.log(`  forcePathStyle    ${String(s3["forcePathStyle"] ?? false)}`);
    console.log(
      `  publicUrl         ${String(s3["cloudfrontDistributionUrl"] ?? "(none — falls back to endpoint/bucket)")}`,
    );
    console.log(
      `  credentials       ${s3["credentials"] ? "present" : "MISSING"}`,
    );
  }

  console.log(
    `\n${drift === 0 ? "Schema matches the code." : `${drift} table(s) differ from the code.`}\n`,
  );

  await pool.end();
}

await main();
