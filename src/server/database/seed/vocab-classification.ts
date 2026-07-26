import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads vocab-classification.tsv — the reviewable source of truth for which
 * dictionary glyphs are bound radical forms (`component`) and which are hidden
 * entirely (`disabled`).
 *
 * The policy it encodes:
 *   - A glyph that a learner would never type as a word on its own is a
 *     `component` — 亻, 氵, ⺮, 糹.
 *   - ...unless it is absent from the standard 214 radicals, in which case it is
 *     more basic than a radical and therefore too basic to teach: `disabled`.
 *   - Glyphs with no gloss or no reading are also `disabled` — there is nothing
 *     to quiz against, so they can never produce an answerable card.
 *   - Everything else is a `character` and is absent from the file.
 *
 * Anything not listed is a character, so the file only carries the exceptions.
 */
export type VocabClassificationDecision = "component" | "disabled";

export interface VocabClassificationEntry {
  decision: VocabClassificationDecision;
  /** `radical-<n>` for components, `no-gloss` / `not-typed-not-a-radical` for disabled. */
  reason: string;
  /**
   * Overrides the dictionary translation. Set where the dictionary has no gloss
   * at all — a component is quizzed on meaning alone, so one without a meaning
   * could never be served, and an unservable part stalls everything built on it.
   */
  gloss: string;
}

/**
 * How a classified glyph is stored. Both the seed and the backfill go through
 * this so the two can never drift — a fresh seed must land in exactly the state
 * the backfill produces.
 *
 * Components carry no reading and no audio: a bound form has no pronunciation of
 * its own, and the dictionary's value for one is borrowed from its parent (亻
 * gets 人's "rén"), which is worse than nothing. `pinyin` and `audioUrl` are NOT
 * NULL, so the empty string is the no-reading sentinel.
 */
export function applyClassification(
  entry: VocabClassificationEntry | undefined,
  raw: { pinyin: string; audioUrl: string; translation: string | null },
): { pinyin: string; audioUrl: string; translation: string | null } {
  if (entry?.decision !== "component") return raw;

  return {
    pinyin: "",
    audioUrl: "",
    translation: entry.gloss || raw.translation,
  };
}

/** Whether this glyph should never have audio generated for it. */
export function suppressesAudio(
  entry: VocabClassificationEntry | undefined,
): boolean {
  return entry?.decision === "component" || entry?.decision === "disabled";
}

const CLASSIFICATION_PATH = join(
  process.cwd(),
  "src/server/database/seed/vocab-classification.tsv",
);

export function loadVocabClassification(): Map<string, VocabClassificationEntry> {
  const contents = readFileSync(CLASSIFICATION_PATH, "utf-8");
  const classification = new Map<string, VocabClassificationEntry>();

  for (const line of contents.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("glyph\t")) {
      continue;
    }

    const [glyph, , decision, reason, , , , , gloss] = line.split("\t");
    if (decision !== "component" && decision !== "disabled") {
      throw new Error(
        `Unknown decision "${decision}" for ${glyph} in vocab-classification.tsv`,
      );
    }

    classification.set(glyph, {
      decision,
      reason: reason ?? "",
      gloss: (gloss ?? "").trim(),
    });
  }

  return classification;
}
