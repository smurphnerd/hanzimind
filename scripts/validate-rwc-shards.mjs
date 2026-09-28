/**
 * Validates the merged RWC extraction against the corrected parser output.
 *
 * Run after merge-rwc-shards.mjs:
 *   node scripts/validate-rwc-shards.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const REPO = process.cwd();
const EXTRACT = join(REPO, "books/extracted");
const OUT = join(EXTRACT, "rwc-entries-v2.jsonl");
const FILES = [
  "Part1",
  "Part1A",
  "Part1B",
  "Part1C",
  "Part1D",
  "Part2",
  "Part2A",
  "Part2B",
];
const KEYS = [
  "serial",
  "glyph",
  "pinyin",
  "definition",
  "radicalName",
  "radicalNumber",
  "hsk",
  "isRadical",
  "explanation",
  "mnemonic",
];

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function enrichedHeaders(file) {
  const text = readFileSync(
    join(EXTRACT, "rwc-enriched", `${file}.txt`),
    "utf8",
  );
  return [...text.matchAll(/━━━ ENTRY \d+([^\n]*)\| glyph=(\S+) ━━━/g)].map(
    (match) => ({
      serial: Number(match[1].match(/serial=(\d+)/)?.[1]) || null,
      glyph: match[2] === "?" ? null : match[2],
    }),
  );
}

function fail(message) {
  throw new Error(message);
}

const rows = readJsonl(OUT);
if (rows.length !== 2343) fail(`expected 2343 entries, got ${rows.length}`);

for (const [index, entry] of rows.entries()) {
  const actualKeys = Object.keys(entry).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...KEYS].sort())) {
    fail(`row ${index + 1}: wrong schema keys`);
  }
  if (!entry.glyph) fail(`row ${index + 1}: missing glyph`);
  if (
    entry.hsk != null &&
    (!Number.isInteger(entry.hsk) || entry.hsk < 1 || entry.hsk > 6)
  ) {
    fail(`row ${index + 1}: invalid HSK level ${entry.hsk}`);
  }
  if (entry.isRadical !== (entry.radicalNumber != null)) {
    fail(`row ${index + 1} (${entry.glyph}): inconsistent radical fields`);
  }
  if (entry.mnemonic && /^\s*\(?MN\)?/i.test(entry.mnemonic)) {
    fail(`row ${index + 1} (${entry.glyph}): mnemonic still has MN prefix`);
  }
}

// Every numbered entry must appear once, in source order.
const part1 = rows.slice(0, 1067);
for (let index = 0; index < part1.length; index += 1) {
  if (part1[index].serial !== index + 1) {
    fail(`Part 1 position ${index + 1}: serial is ${part1[index].serial}`);
  }
}

// The parser's enriched headers are the authoritative glyph order. Part 1 has
// exactly one header per serial. Part 2 excludes the one prose-only glyph=? note.
const expectedPart1 = FILES.filter((file) => file.startsWith("Part1"))
  .flatMap(enrichedHeaders)
  .map((header) => header.glyph);
const expectedPart2 = FILES.filter((file) => file.startsWith("Part2"))
  .flatMap(enrichedHeaders)
  .filter((header) => header.glyph)
  .map((header) => header.glyph);

for (let index = 0; index < expectedPart1.length; index += 1) {
  if (part1[index].glyph !== expectedPart1[index]) {
    fail(
      `Part 1 serial ${index + 1}: expected glyph ${expectedPart1[index]}, got ${part1[index].glyph}`,
    );
  }
}
const part2 = rows.slice(1067);
if (part2.some((entry) => entry.serial != null))
  fail("Part 2 contains a non-null serial");
for (let index = 0; index < expectedPart2.length; index += 1) {
  if (part2[index].glyph !== expectedPart2[index]) {
    fail(
      `Part 2 position ${index + 1}: expected glyph ${expectedPart2[index]}, got ${part2[index].glyph}`,
    );
  }
}

const radicals = rows.filter((entry) => entry.isRadical);
const explanations = rows.filter((entry) => entry.explanation);
const mnemonics = rows.filter((entry) => entry.mnemonic);
if (radicals.length !== 227)
  fail(`expected 227 radicals, got ${radicals.length}`);
if (explanations.length !== 716)
  fail(`expected 716 explanations, got ${explanations.length}`);
if (mnemonics.length !== 98)
  fail(`expected 98 mnemonics, got ${mnemonics.length}`);

// Pin the common radicals whose prose the old extraction incorrectly dropped.
for (const glyph of ["女", "口", "山", "木", "水"]) {
  const entry = rows.find((row) => row.glyph === glyph && row.isRadical);
  if (!entry?.explanation)
    fail(`${glyph}: recovered radical explanation is missing`);
}

// Pin headwords the prior extraction misread as a related glyph, confirmed
// against the headword image. A regression here means rwc-image-glyphs.tsv lost
// its precedence over the prior extraction.
for (const [serial, glyph] of [
  [299, "巳"],
  [432, "各"],
  [642, "苹"],
  [663, "级"],
  [908, "咐"],
]) {
  if (part1[serial - 1].glyph !== glyph)
    fail(`serial ${serial}: expected ${glyph}, got ${part1[serial - 1].glyph}`);
}

console.log(
  `Validated ${rows.length} entries: ${part1.length} numbered + ${part2.length} unnumbered; ` +
    `${radicals.length} radicals, ${explanations.length} explanations, ${mnemonics.length} mnemonics.`,
);
