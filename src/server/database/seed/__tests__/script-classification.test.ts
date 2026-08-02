import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

import {
  classifyScript,
  loadScriptClassification,
} from "../script-classification";

/**
 * These guard the classification data file as much as the loader. The file
 * decides which of ~9.6k rows a script filter hides, so its invariants are
 * asserted against the dictionary it classifies rather than trusted.
 */
describe("loadScriptClassification", () => {
  const classification = loadScriptClassification();

  // Parsed through a schema rather than asserted: the file is external data, and
  // a silently-undefined `character` here would make the dictionary check below
  // vacuously pass.
  const DictionaryEntry = z.object({ character: z.string() });
  const characters = new Set<string>(
    readFileSync(
      join(process.cwd(), "src/server/database/seed/dictionary.txt"),
      "utf-8",
    )
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => DictionaryEntry.parse(JSON.parse(line)).character),
  );

  it("should classify only glyphs that exist in the dictionary", () => {
    const unknown = [...classification.keys()].filter((g) => !characters.has(g));
    expect(unknown).toEqual([]);
  });

  it("should classify single glyphs only", () => {
    const multiCharacter = [...classification.keys()].filter(
      (g) => [...g].length !== 1,
    );
    expect(multiCharacter).toEqual([]);
  });

  /**
   * Absence already means `both`, so a row saying so is a contradiction rather
   * than a redundancy — and one would quietly grow the file by 5k lines.
   */
  it("should carry only the exceptions, never a `both` row", () => {
    const neutral = [...classification].filter(([, s]) => s === "both");
    expect(neutral).toEqual([]);
  });

  it("should classify the glyphs whose script is not in doubt", () => {
    for (const glyph of ["国", "见", "这", "汉", "东", "讠", "纟"]) {
      expect(classification.get(glyph), glyph).toBe("simplified");
    }
    for (const glyph of ["國", "見", "這", "漢", "東", "訁", "糹"]) {
      expect(classification.get(glyph), glyph).toBe("traditional");
    }
    // Unchanged between the scripts, so absent from the file entirely.
    for (const glyph of ["人", "大", "一", "山", "口", "中"]) {
      expect(classification.has(glyph), glyph).toBe(false);
    }
  });

  /**
   * The whole point of the column is telling a pair apart. A glyph and its
   * counterpart landing on the same side would make the filter useless for
   * exactly the rows it exists to separate.
   */
  it("should never put a simplified glyph and its traditional form on the same side", () => {
    const pairs: [string, string][] = [
      ["国", "國"],
      ["见", "見"],
      ["这", "這"],
      ["车", "車"],
      ["马", "馬"],
      ["门", "門"],
      ["讠", "訁"],
      ["钅", "釒"],
      ["纟", "糹"],
      ["饣", "飠"],
    ];

    for (const [simplified, traditional] of pairs) {
      expect(classification.get(simplified), simplified).toBe("simplified");
      expect(classification.get(traditional), traditional).toBe("traditional");
    }
  });
});

describe("classifyScript", () => {
  const classification = loadScriptClassification();

  it("should read a single glyph straight off the classification", () => {
    expect(classifyScript("国", classification)).toBe("simplified");
    expect(classifyScript("國", classification)).toBe("traditional");
    expect(classifyScript("人", classification)).toBe("both");
  });

  it("should take a compound's script from the characters it is written with", () => {
    expect(classifyScript("汉语", classification)).toBe("simplified");
    expect(classifyScript("漢語", classification)).toBe("traditional");
    // Neither character changes between the scripts, so the word does not either.
    expect(classifyScript("工作", classification)).toBe("both");
  });

  it("should ignore punctuation and anything it has no opinion on", () => {
    expect(classifyScript("你好，世界！", classification)).toBe("both");
    expect(classifyScript("我是中国人。", classification)).toBe("simplified");
    expect(classifyScript("", classification)).toBe("both");
    // Latin text and digits carry no script information.
    expect(classifyScript("HSK 1", classification)).toBe("both");
  });

  it("should report a mixed string on the traditional side", () => {
    // Valid in neither script, so not `both`. Reporting the traditional side puts
    // it in front of someone in the traditional filter instead of hiding it among
    // the 5k script-neutral rows.
    expect(classifyScript("国國", classification)).toBe("traditional");
  });

  it("should treat an empty classification as script-neutral", () => {
    expect(classifyScript("国", new Map())).toBe("both");
  });
});
