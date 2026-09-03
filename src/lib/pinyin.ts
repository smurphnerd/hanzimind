/**
 * Pinyin answer matching.
 *
 * Learners type pinyin in several equivalent ways, and none of them should be
 * marked wrong for notation alone:
 *
 *   nǚ · nv3 · nü3 · nu:3 · NV3      (ü as v / ü / u:, tone as mark or digit)
 *   nǐ hǎo · ni3 hao3 · ni3hao3      (spaced or not)
 *
 * Every form is reduced to one canonical string — lowercase letters, `v` for
 * ü, a trailing tone digit per syllable, no spacing — and the comparison
 * happens there. `nǚ` and `nv3` both become `nv3`.
 */

/** Combining tone marks (NFD) → tone number. */
const TONE_MARKS: Record<string, string> = {
  "̄": "1", // macron   ā
  "́": "2", // acute    á
  "̌": "3", // caron    ǎ
  "̀": "4", // grave    à
};

const DIAERESIS = "̈"; // the two dots of ü

/**
 * Letters and tones are collected separately because a tone written as a mark
 * sits on the vowel ("hǎo") while a typed digit sits at the end of the
 * syllable ("hao3"). Keeping them apart — "hao|3" — makes both identical
 * without needing to split syllables.
 */
function split(input: string): { letters: string; tones: string } {
  const decomposed = input
    .normalize("NFD")
    .toLowerCase()
    // "u:" is a common ASCII stand-in for ü.
    .replace(/u:/g, `u${DIAERESIS}`);

  let letters = "";
  let tones = "";

  for (const ch of decomposed) {
    if (ch === DIAERESIS) {
      // ü is written "v" in the canonical form.
      if (letters.endsWith("u")) letters = `${letters.slice(0, -1)}v`;
      continue;
    }

    const marked = TONE_MARKS[ch];
    if (marked) {
      tones += marked;
      continue;
    }

    if (ch >= "1" && ch <= "4") {
      tones += ch;
      continue;
    }

    // The neutral tone is unmarked in our data; "0"/"5" are just notations
    // for it, so they contribute nothing.
    if (ch === "0" || ch === "5") continue;

    // Spacing and syllable-separating apostrophes carry no meaning here.
    if (/\s/.test(ch) || ch === "'" || ch === "’") continue;

    letters += ch;
  }

  return { letters, tones };
}

function canonicalPinyin(input: string): string {
  const { letters, tones } = split(input);
  return tones ? `${letters}|${tones}` : letters;
}

/** Canonical form with tone information removed. */
function canonicalPinyinToneless(input: string): string {
  return split(input).letters;
}

/**
 * True when `answer` is an acceptable rendering of `expected`.
 *
 * With `requireTones: false` a toneless answer ("nv" for "nǚ") is accepted —
 * notation stays flexible either way.
 */
export function pinyinMatches(
  answer: string,
  expected: string,
  options: { requireTones?: boolean } = {},
): boolean {
  const { requireTones = true } = options;

  if (canonicalPinyin(answer) === canonicalPinyin(expected)) return true;

  if (!requireTones) {
    return (
      canonicalPinyinToneless(answer) === canonicalPinyinToneless(expected)
    );
  }

  return false;
}
