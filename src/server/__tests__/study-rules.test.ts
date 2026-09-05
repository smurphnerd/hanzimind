import { describe, it, expect } from "vitest";

import {
  emptyStudyProgress,
  STUDY_TYPES,
  type StudyProgressDto,
  type StudyType,
} from "@/definitions/definitions";
import {
  canStudy,
  constituentsOf,
  isUnlocked,
  readingOf,
  servableStudyTypes,
  weakestServableLevel,
  VOCAB_TYPE_PRIORITY,
  type StudiableItem,
} from "../study-rules";

const ALL_TYPES: StudyType[] = [
  "reading",
  "listening",
  "understanding",
  "writing",
];

/**
 * Levels named by study type, which is how every case here is written. The
 * item factory turns them into the total `progress` map the rules read, so a
 * case that cares about one type says so and nothing else.
 */
type Levels = Partial<Record<StudyType, number>>;
type Overrides = Partial<StudiableItem> & { levels?: Levels };

function progressWith(levels: Levels): StudyProgressDto {
  const progress = emptyStudyProgress();
  for (const type of STUDY_TYPES) {
    progress[type] = { level: levels[type] ?? 0, nextAt: null };
  }
  return progress;
}

function item({ levels, ...overrides }: Overrides = {}): StudiableItem {
  return {
    vocabItem: "人",
    vocabType: "character",
    pinyin: "rén",
    translation: "man, person; people",
    audioUrl: "audio/4eba.mp3",
    phonetic: false,
    decomposition: "？",
    seen: true,
    progress: progressWith(levels ?? {}),
    ...overrides,
  };
}

/**
 * The ordinary case. Note the borrowed reading is PRESENT — the dictionary gives
 * 亻 the same "rén" as 人, and 97 production rows still carry theirs — because
 * `phonetic`, not an empty pinyin, is what must keep it out of a card.
 */
const component = (overrides: Overrides = {}) =>
  item({
    vocabItem: "亻",
    vocabType: "component",
    pinyin: "rén",
    audioUrl: "audio/4ebb.mp3",
    phonetic: false,
    translation: "man, person; people",
    ...overrides,
  });

/**
 * A component whose reading is its own and predicts the series it heads — 艮 gěn
 * behind 很, 跟, 根, 恨 — so it is quizzed on sound as well as meaning.
 */
const phonetic = (overrides: Overrides = {}) =>
  component({
    vocabItem: "艮",
    pinyin: "gěn",
    audioUrl: "audio/33390.mp3",
    phonetic: true,
    translation: "blunt; tough, chewy",
    ...overrides,
  });

describe("canStudy", () => {
  describe("components", () => {
    it("should allow understanding", () => {
      expect(canStudy(component(), "understanding")).toBe(true);
    });

    it("should reject reading despite a borrowed pinyin being stored", () => {
      // The regression this whole flag exists for: production carries 人's "rén"
      // on 亻, and gating on "is there a pinyin" would quiz it.
      expect(canStudy(component(), "reading")).toBe(false);
    });

    it("should reject listening despite stored audio", () => {
      expect(canStudy(component(), "listening")).toBe(false);
    });

    it("should hide the borrowed reading on the way out", () => {
      expect(readingOf(component())).toEqual({ pinyin: "", audioUrl: "" });
    });

    it("should reject writing, which a pinyin IME cannot produce", () => {
      expect(canStudy(component(), "writing")).toBe(false);
    });

    it("should reject understanding when there is no gloss", () => {
      expect(canStudy(component({ translation: null }), "understanding")).toBe(
        false,
      );
    });
  });

  describe("phonetic components", () => {
    it("should allow reading, which is the whole point of keeping one", () => {
      expect(canStudy(phonetic(), "reading")).toBe(true);
    });

    it("should allow listening once audio exists", () => {
      expect(canStudy(phonetic(), "listening")).toBe(true);
    });

    it("should reject listening while the audio is still missing", () => {
      // The backfill restores the pinyin; audio is a separate job, so reading is
      // servable before listening is.
      expect(canStudy(phonetic({ audioUrl: "" }), "listening")).toBe(false);
    });

    it("should still reject writing — no component can be typed", () => {
      expect(canStudy(phonetic(), "writing")).toBe(false);
    });

    it("should still allow understanding", () => {
      expect(canStudy(phonetic(), "understanding")).toBe(true);
    });

    it("should expose its reading rather than blanking it", () => {
      expect(readingOf(phonetic())).toEqual({
        pinyin: "gěn",
        audioUrl: "audio/33390.mp3",
      });
    });
  });

  describe("characters", () => {
    it("should allow reading when pinyin is present", () => {
      expect(canStudy(item(), "reading")).toBe(true);
    });

    it("should reject reading when pinyin merely echoes the glyph", () => {
      // pinyin-pro returns the input when it has no romanisation for it.
      expect(canStudy(item({ vocabItem: "㐆", pinyin: "㐆" }), "reading")).toBe(
        false,
      );
    });

    it("should reject listening without audio", () => {
      expect(canStudy(item({ audioUrl: "" }), "listening")).toBe(false);
    });

    it("should reject understanding when the gloss is whitespace only", () => {
      expect(canStudy(item({ translation: "   " }), "understanding")).toBe(
        false,
      );
    });

    it("should allow writing without a reading - the prompt is the gloss", () => {
      expect(canStudy(item({ pinyin: "", audioUrl: "" }), "writing")).toBe(
        true,
      );
    });

    it("should reject writing with no gloss, which would prompt with nothing", () => {
      // A writing card shows the English and asks for the characters. 53 corpus
      // characters (侌, 倠, 兓 …) have no translation, so this would render an
      // empty question. None is in a deck yet - the gate is what keeps it that
      // way if one is ever added.
      expect(canStudy(item({ translation: null }), "writing")).toBe(false);
      expect(canStudy(item({ translation: "   " }), "writing")).toBe(false);
    });
  });
});

