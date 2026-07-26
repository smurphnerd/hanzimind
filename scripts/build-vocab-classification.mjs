/**
 * Regenerates src/server/database/seed/vocab-classification.tsv from scratch.
 *
 * The TSV is the source of truth and is meant to be hand-edited — run this only
 * to change the *rules* (the 214 list, or the NOT_TYPED curation below), not to
 * fix an individual glyph. Running it discards any manual edits.
 *
 * Run with:  ./node_modules/.bin/tsx scripts/build-vocab-classification.mjs
 *
 * Rules, per the 214-radical policy:
 *   - A glyph that is NOT usually typed on its own is a `component`.
 *   - ...unless it is absent from the standard 214 (incl. variant forms), in which
 *     case it is more basic than a radical and gets `disabled`.
 *   - Everything else stays `character`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const DATA = join(REPO, "scripts/data");
const SEED = join(REPO, "src/server/database/seed");

// --- the standard 214 (simplified presentation) + variant forms ---------------
const radLines = readFileSync(join(DATA, "radicals-214.txt"), "utf-8")
  .split("\n")
  .filter(Boolean);
/** glyph -> radical number */
const radicalOf = new Map();
for (const line of radLines) {
  const [num, primary, variants] = line.split("|");
  radicalOf.set(primary, +num);
  if (variants) for (const v of variants.split(",")) if (v) radicalOf.set(v, +num);
}

// Variant/bound forms the archchinese page omits, plus the traditional halves of
// the simplified radicals it displays. All are canonical members of the 214 — the
// page just shows one form per row. Keyed to their radical number.
const EXTRA_FORMS = {
  "⺀": 15, "冫": 15, "⺈": 18, "⺊": 25, "⺌": 42, "⺍": 42, "⺗": 61, "⺮": 118,
  "⺳": 122, "⺼": 130, "氺": 85, "耂": 125, "肀": 129, "歺": 78, "㔾": 26,
  "丬": 90, "罓": 122, "襾": 146, "艸": 140, "辵": 162, "訁": 149, "糸": 120,
  "糹": 120, "釒": 167, "金": 167, "镸": 168, "飠": 184, "龴": 28,
  // traditional forms of radicals the page lists in simplified
  "見": 147, "貝": 154, "車": 159, "長": 168, "門": 169, "韋": 178, "頁": 181,
  "風": 182, "飛": 183, "馬": 187, "鹵": 197, "麥": 199, "黃": 201, "黽": 205,
  "齊": 210, "齒": 211, "龍": 212, "龜": 213, "魚": 195, "鳥": 196, "言": 149,
  "靑": 174, "虎": 141, "網": 122,
};
for (const [g, n] of Object.entries(EXTRA_FORMS)) if (!radicalOf.has(g)) radicalOf.set(g, n);

// --- glyphs that are not usually typed on their own ---------------------------
// Curated. A glyph belongs here if a learner would never type it as a word — it
// only ever appears as a graphical part of another character.
const NOT_TYPED = new Set([
  // strokes and frames
  "丨", "丶", "丿", "乀", "乁", "乚", "乛", "亅", "亠", "冂", "冖", "冫",
  "凵", "勹", "匚", "匸", "卩", "㔾", "厶", "夂", "夊", "宀", "尢", "尣", "屮",
  "巛", "巜", "幺", "廴", "廾", "弋", "彐", "彑", "彡", "彳", "丷", "龴",
  // NB: 乙 is deliberately absent — it is radical 5, but also an ordinary typed
  // character (甲乙丙丁, 乙醇, 乙方). Its bound variants 乚 and 乛 are above.
  // bound forms of standalone characters
  "亻", "刂", "忄", "扌", "攵", "攴", "氵", "氺", "灬", "爫", "牜", "犭", "礻",
  "衤", "罒", "罓", "耂", "肀", "艹", "艸", "辶", "辵", "阝", "讠", "訁", "纟",
  "糹", "糸", "钅", "釒", "饣", "飠", "覀", "襾", "镸", "丬", "爿", "毋",
  // CJK Radicals Supplement block — all bound by construction
  "⺀", "⺈", "⺊", "⺌", "⺍", "⺗", "⺮", "⺳", "⺼",
  // radical shapes that are technically characters but effectively never typed
  "禸", "疋", "疒", "癶", "殳", "耒", "舛", "艮", "虍", "豸", "釆", "髟", "鬯",
  "鬲", "黹", "黾", "黽", "龠", "彐", "戈", "隹", "爻", "臼",
  // bound phonetic form, self-identified as such by its own gloss
  "龹",
]);
// Deliberately NOT here, despite being radicals: 尸 (尸体), 卜 (萝卜), 皿 (器皿) —
// all three are ordinary typed words in modern simplified Chinese.

// Components are taught by meaning alone, so a component with no gloss can never
// be quizzed — and an unquizzable part would stall every character built on it.
// makemeahanzi leaves these five blank, so we supply the gloss ourselves,
// naming characters they actually appear in.
const GLOSS_OVERRIDES = {
  "⺈": "knife; the top of 争, 免 and 色",
  "⺊": "divination; the left of 上, 卓 and 占",
  "⺌": "small; the top of 光, 尚 and 当",
  "⺍": "small; the top of 学, 兴 and 觉",
  "氺": "water; the foot of 求, 泰 and 录",
};

