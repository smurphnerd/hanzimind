/**
 * Small, dependency-free text utilities for grading meaning answers.
 *
 * Deliberately deterministic: the same answer is always graded the same way,
 * which matters more than cleverness when an SRS decides whether you relearn
 * a word.
 */

/**
 * Damerau-Levenshtein edit distance (optimal string alignment).
 *
 * Counts an adjacent transposition as ONE edit rather than two — swapping two
 * letters ("wonam" for "woman", "teh" for "the") is among the most common
 * typos, and plain Levenshtein would price it out of a one-edit budget.
 *
 * Exits early once `max` is exceeded, so comparing unrelated words is cheap.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  // Two previous rows are needed to look back at a transposition.
  let beforePrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );

      // Adjacent transposition: "ab" ↔ "ba"
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrev[j - 2] + 1);
      }

      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > max) return max + 1;
    beforePrev = prev;
    prev = curr;
  }

  return prev[b.length];
}

/**
 * How many edits to forgive in a word. Short words get no slack — "cat" and
 * "car" are different answers, not a typo.
 */
export function typoTolerance(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

/** True when `a` is `b` or a plausible misspelling of it. */
export function isTypoOf(a: string, b: string): boolean {
  if (a === b) return true;
  const tolerance = Math.min(typoTolerance(a), typoTolerance(b));
  if (tolerance === 0) return false;
  return editDistance(a, b, tolerance) <= tolerance;
}

const IRREGULAR_STEMS: Record<string, string> = {
  children: "child",
  people: "person",
  men: "man",
  women: "woman",
  feet: "foot",
  teeth: "tooth",
  mice: "mouse",
  geese: "goose",
};

/**
 * Crude suffix stripping — enough to make "selling"/"sells"/"sold-ish" forms
 * line up with "sell". A real stemmer (Porter) would be more accurate but
 * needs a dependency, and over-stemming risks collapsing distinct answers.
 */
export function stem(word: string): string {
  const irregular = IRREGULAR_STEMS[word];
  if (irregular) return irregular;

  // Too short to safely strip anything.
  if (word.length <= 3) return word;

  if (word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  if (word.endsWith("ing") && word.length > 5) {
    const base = word.slice(0, -3);
    // "running" → "runn" → "run"
    return doubledConsonant(base) ? base.slice(0, -1) : base;
  }
  if (word.endsWith("ed") && word.length > 4) {
    const base = word.slice(0, -2);
    return doubledConsonant(base) ? base.slice(0, -1) : base;
  }

  return word;
}

function doubledConsonant(word: string): boolean {
  const last = word.at(-1);
  const prev = word.at(-2);
  return (
    last !== undefined &&
    last === prev &&
    !"aeiou".includes(last) &&
    last !== "l" // "call" → "call", not "cal"
  );
}