describe("servableStudyTypes", () => {
  it("should reduce a meaning-only component to understanding", () => {
    expect(servableStudyTypes(component(), ALL_TYPES)).toEqual([
      "understanding",
    ]);
  });

  it("should give a phonetic component everything but writing", () => {
    expect(servableStudyTypes(phonetic(), ALL_TYPES)).toEqual([
      "reading",
      "listening",
      "understanding",
    ]);
  });

  it("should return nothing for a component with no gloss", () => {
    expect(
      servableStudyTypes(component({ translation: "" }), ALL_TYPES),
    ).toEqual([]);
  });

  it("should respect the deck's enabled types", () => {
    expect(servableStudyTypes(component(), ["reading", "writing"])).toEqual([]);
  });
});

describe("weakestServableLevel", () => {
  it("should ignore levels the item can never be quizzed on", () => {
    // The deadlock in miniature: reading/listening/writing are pinned at 0 for a
    // component forever, so counting them would hold the level at 0 for good.
    const advanced = component({
      levels: { understanding: 4, reading: 0, listening: 0, writing: 0 },
    });
    expect(weakestServableLevel(advanced, ALL_TYPES)).toBe(4);
  });

  it("should take the minimum across servable types for a character", () => {
    const mixed = item({
      levels: { reading: 3, listening: 1, understanding: 5, writing: 2 },
    });
    expect(weakestServableLevel(mixed, ALL_TYPES)).toBe(1);
  });

  it("should treat a type with no progress row as zero", () => {
    // The sparse storage in one assertion. `user_study_progress` holds nothing
    // for a type until its first answer, so understanding has moved here and
    // the three types with no row sit at `emptyStudyProgress`'s zero.
    const partly = item({
      progress: {
        ...emptyStudyProgress(),
        understanding: { level: 4, nextAt: null },
      },
    });
    expect(weakestServableLevel(partly, ALL_TYPES)).toBe(0);
  });

  it("should return Infinity when nothing is servable", () => {
    expect(
      weakestServableLevel(component({ translation: null }), ALL_TYPES),
    ).toBe(Infinity);
  });
});

describe("constituentsOf", () => {
  it("should return nothing for a component", () => {
    expect(constituentsOf(component({ decomposition: "⿻二亅" }))).toEqual([]);
  });

  it("should split a character's decomposition", () => {
    expect(
      constituentsOf(item({ vocabItem: "你", decomposition: "⿰亻尔" })),
    ).toEqual(["亻", "尔"]);
  });

  it("should split a compound into its characters", () => {
    expect(
      constituentsOf(item({ vocabItem: "你好", vocabType: "compound" })),
    ).toEqual(["你", "好"]);
  });
});

