import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { applyOverride, loadVocabOverrides } from "../vocab-overrides";
import { pinyinMatches } from "@/lib/pinyin";

const override = (pinyin: string, translation: string) => ({
  pinyin,
  translation,
  reason: "test",
});

describe("applyOverride", () => {
  it("should keep the upstream value for an empty field", () => {
    const stored = applyOverride(
      { pinyin: "né", translation: "wool; particle" },
      override("ne", ""),
    );
    expect(stored).toEqual({ pinyin: "ne", translation: "wool; particle" });
  });

  it("should never give a reading back to a meaning-only component", () => {
    const stored = applyOverride(
      { pinyin: "", translation: "hook" },
      override("gōu", ""),
    );
    expect(stored.pinyin).toBe("");
  });

  it("should replace the translation when one is given", () => {
    const stored = applyOverride(
      { pinyin: "lǐ", translation: "village; lane" },
      override("", "inside; in"),
    );
    expect(stored.translation).toBe("inside; in");
  });
});

describe("vocab-overrides.tsv", () => {
  const overrides = loadVocabOverrides();
  const seed = join(process.cwd(), "src/server/database/seed");
  const known = new Set([
    ...readFileSync(join(seed, "dictionary.txt"), "utf-8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => (JSON.parse(line) as { character: string }).character),
    ...readFileSync(
      join(process.cwd(), "scripts/data/hsk1-vocabulary.txt"),
      "utf-8",
    )
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.split("|")[0]),
  ]);

  it("should only name glyphs the seeds create", () => {
    const unknown = [...overrides.keys()].filter((glyph) => !known.has(glyph));
    expect(unknown).toEqual([]);
  });

  // A translation is the writing card's prompt, so a character in it can hand
  // the learner the answer.
  it("should keep Chinese characters out of every translation", () => {
    const withHanzi = [...overrides]
      .filter(([, o]) => /[\u2e80-\u2fdf\u3400-\u9fff]/u.test(o.translation))
      .map(([glyph]) => glyph);
    expect(withHanzi).toEqual([]);
  });

  it("should leave no 'surname' answer on a surname-reason row", () => {
    const leftover = [...overrides]
      .filter(
        ([, o]) => o.reason === "surname" && /\bsurname\b/i.test(o.translation),
      )
      .map(([glyph]) => glyph);
    expect(leftover).toEqual([]);
  });

  // The readings that were rejecting the standard answer before this file.
  it.each([
    ["哪儿", "nar3"],
    ["一点儿", "yi4dian3r"],
    ["多少", "duo1shao"],
    ["呢", "ne"],
    ["谁", "shei2"],
    ["子", "zi3"],
  ])("should accept the standard answer for %s", (glyph, answer) => {
    expect(pinyinMatches(answer, overrides.get(glyph)!.pinyin)).toBe(true);
  });
});
