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
    const unknown = [...classification.keys()].filter((g) => !dictionary.has(g));
    expect(unknown).toEqual([]);
  });

  it("should classify single glyphs only", () => {
    const multiCharacter = [...classification.keys()].filter(
      (g) => Array.from(g).length !== 1,
    );
    expect(multiCharacter).toEqual([]);
  });

  it("should attribute every component to a radical", () => {
    const unattributed = glyphsWith("component").filter(
      (g) => !/^radical-\d+$/.test(classification.get(g)!.reason),
    );
    expect(unattributed).toEqual([]);
  });

  it("should only cite radicals within the standard 214", () => {
    const outOfRange = glyphsWith("component").filter((g) => {
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
    for (const glyph of ["亻", "氵", "扌", "忄", "艹", "讠", "辶", "刂", "纟"]) {
      expect(classification.get(glyph)?.decision, glyph).toBe("component");
    }
  });

  it("should leave standalone characters unclassified", () => {
    // Each is a radical whose primary form is an ordinary typed word, so it must
    // stay a character: 人 person, 水 water, 手 hand, 尸体 corpse, 萝卜 radish,
    // 器皿 vessel, 王 king, 食 food.
    for (const glyph of ["人", "水", "手", "心", "尸", "卜", "皿", "王", "食"]) {
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
    // Components are understanding-only, so one with no gloss could never be
    // served — and an unservable part stalls everything built on it.
    const glossless = glyphsWith("component").filter((glyph) => {
      const fromDictionary = dictionary.get(glyph)?.definition?.trim();
      return !classification.get(glyph)!.gloss && !fromDictionary;
    });
    expect(glossless).toEqual([]);
  });

  it("should strip the reading and audio from every component", () => {
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

  it("should prefer the override gloss over the dictionary translation", () => {
    const stored = applyClassification(classification.get("⺈"), {
      pinyin: "",
      audioUrl: "",
      translation: null,
    });
    expect(stored.translation).toContain("knife");
  });

  it("should leave characters untouched", () => {
    const raw = {
      pinyin: "rén",
      audioUrl: "audio/4eba.mp3",
      translation: "man, person; people",
    };
    expect(applyClassification(classification.get("人"), raw)).toEqual(raw);
  });

  it("should suppress audio for components and disabled glyphs alike", () => {
    expect(suppressesAudio(classification.get("亻"))).toBe(true);
    expect(suppressesAudio(classification.get("龹"))).toBe(true);
    expect(suppressesAudio(classification.get("人"))).toBe(false);
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