describe("isUnlocked", () => {
  const GATE = 2;
  const target = item({ vocabItem: "你", decomposition: "⿰亻尔" });
  const deps = (...items: StudiableItem[]) =>
    new Map(items.map((i) => [i.vocabItem, i]));

  it("should unlock when a component dependency reaches the gate by understanding alone", () => {
    // The regression this suite exists for. Before the fix the gate took the
    // minimum across every enabled type, so a component's permanently-zero
    // readingLevel locked 你 forever no matter how well 亻 was known.
    const mature = component({
      seen: true,
      levels: { understanding: GATE, reading: 0, listening: 0, writing: 0 },
    });
    expect(isUnlocked(target, deps(mature), ALL_TYPES, GATE)).toBe(true);
  });

  it("should gate on a phonetic component's weakest servable type, not understanding alone", () => {
    // 艮 is servable for reading and listening too, so knowing only its meaning
    // is no longer enough to introduce what is built on it.
    const built = item({ vocabItem: "很", decomposition: "⿰彳艮" });
    const half = phonetic({
      seen: true,
      levels: { understanding: GATE, reading: GATE - 1 },
    });
    expect(isUnlocked(built, deps(half), ALL_TYPES, GATE)).toBe(false);

    const whole = phonetic({
      seen: true,
      levels: { understanding: GATE, reading: GATE, listening: GATE },
    });
    expect(isUnlocked(built, deps(whole), ALL_TYPES, GATE)).toBe(true);
  });

  it("should stay locked while a component dependency is below the gate", () => {
    const immature = component({
      seen: true,
      levels: { understanding: GATE - 1 },
    });
    expect(isUnlocked(target, deps(immature), ALL_TYPES, GATE)).toBe(false);
  });

  it("should stay locked while a dependency is unseen", () => {
    const unseen = component({ seen: false, levels: { understanding: 9 } });
    expect(isUnlocked(target, deps(unseen), ALL_TYPES, GATE)).toBe(false);
  });

  it("should treat a dependency with no progress row as unseen", () => {
    const noProgress = component({ seen: null });
    expect(isUnlocked(target, deps(noProgress), ALL_TYPES, GATE)).toBe(false);
  });

  it("should not be gated by a dependency outside the deck", () => {
    expect(isUnlocked(target, deps(), ALL_TYPES, GATE)).toBe(true);
  });

  it("should not be gated by an unservable dependency", () => {
    // A component with no gloss can never be served, so it can never be seen or
    // levelled. Letting it gate would lock 你 with no way for the learner out.
    const unservable = component({ seen: false, translation: null });
    expect(isUnlocked(target, deps(unservable), ALL_TYPES, GATE)).toBe(true);
  });

  it("should not be gated by a component when understanding is disabled deck-wide", () => {
    // With understanding off, no component is servable at all — the deck must
    // still be studiable rather than locking every character that has a part.
    const stuck = component({ seen: false });
    expect(
      isUnlocked(
        target,
        deps(stuck),
        ["reading", "listening", "writing"],
        GATE,
      ),
    ).toBe(true);
  });

  it("should require every dependency to clear the gate", () => {
    const ready = component({ seen: true, levels: { understanding: GATE } });
    const notReady = item({
      vocabItem: "尔",
      seen: true,
      levels: {
        reading: 0,
        listening: GATE,
        understanding: GATE,
        writing: GATE,
      },
    });
    expect(isUnlocked(target, deps(ready, notReady), ALL_TYPES, GATE)).toBe(
      false,
    );
  });

  it("should never gate a component on anything", () => {
    expect(isUnlocked(component(), deps(), ALL_TYPES, GATE)).toBe(true);
  });

  it("should ignore a self-referential decomposition entry", () => {
    // 木 lists itself among its own parts. It must be present in the dependency
    // map, and unseen, or the `!dep` branch would satisfy this test without ever
    // exercising the self-filter.
    const selfRef = item({
      vocabItem: "木",
      decomposition: "⿻木木",
      seen: false,
    });
    expect(isUnlocked(selfRef, deps(selfRef), ALL_TYPES, GATE)).toBe(true);
  });
});

describe("VOCAB_TYPE_PRIORITY", () => {
  it("should order parts before the things built from them", () => {
    expect(VOCAB_TYPE_PRIORITY.component).toBeLessThan(
      VOCAB_TYPE_PRIORITY.character,
    );
    expect(VOCAB_TYPE_PRIORITY.character).toBeLessThan(
      VOCAB_TYPE_PRIORITY.compound,
    );
    expect(VOCAB_TYPE_PRIORITY.compound).toBeLessThan(
      VOCAB_TYPE_PRIORITY.sentence,
    );
  });
});