// Debatable calls worth a human eye — surfaced in the report, not treated
// differently by the generator.
const DEBATABLE = new Set(["幺", "戈", "臼", "毋", "弋", "隹", "爻", "殳", "艮", "疋"]);

// --- load the dictionary ------------------------------------------------------
const entries = readFileSync(join(SEED, "dictionary.txt"), "utf-8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const codepoint = (c) => c.codePointAt(0);
const componentsOf = (d) =>
  !d
    ? []
    : Array.from(d).filter(
        (c) => c !== "？" && c !== "?" && !(codepoint(c) >= 0x2ff0 && codepoint(c) <= 0x2fff),
      );

const uses = new Map();
for (const e of entries)
  for (const c of componentsOf(e.decomposition))
    if (c !== e.character) uses.set(c, (uses.get(c) || 0) + 1);

// Unstudiable: no gloss to quiz against, or no reading distinct from the glyph.
const noGloss = (e) => !e.definition || !e.pinyin?.length;

// --- classify -----------------------------------------------------------------
const rows = [];
for (const e of entries) {
  const g = e.character;
  const inList = radicalOf.has(g);
  let decision = "character";
  let reason = "";

  if (NOT_TYPED.has(g)) {
    if (inList) {
      decision = "component";
      reason = `radical-${radicalOf.get(g)}`;
    } else {
      decision = "disabled";
      reason = "not-typed-not-a-radical";
    }
  } else if (noGloss(e) && !inList) {
    decision = "disabled";
    reason = "no-gloss";
  }

  if (decision !== "character") {
    rows.push({
      glyph: g,
      cp: "U+" + codepoint(g).toString(16).toUpperCase().padStart(4, "0"),
      decision,
      reason,
      uses: uses.get(g) || 0,
      pinyin: e.pinyin?.[0] ?? "",
      definition: (e.definition ?? "").replace(/\t/g, " "),
      review: DEBATABLE.has(g) ? "review" : "",
      gloss: GLOSS_OVERRIDES[g] ?? "",
    });
  }
}

rows.sort((a, b) =>
  a.decision === b.decision ? b.uses - a.uses : a.decision.localeCompare(b.decision),
);

const header =
  "glyph\tcodepoint\tdecision\treason\tuses\tpinyin\tdefinition\treview\tgloss";
const tsv =
  [
    "# Source of truth for vocab classification. Edit a decision here and re-run the backfill.",
    "# decision: component = a bound radical form, kept and studiable as a component",
    "#           disabled  = too basic to teach, or no gloss to quiz. Hidden everywhere.",
    "# gloss:    overrides the dictionary translation. Required where the dictionary",
    "#           has none, since components are quizzed on meaning alone.",
    "# The pinyin/definition columns are informational — components are stored with",
    "# neither, because a bound form has no reading of its own.",
    "# Anything absent from this file stays vocabType=character.",
    header,
    ...rows.map((r) =>
      [
        r.glyph, r.cp, r.decision, r.reason, r.uses, r.pinyin, r.definition,
        r.review, r.gloss,
      ].join("\t"),
    ),
  ].join("\n") + "\n";

writeFileSync(join(SEED, "vocab-classification.tsv"), tsv);

// --- report -------------------------------------------------------------------
const comps = rows.filter((r) => r.decision === "component");
const dis = rows.filter((r) => r.decision === "disabled");
console.log(`components: ${comps.length}   disabled: ${dis.length}   characters: ${entries.length - rows.length}`);
console.log(`\ndisabled, not-a-radical (${dis.filter((r) => r.reason === "not-typed-not-a-radical").length}):`);
console.log(dis.filter((r) => r.reason === "not-typed-not-a-radical").map((r) => `${r.glyph}(${r.uses})`).join(" "));
console.log(`\ndisabled, no-gloss (${dis.filter((r) => r.reason === "no-gloss").length}):`);
console.log(dis.filter((r) => r.reason === "no-gloss").map((r) => `${r.glyph}(${r.uses})`).join(" "));
console.log(`\nflagged for review: ${rows.filter((r) => r.review).map((r) => `${r.glyph}=${r.decision}`).join(" ")}`);

// A component with no meaning to quiz can never be served, and an unservable
// part would stall every character built on it. Fail loudly rather than emit one.
const glossless = comps.filter((r) => !r.gloss && !r.definition.trim());
if (glossless.length > 0) {
  throw new Error(
    `Components with no gloss (add them to GLOSS_OVERRIDES): ${glossless.map((r) => r.glyph).join(" ")}`,
  );
}

// --- integrity check: what breaks in decompositions? --------------------------
const disabledSet = new Set(dis.map((r) => r.glyph));
let affected = 0;
const worst = [];
for (const e of entries) {
  const parts = componentsOf(e.decomposition);
  const lost = parts.filter((c) => disabledSet.has(c));
  if (lost.length) {
    affected++;
    if (lost.length === parts.length) worst.push(e.character);
  }
}
console.log(`\ncharacters whose decomposition loses a part: ${affected}`);
console.log(`characters that lose their ENTIRE decomposition: ${worst.length} ${worst.slice(0, 40).join(" ")}`);
