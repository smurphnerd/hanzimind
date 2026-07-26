import type { LucideIcon } from "lucide-react";
import { AlignLeft, Blocks, Puzzle, Square } from "lucide-react";

import type { VocabType } from "@/definitions/definitions";

/** The 3 vocab types plus "component" (a decomposition context, not a vocabType). */
export type ItemTypeKey = VocabType | "component";

export interface ItemTypeMeta {
  key: ItemTypeKey;
  label: string;
  shortLabel: string;
  colorClass: string; // text-*
  softClass: string; // bg-*-soft
  fillClass: string; // bg-* (solid)
  borderClass: string; // border-*
  icon: LucideIcon;
}

const META: Record<ItemTypeKey, ItemTypeMeta> = {
  character: {
    key: "character",
    label: "Character",
    shortLabel: "Char",
    colorClass: "text-type-character",
    softClass: "bg-type-character-soft",
    fillClass: "bg-type-character",
    borderClass: "border-type-character",
    icon: Square,
  },
  compound: {
    key: "compound",
    label: "Word",
    shortLabel: "Word",
    colorClass: "text-type-compound",
    softClass: "bg-type-compound-soft",
    fillClass: "bg-type-compound",
    borderClass: "border-type-compound",
    icon: Blocks,
  },
  sentence: {
    key: "sentence",
    label: "Sentence",
    shortLabel: "Sent",
    colorClass: "text-type-sentence",
    softClass: "bg-type-sentence-soft",
    fillClass: "bg-type-sentence",
    borderClass: "border-type-sentence",
    icon: AlignLeft,
  },
  component: {
    key: "component",
    label: "Component",
    shortLabel: "Comp",
    colorClass: "text-type-component",
    softClass: "bg-type-component-soft",
    fillClass: "bg-type-component",
    borderClass: "border-type-component",
    icon: Puzzle,
  },
};

export function vocabTypeMeta(type: ItemTypeKey): ItemTypeMeta {
  return META[type] ?? META.character;
}
