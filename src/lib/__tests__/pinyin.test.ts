import { describe, expect, it } from "vitest";

import { foldPinyinInput } from "@/lib/pinyin";

describe("foldPinyinInput", () => {
  it("should put the tone mark on a completed syllable", () => {
    expect(foldPinyinInput("hao3")).toBe("hǎo");
  });

  it("should tone a ü typed as v, which is the whole reason for the fold", () => {
    expect(foldPinyinInput("nv3")).toBe("nǚ");
  });

  it("should tone a ü the keyboard already produced", () => {
    expect(foldPinyinInput("nü3")).toBe("nǚ");
  });

  it("should leave a syllable with no tone digit yet alone", () => {
    expect(foldPinyinInput("hao")).toBe("hao");
  });

  it("should leave an empty field empty", () => {
    expect(foldPinyinInput("")).toBe("");
  });
});
