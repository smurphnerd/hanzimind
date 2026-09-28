import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads vocab-overrides.tsv: curated pinyin and translation corrections that
 * win over dictionary.txt and the HSK 1 list. See that file's header for why
 * they exist and docs/data-audit.md for how each was found.
 */
export interface VocabOverride {
  /** Empty keeps the upstream reading. */
  pinyin: string;
  /** Empty keeps the upstream translation. */
  translation: string;
  reason: string;
}

const OVERRIDES_PATH = join(
  process.cwd(),
  "src/server/database/seed/vocab-overrides.tsv",
);

export function loadVocabOverrides(): Map<string, VocabOverride> {
  const overrides = new Map<string, VocabOverride>();
  for (const line of readFileSync(OVERRIDES_PATH, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [glyph, pinyin = "", translation = "", reason = ""] =
      line.split("\t");
    if (!glyph || (!pinyin.trim() && !translation.trim())) {
      throw new Error(`vocab-overrides.tsv: empty override line "${line}"`);
    }
    if (overrides.has(glyph)) {
      throw new Error(`vocab-overrides.tsv: ${glyph} is listed twice`);
    }
    overrides.set(glyph, {
      pinyin: pinyin.trim(),
      translation: translation.trim(),
      reason: reason.trim(),
    });
  }
  return overrides;
}

/**
 * Apply an override to a row as the seed would store it, AFTER
 * applyClassification. A reading override never gives a pinyin back to a
 * meaning-only component, whose reading classification deliberately blanked.
 */
export function applyOverride<
  T extends { pinyin: string; translation: string | null },
>(stored: T, override: VocabOverride | undefined): T {
  if (!override) return stored;
  return {
    ...stored,
    pinyin: override.pinyin && stored.pinyin ? override.pinyin : stored.pinyin,
    translation: override.translation || stored.translation,
  };
}
