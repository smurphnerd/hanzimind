/**
 * Merges the subagent-produced RWC shards into
 * books/extracted/rwc-entries-v2.jsonl.
 *
 * The final corpus contains 2,343 real entries:
 *   - all 1,067 numbered Part 1 entries
 *   - 1,276 unnumbered Part 2 entries
 *
 * One Part2B div is explanatory prose about the dictionary's 227th "leftover"
 * category, not a character entry, and is excluded. Seventeen genuine entries
 * initially skipped by workers are supplied in rwc-repairs/missing.jsonl.
 *
 * Run: node scripts/merge-rwc-shards.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const REPO = process.cwd();
const EXTRACT = join(REPO, "books/extracted");
const SHARDS = join(EXTRACT, "rwc-shards");
const REPAIRS = join(EXTRACT, "rwc-repairs/missing.jsonl");
const OUT = join(EXTRACT, "rwc-entries-v2.jsonl");
const IMAGE_GLYPHS = join(REPO, "scripts/data/rwc-image-glyphs.tsv");
const PRIOR = join(EXTRACT, "rwc-entries.jsonl");

const PART1 = ["Part1", "Part1A", "Part1B", "Part1C", "Part1D"];
const PART2 = ["Part2", "Part2A", "Part2B"];

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function loadImageGlyphs() {
  const map = new Map();
  for (const line of readFileSync(IMAGE_GLYPHS, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [serial, glyph] = line.split("\t");
    map.set(Number(serial), glyph || null);
  }
  return map;
}

function expectedGlyphs(file) {
  const text = readFileSync(
    join(EXTRACT, "rwc-enriched", `${file}.txt`),
    "utf8",
  );
  return [...text.matchAll(/━━━ ENTRY \d+[^\n]*\| glyph=(\S+) ━━━/g)]
    .map((match) => match[1])
    .filter((glyph) => glyph !== "?");
}

/**
 * Rebuild an unnumbered Part 2 shard in source order. A worker may have omitted
 * one of the image-only radicals; repairs supply those rows. Null worker glyphs
 * are safely filled from the corrected, parser-generated header at the same
 * position. Any other mismatch fails closed.
 */
function alignPart2(file, shard, repairsByGlyph) {
  const expected = expectedGlyphs(file);
  const result = [];
  let cursor = 0;

  for (const glyph of expected) {
    const entry = shard[cursor];
    if (entry && (entry.glyph === glyph || entry.glyph == null)) {
      if (entry.glyph == null) entry.glyph = glyph;
      result.push(entry);
      cursor += 1;
      continue;
    }
    const repair = repairsByGlyph.get(glyph);
    if (repair) {
      result.push(repair);
      repairsByGlyph.delete(glyph);
      continue;
    }
    throw new Error(
      `${file}: expected glyph ${glyph} at output position ${result.length + 1}, ` +
        `got ${entry?.glyph ?? "end of shard"}`,
    );
  }

  if (cursor !== shard.length) {
    throw new Error(
      `${file}: ${shard.length - cursor} unconsumed shard entries`,
    );
  }
  return result;
}

function main() {
  const required = [
    ...PART1.map((file) => join(SHARDS, `${file}.jsonl`)),
    ...PART2.map((file) => join(SHARDS, `${file}.jsonl`)),
    REPAIRS,
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length)
    throw new Error(`missing inputs:\n  ${missing.join("\n  ")}`);

  const repairs = readJsonl(REPAIRS);
  if (repairs.length !== 17)
    throw new Error(`expected 17 repairs, got ${repairs.length}`);
  const serialRepairs = repairs.filter((entry) => entry.serial != null);
  const part2Repairs = repairs.filter((entry) => entry.serial == null);
  if (serialRepairs.length !== 15 || part2Repairs.length !== 2) {
    throw new Error(
      `expected 15 Part 1 and 2 Part 2 repairs, got ${serialRepairs.length} and ${part2Repairs.length}`,
    );
  }

  const imageGlyphs = loadImageGlyphs();
  const priorGlyphs = readJsonl(PRIOR)
    .slice(0, 1067)
    .map((entry) => entry.char);
  const numbered = PART1.flatMap((file) =>
    readJsonl(join(SHARDS, `${file}.jsonl`)),
  ).concat(serialRepairs);

  const bySerial = new Map();
  for (const entry of numbered) {
    if (entry.serial == null) throw new Error("Part 1 entry has null serial");
    if (bySerial.has(entry.serial))
      throw new Error(`duplicate Part 1 serial ${entry.serial}`);
    // Glyph identity is structural, not a subagent judgment: the audited
    // image-resolution table first (the prior extraction's nulls and
    // misreads), then serial -> prior extraction.
    entry.glyph =
      imageGlyphs.get(entry.serial) ?? priorGlyphs[entry.serial - 1] ?? null;
    if (!entry.glyph)
      throw new Error(`Part 1 serial ${entry.serial} has no resolved glyph`);
    bySerial.set(entry.serial, entry);
  }

  const part1 = [];
  for (let serial = 1; serial <= 1067; serial += 1) {
    const entry = bySerial.get(serial);
    if (!entry) throw new Error(`missing Part 1 serial ${serial}`);
    part1.push(entry);
  }

  const repairsByGlyph = new Map(
    part2Repairs.map((entry) => [entry.glyph, entry]),
  );
  const part2 = PART2.flatMap((file) =>
    alignPart2(file, readJsonl(join(SHARDS, `${file}.jsonl`)), repairsByGlyph),
  );
  if (repairsByGlyph.size) {
    throw new Error(
      `unused Part 2 repairs: ${[...repairsByGlyph.keys()].join(", ")}`,
    );
  }

  const out = [...part1, ...part2];
  if (out.length !== 2343)
    throw new Error(`expected 2343 entries, got ${out.length}`);

  writeFileSync(
    OUT,
    `${out.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  const radicals = out.filter((entry) => entry.isRadical).length;
  const explanations = out.filter((entry) => entry.explanation).length;
  const mnemonics = out.filter((entry) => entry.mnemonic).length;
  const nullGlyphs = out.filter((entry) => entry.glyph == null).length;
  console.log(
    `Merged ${out.length} entries -> ${OUT}\n` +
      `  Part 1: ${part1.length} | Part 2: ${part2.length}\n` +
      `  radicals: ${radicals} | explanations: ${explanations} | ` +
      `mnemonics: ${mnemonics} | null glyphs: ${nullGlyphs}`,
  );
}

main();
