import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  applyClassification,
  loadVocabClassification,
  suppressesAudio,
} from "../vocab-classification";
import { filterDecomposition } from "@/lib/decomposition";

/**
 * These guard the classification data file as much as the loader. A bad edit to
 * vocab-classification.tsv silently hides real characters from the whole app, so
 * the invariants are asserted against the dictionary it classifies.
 */
describe("loadVocabClassification", () => {
  const classification = loadVocabClassification();

  interface DictionaryEntry {
    character: string;
    definition?: string;
    pinyin?: string[];
    decomposition?: string;
  }

  const entries: DictionaryEntry[] = readFileSync(
    join(process.cwd(), "src/server/database/seed/dictionary.txt"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as DictionaryEntry);
  const dictionary = new Map(entries.map((e) => [e.character, e]));

  const glyphsWith = (decision: "component" | "disabled") =>
    [...classification]
      .filter(([, entry]) => entry.decision === decision)
      .map(([glyph]) => glyph);

  it("should parse every row into a known decision", () => {
    for (const [glyph, entry] of classification) {
      expect(
        ["component", "disabled"],
        `${glyph} has decision "${entry.decision}"`,
      ).toContain(entry.decision);
    }
  });

  it("should classify only glyphs that exist in the dictionary", () => {
    const unknown = [...classification.keys()].filter(
      (g) => !dictionary.has(g),
    );
    expect(unknown).toEqual([]);
  });

  it("should classify single glyphs only", () => {
    const multiCharacter = [...classification.keys()].filter(
      (g) => Array.from(g).length !== 1,
    );
    expect(multiCharacter).toEqual([]);
  });

  it("should attribute every component to a radical or the bound-form escape hatch", () => {
    const unattributed = glyphsWith("component").filter(
      (g) =>
        !/^radical-\d+$/.test(classification.get(g)!.reason) &&
        classification.get(g)!.reason !== "bound-non-radical",
    );
    expect(unattributed).toEqual([]);
  });

  /**
   * The escape hatch exists for bound forms outside the standard 214 that still
   * carry a teachable gloss. It is pinned to an exact list because the rule it
   * bypasses — "not a radical means too basic to teach" — is what keeps genuine
   * sub-radical fragments out of the study pool. Widening it should be a
   * deliberate edit here, not a side effect of one to the generator.
   */
  it("should keep the bound-form escape hatch to an explicit list", () => {
    const bound = glyphsWith("component").filter(
      (g) => classification.get(g)!.reason === "bound-non-radical",
    );
    expect(bound.sort()).toEqual(["㐆", "㐌", "丄", "丩", "龹"].sort());
  });

  it("should only cite radicals within the standard 214", () => {
    const outOfRange = glyphsWith("component")
      .filter((g) => classification.get(g)!.reason.startsWith("radical-"))
      .filter((g) => {
        const number = Number(classification.get(g)!.reason.split("-")[1]);
        return number < 1 || number > 214;
      });
    expect(outOfRange).toEqual([]);
  });

  it("should give every disabled glyph a reason", () => {
    const unexplained = glyphsWith("disabled").filter(
      (g) => classification.get(g)!.reason.length === 0,
    );
    expect(unexplained).toEqual([]);
  });

  it("should keep the bound radical forms as components", () => {
    // The everyday bound forms. If any of these stops being a component the
    // hierarchy has lost its floor.
    for (const glyph of [
      "亻",
      "氵",
      "扌",
      "忄",
      "艹",
      "讠",
      "辶",
      "刂",
      "纟",
    ]) {
      expect(classification.get(glyph)?.decision, glyph).toBe("component");
    }
  });

  it("should leave standalone characters unclassified", () => {
    // Each is a radical whose primary form is an ordinary typed word, so it must
    // stay a character: 人 person, 水 water, 手 hand, 尸体 corpse, 萝卜 radish,
    // 器皿 vessel, 王 king, 食 food.
    for (const glyph of [
      "人",
      "水",
      "手",
      "心",
      "尸",
      "卜",
      "皿",
      "王",
      "食",
    ]) {
      expect(classification.has(glyph), glyph).toBe(false);
    }
  });

  it("should not disable a glyph that any character depends on entirely", () => {
    // Disabled parts are hidden from decompositions, so a character must never
    // lose every part it has — that would render an empty breakdown.
    const disabled = new Set(glyphsWith("disabled"));
    const stripped = entries.filter((entry) => {
      const parts = filterDecomposition(entry.decomposition);
      return parts.length > 0 && parts.every((part) => disabled.has(part));
    });
    expect(stripped.map((e) => e.character)).toEqual([]);
  });

  it("should give every component a meaning to be quizzed on", () => {
    // Every component is quizzed on meaning, so one with no gloss could never be
    // served — and an unservable part stalls everything built on it.
    const glossless = glyphsWith("component").filter((glyph) => {
      const fromDictionary = dictionary.get(glyph)?.definition?.trim();
      return !classification.get(glyph)!.gloss && !fromDictionary;
    });
    expect(glossless).toEqual([]);
  });

  /**
   * The phonetics are derived, not hand-picked — see the scoring in
   * build-vocab-classification.mjs — but they are pinned here anyway, because
   * marking one wrongly puts a borrowed reading on a card and unmarking one
   * silently strips a reading the learner was being taught.
   */
  it("should keep the phonetic components to an explicit list", () => {
    const phonetic = [...classification]
      .filter(([, entry]) => entry.phonetic)
      .map(([glyph]) => glyph);
    expect(phonetic.sort()).toEqual(
      ["艮", "隹", "爿", "丬", "龹", "鬲", "臼", "虍"].sort(),
    );
  });

  it("should mark a phonetic only where it is a component with a real reading", () => {
    for (const [glyph, entry] of classification) {
      if (!entry.phonetic) continue;
      expect(entry.decision, glyph).toBe("component");
      // A reading is the whole point; pinyin-pro echoing the glyph is not one.
      const reading = dictionary.get(glyph)?.pinyin?.[0];
      expect(reading, glyph).toBeTruthy();
      expect(reading, glyph).not.toBe(glyph);
    }
  });

  /**
   * The failure the purity gate exists to stop. A bound form's dictionary pinyin
   * belongs to the full character it abbreviates — 阝 is given 邑's "yì" — so it
   * would be quizzed as the reading of 113 characters it says nothing about.
   */
  it("should not mark a bound form that only ever supplies meaning", () => {
    for (const glyph of [
      "亻",
      "氵",
      "扌",
      "艹",
      "阝",
      "饣",
      "刂",
      "礻",
      "彳",
    ]) {
      expect(classification.get(glyph)?.phonetic, glyph).toBe(false);
    }
  });

  /**
   * The other gate. These are pure phonetics by the etymology labels but their
   * series no longer rhymes in Mandarin — 弋 yì heads 忒 tè, 甙 dài, 鸢 yuān — so
   * the reading is history, not a clue, and buys a learner nothing.
   */
  it("should not mark a phonetic whose series has drifted out of rhyme", () => {
    for (const glyph of ["弋", "彐", "乚", "⺌", "龠", "丩"]) {
      expect(classification.get(glyph)?.phonetic, glyph).toBe(false);
    }
  });

  /**
   * 爿 and 丬 are one component drawn two ways, so the generator pools their
   * evidence. Scored apart, 丬 passes on its seven simplified characters and 爿
   * fails on its four traditional ones — and a learner would be taught the sound
   * of one script's form and not the other's.
   */
  it("should treat variant forms of one radical alike", () => {
    for (const [a, b] of [
      ["爿", "丬"],
      ["纟", "糹"],
      ["饣", "飠"],
    ]) {
      expect(classification.get(a)?.phonetic, `${a} and ${b} disagree`).toBe(
        classification.get(b)?.phonetic,
      );
    }
  });

  it("should strip the reading and audio from a meaning-only component", () => {
    // The dictionary copies the parent's reading onto a bound form (亻 gets 人's
    // "rén"), which is worse than nothing on a card.
    for (const glyph of ["亻", "氵", "扌", "⺮"]) {
      const stored = applyClassification(classification.get(glyph), {
        pinyin: "rén",
        audioUrl: "audio/4ebb.mp3",
        translation: "man, person; people",
      });
      expect(stored.pinyin, glyph).toBe("");
      expect(stored.audioUrl, glyph).toBe("");
    }
  });

  it("should keep the reading and audio of a phonetic component", () => {
    // 艮 gěn is the clue behind 很, 跟, 根, 恨 — the reading is its own, not
    // borrowed, so stripping it would throw away the reason for teaching it.
    const stored = applyClassification(classification.get("艮"), {
      pinyin: "gěn",
      audioUrl: "audio/33390.mp3",
      translation: "blunt; tough, chewy",
    });
    expect(stored.pinyin).toBe("gěn");
    expect(stored.audioUrl).toBe("audio/33390.mp3");
  });

  it("should prefer the override gloss over the dictionary translation", () => {
    const stored = applyClassification(classification.get("⺈"), {
      pinyin: "",
      audioUrl: "",
      translation: null,
    });
    expect(stored.translation).toContain("knife");
  });

  it("should leave a character's reading untouched and never flag it", () => {
    const raw = {
      pinyin: "rén",
      audioUrl: "audio/4eba.mp3",
      translation: "man, person; people",
    };
    expect(applyClassification(classification.get("人"), raw)).toEqual({
      ...raw,
      phonetic: false,
    });
  });

  /**
   * The flag, not the pinyin, is what stops a card being made. Production stores
   * 人's "rén" on 亻 and 邑's "yì" on 阝, so a rule of "has a reading, therefore
   * teach it" would quiz 97 components on a sound they do not have.
   */
  it("should refuse to flag a component whose reading is borrowed", () => {
    for (const glyph of ["亻", "氵", "扌", "阝", "饣"]) {
      const stored = applyClassification(classification.get(glyph), {
        pinyin: "rén",
        audioUrl: "audio/4ebb.mp3",
        translation: "man, person; people",
      });
      expect(stored.phonetic, glyph).toBe(false);
    }
  });

  it("should flag a phonetic component", () => {
    for (const glyph of ["艮", "隹", "虍"]) {
      const stored = applyClassification(classification.get(glyph), {
        pinyin: "gěn",
        audioUrl: "audio/33390.mp3",
        translation: "blunt",
      });
      expect(stored.phonetic, glyph).toBe(true);
    }
  });

  it("should suppress audio for meaning-only components and disabled glyphs", () => {
    expect(suppressesAudio(classification.get("亻"))).toBe(true);
    expect(suppressesAudio(classification.get(glyphsWith("disabled")[0]))).toBe(
      true,
    );
    expect(suppressesAudio(classification.get("人"))).toBe(false);
  });

  it("should not suppress audio for a phonetic component", () => {
    // It is served for listening, so the object has to exist.
    expect(suppressesAudio(classification.get("龹"))).toBe(false);
    expect(suppressesAudio(classification.get("艮"))).toBe(false);
  });

  it("should disable only glyphs that are unstudiable or not a radical", () => {
    for (const glyph of glyphsWith("disabled")) {
      const entry = dictionary.get(glyph)!;
      const reason = classification.get(glyph)!.reason;

      if (reason === "no-gloss") {
        expect(
          !entry.definition || !entry.pinyin?.length,
          `${glyph} was disabled as no-gloss but has both a gloss and a reading`,
        ).toBe(true);
      } else {
        expect(reason).toBe("not-typed-not-a-radical");
      }
    }
  });
});
