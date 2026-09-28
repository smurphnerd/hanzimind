import { describe, it, expect } from "vitest";

import {
  loadRwcMemoryAids,
  planRwcImport,
  RWC_SOURCE,
  type RwcImportExistingAid,
  type RwcImportItem,
} from "../seed-rwc-memory-aids";

const item = (
  id: string,
  vocabItem: string,
  defaultMemoryAidId: string | null = null,
): RwcImportItem => ({ id, vocabItem, defaultMemoryAidId });

const rwcAid = (
  id: string,
  vocabItemId: string,
  memoryAid: string,
): RwcImportExistingAid => ({
  id,
  vocabItemId,
  memoryAid,
  source: RWC_SOURCE,
  public: true,
});

const plan = (args: {
  aids: Record<string, string>;
  items: RwcImportItem[];
  existing?: RwcImportExistingAid[];
  privateAidIds?: string[];
}) => {
  let n = 0;
  return planRwcImport({
    aids: new Map(Object.entries(args.aids)),
    items: args.items,
    existing: args.existing ?? [],
    privateAidIds: new Set(args.privateAidIds ?? []),
    newId: () => `new-${++n}`,
  });
};

describe("planRwcImport", () => {
  it("should insert an aid and star it when the glyph has no default", () => {
    const result = plan({
      aids: { 女: "A woman." },
      items: [item("v1", "女")],
    });

    expect(result.inserts).toEqual([
      { id: "new-1", vocabItemId: "v1", memoryAid: "A woman." },
    ]);
    expect(result.setDefaults).toEqual(new Map([["v1", "new-1"]]));
  });

  it("should never replace a public default", () => {
    const result = plan({
      aids: { 女: "A woman." },
      items: [item("v1", "女", "admin-pick")],
    });

    expect(result.setDefaults.size).toBe(0);
    expect(result.clearDefaults).toEqual([]);
  });

  it("should replace a private default with the RWC aid", () => {
    const result = plan({
      aids: { 女: "A woman." },
      items: [item("v1", "女", "old-private")],
      privateAidIds: ["old-private"],
    });

    expect(result.setDefaults).toEqual(new Map([["v1", "new-1"]]));
  });

  it("should clear a private default when there is no RWC aid to take over", () => {
    const result = plan({
      aids: {},
      items: [item("v1", "女", "old-private")],
      privateAidIds: ["old-private"],
    });

    expect(result.clearDefaults).toEqual(["v1"]);
  });

  it("should update an existing RWC aid in place, keeping its id", () => {
    const result = plan({
      aids: { 女: "New wording." },
      items: [item("v1", "女", "rwc-1")],
      existing: [rwcAid("rwc-1", "v1", "Old wording.")],
    });

    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([
      { id: "rwc-1", memoryAid: "New wording." },
    ]);
    expect(result.setDefaults.size).toBe(0);
  });

  it("should republish an existing private RWC aid with its credit", () => {
    const result = plan({
      aids: { 女: "Same." },
      items: [item("v1", "女")],
      existing: [
        { ...rwcAid("rwc-1", "v1", "Same."), public: false, source: null },
      ],
    });

    expect(result.updates).toEqual([{ id: "rwc-1", memoryAid: "Same." }]);
  });

  it("should plan nothing on a second run", () => {
    const result = plan({
      aids: { 女: "Same." },
      items: [item("v1", "女", "rwc-1")],
      existing: [rwcAid("rwc-1", "v1", "Same.")],
    });

    expect(result).toEqual({
      inserts: [],
      updates: [],
      deletes: [],
      setDefaults: new Map(),
      clearDefaults: [],
    });
  });

  it("should delete RWC aids the file no longer has, and duplicates", () => {
    const result = plan({
      aids: { 女: "Keep." },
      items: [item("v1", "女"), item("v2", "口")],
      existing: [
        rwcAid("rwc-1", "v1", "Keep."),
        rwcAid("rwc-dup", "v1", "Keep."),
        rwcAid("rwc-2", "v2", "Dropped from the file."),
      ],
    });

    expect(result.deletes.sort()).toEqual(["rwc-2", "rwc-dup"]);
  });

  it("should skip a glyph that has no enabled vocab row", () => {
    const result = plan({ aids: { 女: "A woman." }, items: [] });

    expect(result.inserts).toEqual([]);
  });
});

describe("loadRwcMemoryAids", () => {
  const aids = loadRwcMemoryAids();

  it("should hold no book cross-references a learner cannot follow", () => {
    const withRefs = [...aids].filter(([, text]) =>
      /\(\d+|\bp\. ?\d|\bPt\. ?\d/.test(text),
    );
    expect(withRefs).toEqual([]);
  });

  it("should fit the admin memory-aid length limit", () => {
    const tooLong = [...aids].filter(([, text]) => text.length > 500);
    expect(tooLong).toEqual([]);
  });
});
