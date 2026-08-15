/**
 * Regenerates src/server/database/seed/script-classification.tsv from scratch.
 *
 * Decides, for every glyph in the dictionary, whether it belongs to the
 * simplified script, the traditional script, or both.
 *
 * The evidence is Unihan's kSimplifiedVariant / kTraditionalVariant fields
 * (vendored as scripts/data/unihan-variants.txt):
 *
 *   - a glyph with a DISTINCT simplified variant is a traditional form  (國 -> 国)
 *   - a glyph with a DISTINCT traditional variant is a simplified form  (国 <- 國)
 *   - a glyph with neither is unchanged between the scripts             (人, 大, 一)
 *
 * "Distinct" is what carries the rule. Unihan also lists a glyph as its own
 * variant to signal that it is used in that script as well, but that signal is
 * unreliable for this purpose: 这 lists itself under kTraditionalVariant beside
 * 這, which would make the flagship simplified glyph count as traditional. Self
 * references are therefore ignored, and the handful of glyphs that end up with
 * distinct variants in BOTH directions are resolved by hand in OVERRIDES.
 *
 * Run with:  node scripts/build-script-classification.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const DATA = join(REPO, "scripts/data");
const SEED = join(REPO, "src/server/database/seed");

// --- Unihan variant relations -------------------------------------------------
/** glyph -> distinct simplified forms of it */
const simplifiedOf = new Map();
/** glyph -> distinct traditional forms of it */
const traditionalOf = new Map();

const fromCodepoint = (token) =>
  String.fromCodePoint(parseInt(token.replace(/<.*$/, "").slice(2), 16));

for (const line of readFileSync(
  join(DATA, "unihan-variants.txt"),
  "utf-8",
).split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;

  const [codepoint, field, rest] = line.split("\t");
  const target =
    field === "kSimplifiedVariant"
      ? simplifiedOf
      : field === "kTraditionalVariant"
        ? traditionalOf
        : null;
  if (!target || !rest) continue;

  const glyph = fromCodepoint(codepoint);
  // Self references are dropped here, once, so every consumer below sees only
  // genuine cross-script relations.
  const variants = rest
    .trim()
    .split(/\s+/)
    .map(fromCodepoint)
    .filter((v) => v !== glyph);
  if (variants.length > 0) target.set(glyph, variants);
}

// Glyphs with distinct variants in both directions: they sit in the middle of a
// merge chain, so the relations alone cannot say which script they belong to.
const OVERRIDES = {
  // 苧 (ramie) simplifies to 苎; its kTraditionalVariant 薴 is a different word
  // (limonene) that merged into the same glyph. Traditional side.
  苧: "traditional",
  // 蒙 is a standard glyph in both scripts. 懞/濛/矇 are separate traditional
  // words that all collapsed onto it in simplified, which is what puts a
  // distinct variant on both sides.
  蒙: "both",
};

/** @returns {"simplified" | "traditional" | "both"} */
function classify(glyph) {
  if (OVERRIDES[glyph]) return OVERRIDES[glyph];

  const hasSimplified = simplifiedOf.has(glyph);
  const hasTraditional = traditionalOf.has(glyph);
  if (hasSimplified && hasTraditional) {
    throw new Error(
      `${glyph} (U+${glyph.codePointAt(0).toString(16).toUpperCase()}) has distinct ` +
        `variants in both directions (simplified: ${simplifiedOf.get(glyph).join("")}, ` +
        `traditional: ${traditionalOf.get(glyph).join("")}). Add it to OVERRIDES.`,
    );
  }
  if (hasSimplified) return "traditional";
  if (hasTraditional) return "simplified";
  return "both";
}

// --- self-check ---------------------------------------------------------------
// Cheap guard against a malformed vendored file or an inverted rule: these are
// unambiguous, and getting one wrong means the whole 9.6k-row backfill is wrong.
const EXPECTED = {
  simplified: [
    "国",
    "见",
    "这",
    "汉",
    "语",
    "书",
    "东",
    "车",
    "马",
    "门",
    "讠",
    "钅",
    "纟",
    "饣",
  ],
  traditional: [
    "國",
    "見",
    "這",
    "漢",
    "語",
    "書",
    "東",
    "車",
    "馬",
    "門",
    "訁",
    "釒",
    "糹",
    "飠",
  ],
  both: [
    "人",
    "大",
    "一",
    "山",
    "水",
    "火",
    "口",
    "手",
    "日",
    "月",
    "工",
    "中",
  ],
};
const failures = [];
for (const [expected, glyphs] of Object.entries(EXPECTED)) {
  for (const glyph of glyphs) {
    const actual = classify(glyph);
    if (actual !== expected)
      failures.push(`${glyph}: expected ${expected}, got ${actual}`);
  }
}
if (failures.length > 0) {
  console.error(
    "self-check FAILED:\n" + failures.map((f) => "  " + f).join("\n"),
  );
  process.exit(1);
}
console.log(
  `self-check passed (${Object.values(EXPECTED).flat().length} glyphs)`,
);

// --- classify the dictionary --------------------------------------------------
const entries = readFileSync(join(SEED, "dictionary.txt"), "utf-8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const rows = [];
const counts = { simplified: 0, traditional: 0, both: 0 };
for (const entry of entries) {
  const glyph = entry.character;
  const script = classify(glyph);
  counts[script]++;
  // `both` is the majority and the safe default, so the file carries only the
  // exceptions — the same convention as vocab-classification.tsv.
  if (script === "both") continue;

  rows.push({
    glyph,
    cp: "U+" + glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
    script,
    counterpart: (script === "traditional" ? simplifiedOf : traditionalOf)
      .get(glyph)
      .join(""),
    override: OVERRIDES[glyph] ? "override" : "",
  });
}

rows.sort((a, b) =>
  a.script === b.script
    ? a.cp.localeCompare(b.cp)
    : a.script.localeCompare(b.script),
);

const preamble = [
  "# Source of truth for which script a glyph belongs to.",
  "# script: simplified  = has a distinct traditional counterpart (国 <- 國)",
  "#         traditional = has a distinct simplified counterpart  (國 -> 国)",
  "# Anything absent from this file is `both` — unchanged between the scripts (人, 大, 一),",
  "# which is the majority of the dictionary.",
  "#",
  "# counterpart is informational: the opposite-script form(s) Unihan records.",
  "# Generated by scripts/build-script-classification.mjs — do not hand-edit; add an",
  "# OVERRIDE there instead so a regeneration keeps the decision.",
  "glyph\tcodepoint\tscript\tcounterpart\toverride",
].join("\n");

writeFileSync(
  join(SEED, "script-classification.tsv"),
  preamble +
    "\n" +
    rows
      .map((r) =>
        [r.glyph, r.cp, r.script, r.counterpart, r.override].join("\t"),
      )
      .join("\n") +
    "\n",
);

console.log(
  `dictionary: ${entries.length} glyphs -> ` +
    `simplified ${counts.simplified}, traditional ${counts.traditional}, both ${counts.both}`,
);
console.log(`wrote ${rows.length} exception rows to script-classification.tsv`);
