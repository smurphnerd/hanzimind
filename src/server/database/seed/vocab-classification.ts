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
 * Orthogonal to the decision, a component may be marked `phonetic`: its reading
 * is its own rather than borrowed, and it predicts the reading of the characters
 * it appears in, so it is stored with pinyin and audio and quizzed on those too.
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
   * at all — every component is quizzed on meaning, so one without a meaning
   * could never be served, and an unservable part stalls everything built on it.
   */
  gloss: string;
  /**
   * Whether this component's own reading predicts the reading of the characters
   * it appears in — 艮 gěn gives 很, 跟, 根, 恨. Those keep their pinyin and audio
   * and are served for reading and listening; every other component has its
   * dictionary reading stripped, because it is borrowed from a parent glyph.
   */
  phonetic: boolean;
}

/**
 * How a classified glyph is stored. Both the seed and the backfill go through
 * this so the two can never drift — a fresh seed must land in exactly the state
 * the backfill produces.
 *
 * `phonetic` is the load-bearing output: it is what `canStudy` and `readingOf`
 * gate on, so a stale reading on a row is inert whatever the columns say. The
 * blanking below is belt-and-braces for freshly inserted rows — a bound form has
 * no pronunciation of its own and the dictionary's value for one is borrowed
 * from the full character it abbreviates (亻 gets 人's "rén"), so there is no
 * reason to store it. `pinyin` and `audioUrl` are NOT NULL; `""` is the sentinel.
 */
export function applyClassification(
  entry: VocabClassificationEntry | undefined,
  raw: { pinyin: string; audioUrl: string; translation: string | null },
): {
  pinyin: string;
  audioUrl: string;
  translation: string | null;
  phonetic: boolean;
} {
  if (entry?.decision !== "component") return { ...raw, phonetic: false };

  const translation = entry.gloss || raw.translation;
  if (entry.phonetic) return { ...raw, translation, phonetic: true };

  return { pinyin: "", audioUrl: "", translation, phonetic: false };
}

/** Whether this glyph should never have audio generated for it. */
export function suppressesAudio(
  entry: VocabClassificationEntry | undefined,
): boolean {
  if (entry?.decision === "disabled") return true;

  return entry?.decision === "component" && !entry.phonetic;
}

const CLASSIFICATION_PATH = join(
  process.cwd(),
  "src/server/database/seed/vocab-classification.tsv",
);

export function loadVocabClassification(): Map<
  string,
  VocabClassificationEntry
> {
  const contents = readFileSync(CLASSIFICATION_PATH, "utf-8");
  const classification = new Map<string, VocabClassificationEntry>();

  for (const line of contents.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("glyph\t")) {
      continue;
    }

    const [glyph, , decision, reason, , , , , gloss, phonetic] =
      line.split("\t");
    if (decision !== "component" && decision !== "disabled") {
      throw new Error(
        `Unknown decision "${decision}" for ${glyph} in vocab-classification.tsv`,
      );
    }

    classification.set(glyph, {
      decision,
      reason: reason ?? "",
      gloss: (gloss ?? "").trim(),
      phonetic: (phonetic ?? "").trim() === "phonetic",
    });
  }

  return classification;
}
