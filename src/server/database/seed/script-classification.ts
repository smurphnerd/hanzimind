import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ScriptEnum, type Script } from "@/definitions/definitions";

/**
 * Reads script-classification.tsv — which glyphs belong to the simplified
 * script, which to the traditional script, and (by omission) which are the same
 * in both.
 *
 * The policy it encodes, derived from Unihan's variant relations by
 * scripts/build-script-classification.mjs:
 *   - `simplified`  — the glyph has a distinct traditional counterpart (国 <- 國).
 *   - `traditional` — the glyph has a distinct simplified counterpart  (國 -> 国).
 *   - `both`        — unchanged between the scripts (人, 大, 一). The majority of
 *     the dictionary, so it is absent from the file, which carries only the
 *     exceptions.
 *
 * Anything not listed is `both`, so a glyph the file has never heard of is
 * treated as script-neutral rather than guessed at.
 */
const CLASSIFICATION_PATH = join(
  process.cwd(),
  "src/server/database/seed/script-classification.tsv",
);

export function loadScriptClassification(): Map<string, Script> {
  const contents = readFileSync(CLASSIFICATION_PATH, "utf-8");
  const classification = new Map<string, Script>();

  for (const line of contents.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("glyph\t")) {
      continue;
    }

    const [glyph, , script] = line.split("\t");
    const parsed = ScriptEnum.safeParse(script);
    if (!parsed.success) {
      throw new Error(
        `Unknown script "${script}" for ${glyph} in script-classification.tsv`,
      );
    }
    // `both` is the default for anything absent, so listing one would be a
    // contradiction rather than a redundancy — the generator never emits one.
    if (parsed.data === "both") {
      throw new Error(
        `${glyph} is listed as "both" in script-classification.tsv; ` +
          `omit it instead, since absence already means both`,
      );
    }

    classification.set(glyph, parsed.data);
  }

  return classification;
}

/**
 * Which script a vocab item belongs to.
 *
 * A single glyph is a straight lookup. A compound or sentence takes the script
 * of the characters it is written with, ignoring punctuation and anything else
 * the classification has no opinion on: 汉语 is simplified because 汉 and 语 are,
 * and 工作 is `both` because neither character changes between the scripts.
 *
 * A string mixing simplified-only and traditional-only characters is valid in
 * neither script, so it is not really `both` — but it is a data-entry mistake
 * rather than a state to model, and there are none in the corpus. Reporting the
 * traditional side makes such a row surface in the traditional-only filter,
 * where it is visible, instead of hiding among the 5k neutral rows.
 */
export function classifyScript(
  vocabItem: string,
  classification: ReadonlyMap<string, Script>,
): Script {
  let sawSimplified = false;
  let sawTraditional = false;

  for (const glyph of vocabItem) {
    const script = classification.get(glyph);
    if (script === "simplified") sawSimplified = true;
    else if (script === "traditional") sawTraditional = true;
  }

  if (sawTraditional) return "traditional";
  if (sawSimplified) return "simplified";
  return "both";
}
