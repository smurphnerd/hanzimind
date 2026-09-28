/**
 * Extracts entry blocks from *Reading and Writing Chinese* (McNaughton, Tuttle)
 * and enriches each with its resolved headword glyph and serial number, ready for
 * the human-quality subagent pass that produces `rwc-entries-v2.jsonl`.
 *
 * WHY A PARSER PLUS A SUBAGENT PASS, not one or the other:
 *   The book prints every basic character's headword as an IMAGE (parts 1–1067),
 *   so the glyph cannot be read from the text. But every entry is a `<div>` whose
 *   ALL-CAPS reading and radical number ARE text, and the order matches the older
 *   `rwc-entries.jsonl` extraction, which already carries the resolved glyph. So we
 *   segment structurally here and borrow the glyph by position, then hand clean,
 *   glyph-labelled blocks to subagents to do the one thing regex botched: separate
 *   the etymology explanation (part 11) and the (MN) mnemonic (part 12) from the
 *   definition, cross-references and the compound list.
 *
 * The book is copyrighted, so this writes only under books/ (gitignored). Nothing
 * verbatim is committed.
 *
 * Prerequisites:
 *   - books/Reading and Writing Chinese.epub          (purchased source)
 *   - books/extracted/rwc-entries.jsonl               (prior extraction, for glyph+order)
 *   - scripts/data/radicals-227.txt                   (radical number -> glyph, for checks)
 *
 * Run:  node scripts/extract-rwc.mjs
 * Then run the subagent swarm over books/extracted/rwc-enriched/*.txt per
 * scripts/data/rwc-extraction-contract.md.
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const REPO = process.cwd();
const BOOKS = join(REPO, "books");
const EPUB = join(BOOKS, "Reading and Writing Chinese.epub");
const EXTRACT = join(BOOKS, "extracted");
const PRIOR = join(EXTRACT, "rwc-entries.jsonl");
const IMAGE_GLYPHS = join(REPO, "scripts/data/rwc-image-glyphs.tsv");
const RADICALS = join(REPO, "scripts/data/radicals-227.txt");

// The eight content files, in reading order. Part1* hold the numbered basic
// characters (headword is an image, div class sgc-1); Part2* hold the remaining
// unnumbered characters (headword is real text, div class sgc-2).
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

function unzipEpub() {
  const dir = mkdtempSync(join(tmpdir(), "rwc-"));
  execFileSync("unzip", ["-o", "-q", EPUB, "-d", dir]);
  return dir;
}

/** Strip tags to plain text, marking image headwords so the gap is visible. */
function clean(html) {
  return html
    .replace(/<img[^>]*\/?>/g, " ⟦IMG⟧ ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Split one xhtml file into cleaned entry-block texts (sgc-1 and sgc-2 divs). */
function segment(html) {
  return html
    .split(/<div class="sgc-[12]">/)
    .slice(1)
    .map((d) => clean(d.split("</div>")[0]))
    .filter(Boolean);
}

function readTsvMap(path, keyIndex, valueIndex) {
  const map = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const columns = line.split("\t");
    map.set(Number(columns[keyIndex]), columns[valueIndex] || null);
  }
  return map;
}

function readRadicalMap() {
  const map = new Map();
  for (const line of readFileSync(RADICALS, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [number, glyph] = line.split("|");
    map.set(Number(number), glyph === "��" ? null : glyph);
  }
  return map;
}

function main() {
  const prior = readFileSync(PRIOR, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

  const src = unzipEpub();
  try {
    // Segment every file, keeping file provenance and order.
    const blocks = [];
    for (const f of FILES) {
      const html = readFileSync(
        join(src, "OEBPS", "Text", `${f}.xhtml`),
        "utf8",
      );
      for (const text of segment(html)) blocks.push({ file: f, text });
    }

    // Two glyph sources, because the two halves of the book print the headword
    // differently:
    //   - Part1-series (basic characters): headword is an IMAGE. The audited
    //     table rwc-image-glyphs.tsv wins where it has the serial (the prior
    //     extraction's nulls and misreads); otherwise the serial gives its row in
    //     the prior extraction.
    //   - Part2-series (remaining characters): the first line is normally the real
    //     headword text. Three radicals are images instead; their printed radical
    //     number resolves them through radicals-227.txt. A prose-only note has no
    //     one-codepoint first line and deliberately remains glyph=null.
    const imageGlyphs = readTsvMap(IMAGE_GLYPHS, 0, 1);
    const radicals = readRadicalMap();
    const part1Glyphs = prior.slice(0, 1067);
    if (
      part1Glyphs.length !== 1067 ||
      part1Glyphs.some((e) => !e.char_is_image)
    ) {
      throw new Error(
        "prior extraction's first 1067 rows are not all image-headword basics — " +
          "its shape changed; inspect before trusting the positional glyph map.",
      );
    }

    let serial = 0;
    for (const b of blocks) {
      if (b.file.startsWith("Part2")) {
        const firstLine = b.text.split("\n", 1)[0].trim();
        if (firstLine === "⟦IMG⟧") {
          const number = Number(b.text.match(/Radical \((\d+)\)/i)?.[1]);
          b.glyph = radicals.get(number) ?? null;
        } else {
          b.glyph = Array.from(firstLine).length === 1 ? firstLine : null;
        }
        continue;
      }
      // Part1-series: the block's order gives its serial; the serial gives its glyph.
      const g = part1Glyphs[serial];
      b.serial = ++serial;
      b.glyph = imageGlyphs.get(b.serial) ?? g?.char ?? null;
    }

    if (serial !== 1067) {
      throw new Error(
        `expected 1067 numbered Part 1 blocks, saw ${serial}. ` +
          `The epub changed — inspect before trusting output.`,
      );
    }
    const aligned =
      blocks.filter((b) => b.file.startsWith("Part1")).length +
      blocks.filter((b) => b.file.startsWith("Part2") && b.glyph).length;
    if (blocks.length !== 2344 || aligned !== 2343) {
      throw new Error(
        `expected 2344 blocks with 2343 real entries, got ${blocks.length} and ${aligned}. ` +
          `The epub changed — inspect before trusting output.`,
      );
    }

    // Emit enriched per-file inputs.
    const outDir = join(EXTRACT, "rwc-enriched");
    mkdirSync(outDir, { recursive: true });
    const byFile = new Map(FILES.map((f) => [f, []]));
    for (const b of blocks) byFile.get(b.file).push(b);
    for (const f of FILES) {
      const out = byFile
        .get(f)
        .map((b, k) => {
          const serialPart = b.serial ? ` | serial=${b.serial}` : "";
          const glyphPart = b.glyph ? ` | glyph=${b.glyph}` : " | glyph=?";
          return `━━━ ENTRY ${k + 1}${serialPart}${glyphPart} ━━━\n${b.text}`;
        })
        .join("\n\n");
      writeFileSync(join(outDir, `${f}.txt`), out, "utf8");
    }

    console.log(
      `Segmented ${blocks.length} blocks, aligned ${aligned} to glyphs, ` +
        `assigned ${serial} serials. Wrote ${FILES.length} enriched files to ${outDir}.`,
    );
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
}

main();
