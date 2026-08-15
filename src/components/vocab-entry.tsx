"use client";

import { useState } from "react";
import Link from "next/link";
import { Network, Sparkles, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterStrokes } from "@/components/character-strokes";
import { DecompositionGraphPanel } from "@/components/decomposition-graph-panel";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ComponentRoleBadge } from "@/components/component-role-badge";
import {
  SegmentedToggle,
  type SegmentedOption,
} from "@/components/segmented-toggle";
import type { VocabType } from "@/definitions/definitions";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { cn } from "@/lib/utils";

type EntryView = "standard" | "graph";

/**
 * Type sizes for a run of glyphs, indexed by how many glyphs it has to hold.
 *
 * A single fixed size overflows the moment an item is more than one character,
 * and UAX #14 permits a line break between any two Han glyphs — so 上午 didn't
 * merely look tight, it silently broke onto two lines. Shrink the type as the
 * run grows instead, and let the tile widen to match.
 */
const HEADER_GLYPH_SIZES = [
  "text-6xl",
  "text-5xl",
  "text-4xl",
  "text-4xl",
  "text-3xl",
] as const;
const PART_GLYPH_SIZES = ["text-4xl", "text-3xl", "text-2xl"] as const;

/** Past this many glyphs the header stops being a tile and becomes a banner. */
const LONG_FORM_GLYPHS = 4;

function glyphCount(text: string) {
  // Spread rather than .length: a handful of rare hanzi are surrogate pairs and
  // would otherwise count double, shrinking the type for no reason.
  return [...text].length;
}

function glyphSize(text: string, sizes: readonly string[]) {
  const index = Math.min(Math.max(glyphCount(text), 1), sizes.length) - 1;
  return sizes[index];
}

/** What an item's parts actually are, said in the learner's words. */
function partsTitle(type: VocabType) {
  if (type === "sentence") return "Words in this sentence";
  if (type === "compound") return "Characters in this word";
  return "Decomposition";
}

/**
 * Parts always sit exactly one level down the hierarchy — a sentence is cut into
 * words, a word into characters — so tint them with that level's colour.
 */
const PART_TYPE: Record<VocabType, VocabType> = {
  sentence: "compound",
  compound: "character",
  character: "component",
  component: "component",
};

const ETYMOLOGY_LABEL: Record<string, string> = {
  pictographic: "Pictograph",
  ideographic: "Ideograph",
  pictophonetic: "Sound + meaning",
};

/**
 * What a part does in the character it sits in. A pictophonetic character is
 * built from one part that supplied the sound and one that supplied the meaning
 * — 沐 mù is 氵 "water" plus 木 mù — and knowing which is which is most of the
 * value of seeing the decomposition at all.
 */
type PartRole = "sound" | "meaning" | "sound + meaning";

const PART_ROLE_CLASS: Record<PartRole, string> = {
  sound: "text-accent",
  meaning: "text-primary",
  "sound + meaning": "text-accent",
};

/**
 * The fields any screen needs to present one vocabulary entry. Deliberately a
 * structural type rather than one of the DTOs: the dictionary passes a
 * VocabItemDetailedDto and the study intro a VocabItemStudyDto, and they agree
 * on exactly this much.
 */
export interface VocabEntryData {
  vocabItem: string;
  vocabType: VocabType;
  pinyin: string;
  audioUrl: string;
  /**
   * Component only: whether its reading is its own and taught. `pinyin` and
   * `audioUrl` above are already blanked when this is false, so they cannot be
   * used to recover it — a blank reading and a hidden one look identical here.
   */
  phonetic: boolean;
  translation: string | null;
  strokes: string[] | null;
  strokeMedians: [number, number][][] | null;
  etymologyHint: string | null;
  etymologyType: string | null;
  /**
   * The parts that supplied this character's sound and meaning. Matched against
   * `constituents` to label the tiles — the role belongs to the pair, not to the
   * part, so it can only be read off the entry being shown.
   */
  etymologyPhonetic: string | null;
  etymologySemantic: string | null;
  radical: string | null;
  /** Resolved server-side with disabled parts already dropped. Never re-split `decomposition`. */
  constituents: string[] | null;
}

/**
 * Where a glyph came from: the dictionary's etymology note, how it was formed,
 * and the radical it files under. For a base character like 女 this is the whole
 * story — it has no parts to decompose into, so this replaces the parts card.
 */
function OriginDetails({
  hint,
  etymologyType,
  radical,
}: {
  hint: string | null;
  etymologyType: string | null;
  radical: string | null;
}) {
  const formation = etymologyType
    ? (ETYMOLOGY_LABEL[etymologyType] ?? etymologyType)
    : null;

  return (
    <div className="space-y-4">
      {hint && <p className="text-foreground">{hint}</p>}
      {(formation || radical) && (
        <div className="flex flex-wrap items-center gap-2">
          {formation && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-display text-xs font-bold text-primary">
              <Sparkles className="size-3.5" />
              {formation}
            </span>
          )}
          {radical && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-display text-xs font-bold text-muted-foreground">
              Radical
              <span className="hanzi text-sm text-foreground">{radical}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface VocabEntryDetailProps {
  entry: VocabEntryData;
  /** Rendered under the definition — the dictionary puts its report control here. */
  definitionFooter?: React.ReactNode;
  /**
   * Whether parts link through to their dictionary pages. Off during a study
   * session, where following one would abandon the card mid-review.
   */
  partsLinkable?: boolean;
  className?: string;
}

/**
 * One vocabulary entry, presented the same way everywhere it appears.
 *
 * Shared by the dictionary page and the study session's first-sight card, which
 * had drifted into two layouts with the same bugs in both: a fixed-width tile
 * that wrapped multi-character words, stroke order offered for words that have
 * none, and an empty "No decomposition available" card on entries that can
 * never have one.
 *
 * Every card here is conditional on the entry's TYPE, not on whether its data
 * happens to be empty — a component returns no parts by design, so an empty
 * array is the expected case, not a gap to apologise for.
 */
export function VocabEntryDetail({
  entry,
  definitionFooter,
  partsLinkable = true,
  className,
}: VocabEntryDetailProps) {
  const meta = vocabTypeMeta(entry.vocabType);
  const partMeta = vocabTypeMeta(PART_TYPE[entry.vocabType]);
  const isSingleGlyph =
    entry.vocabType === "character" || entry.vocabType === "component";
  const isLongForm = glyphCount(entry.vocabItem) > LONG_FORM_GLYPHS;

  const parts = entry.constituents ?? [];

  // Which part did which job. Read off this entry rather than looked up on the
  // part, because the role is a property of the pair: 山 is the meaning in 峰 and
  // the sound in 仙 xiān. About 4% of pictophonetic characters name a part that
  // is not in the top-level decomposition (冒's sound is 冃, but it splits ⿱日目),
  // and those simply go unlabelled rather than getting a tile they do not have.
  const roleOf = (part: string): PartRole | null => {
    const sound = part === entry.etymologyPhonetic;
    const meaning = part === entry.etymologySemantic;
    if (sound && meaning) return "sound + meaning";
    if (sound) return "sound";
    if (meaning) return "meaning";
    return null;
  };
  // Reserve the caption line on every tile once any part has one, so the tiles
  // stay the same height and the + between them stays on the same line.
  const showRoles = parts.some((part) => roleOf(part) !== null);

  // Only a single glyph is written stroke by stroke; a word or sentence would
  // fall through to an empty "no stroke data" box.
  const showStrokes = isSingleGlyph && (entry.strokes?.length ?? 0) > 0;
  // A component is the floor of the hierarchy, so getVocabItemParts returns []
  // for it by design — branch on the type, not on the empty array.
  const showParts = entry.vocabType !== "component" && parts.length > 0;
  const hasOrigin =
    isSingleGlyph &&
    Boolean(entry.etymologyHint || entry.etymologyType || entry.radical);
  const visualCards = (showStrokes ? 1 : 0) + (showParts || hasOrigin ? 1 : 0);

  const [view, setView] = useState<EntryView>("standard");
  // Sentences decompose by segmentation rather than by glyph, which is a
  // different relation from the one the graph draws, so they have no graph view.
  // A component does: it has no parts, but the characters built from it are the
  // interesting half.
  const canShowGraph = entry.vocabType !== "sentence";
  const showingGraph = canShowGraph && view === "graph";

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardContent>
          <div
            className={cn(
              "flex gap-6",
              isLongForm ? "flex-col" : "items-center",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center rounded-2xl px-5",
                meta.softClass,
                isLongForm ? "w-full py-6" : "h-28 min-w-28 shrink-0",
              )}
            >
              <span
                className={cn(
                  "hanzi text-center text-foreground",
                  glyphSize(entry.vocabItem, HEADER_GLYPH_SIZES),
                  isLongForm ? "leading-relaxed" : "whitespace-nowrap",
                )}
              >
                {entry.vocabItem}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ItemTypeBadge type={entry.vocabType} />
                {entry.vocabType === "component" && (
                  <ComponentRoleBadge phonetic={entry.phonetic} />
                )}
              </div>
              {/* Branch on the flag, never on the reading. Most components hold
                  a reading borrowed from the character they abbreviate (亻 has
                  人's "rén"); `readingOf` blanks it server-side, so an empty
                  pinyin here cannot tell "has no sound" from "we hid it", and
                  either way the answer is the flag. */}
              {entry.vocabType === "component" && !entry.phonetic ? (
                <p className="text-sm text-muted-foreground">
                  A part used to build other characters — it has no
                  pronunciation of its own.
                </p>
              ) : (
                <>
                  <div className={cn("hanzi text-3xl", meta.colorClass)}>
                    {entry.pinyin}
                  </div>
                  {entry.vocabType === "component" && (
                    <p className="text-sm text-muted-foreground">
                      A part used to build other characters — its sound is a
                      clue to how they are said.
                    </p>
                  )}
                  {canPlayAudio(entry.audioUrl) && (
                    <Button
                      variant="outline"
                      onClick={() => playAudio(entry.audioUrl)}
                    >
                      <Volume2 className="size-4" />
                      Play audio
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {canShowGraph && (
        <div className="flex justify-end">
          <SegmentedToggle
            options={ENTRY_VIEWS}
            value={view}
            onChange={setView}
            label="Entry view"
          />
        </div>
      )}

      {showingGraph && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">
              Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DecompositionGraphPanel
              vocabItem={entry.vocabItem}
              linkable={partsLinkable}
            />
          </CardContent>
        </Card>
      )}

      {/* Definition. Hidden in graph view, where every node carries its own gloss
          on hover and the point is the structure rather than the prose. */}
      {!showingGraph && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">Definition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entry.translation ? (
              <p className="text-lg text-foreground">{entry.translation}</p>
            ) : (
              <p className="text-lg text-muted-foreground">
                No definition yet for this entry.
              </p>
            )}
            {definitionFooter}
          </CardContent>
        </Card>
      )}

      {!showingGraph && visualCards > 0 && (
        <div
          // items-start so a short card (an Origin note) sits at its own height
          // instead of stretching to match the stroke animation beside it.
          className={cn(
            "grid items-start gap-6",
            visualCards > 1 && "md:grid-cols-2",
          )}
        >
          {showStrokes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  Stroke Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CharacterStrokes
                  strokes={entry.strokes ?? []}
                  strokeMedians={entry.strokeMedians ?? undefined}
                />
              </CardContent>
            </Card>
          )}

          {(showParts || hasOrigin) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {showParts ? partsTitle(entry.vocabType) : "Origin"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {showParts && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {parts.map((part, index) => (
                      <div
                        key={`${part}-${index}`}
                        className="flex items-center gap-3"
                      >
                        {/* Only a character is genuinely the sum of its parts;
                            a sentence's words simply read left to right. */}
                        {index > 0 && entry.vocabType === "character" && (
                          <span className="font-display text-xl font-bold text-muted-foreground">
                            +
                          </span>
                        )}
                        <PartTile
                          part={part}
                          className={cn(
                            partMeta.softClass,
                            partMeta.colorClass,
                            glyphSize(part, PART_GLYPH_SIZES),
                          )}
                          linkable={partsLinkable}
                          role={roleOf(part)}
                          showRole={showRoles}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {hasOrigin && (
                  <div
                    className={cn(showParts && "border-t border-border pt-6")}
                  >
                    <OriginDetails
                      hint={entry.etymologyHint}
                      etymologyType={entry.etymologyType}
                      radical={entry.radical}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function PartTile({
  part,
  className,
  linkable,
  role,
  showRole,
}: {
  part: string;
  className?: string;
  linkable: boolean;
  role: PartRole | null;
  showRole: boolean;
}) {
  const tile = (
    <div
      className={cn(
        "hanzi flex h-20 min-w-20 items-center justify-center rounded-2xl border border-border px-3 whitespace-nowrap transition-all",
        linkable && "group-hover:border-current group-hover:shadow-card-hover",
        className,
      )}
    >
      {part}
    </div>
  );

  const labelled = showRole ? (
    <div className="flex flex-col items-center gap-1.5">
      {tile}
      {/* Rendered even when empty so every tile is the same height — see
          showRoles. A part with no role is silent rather than "unknown": the
          dictionary simply did not name it, which is not a fact about the part. */}
      <span
        className={cn(
          "text-[0.65rem] font-bold tracking-wider uppercase",
          role ? PART_ROLE_CLASS[role] : "invisible",
        )}
      >
        {role ?? "—"}
      </span>
    </div>
  ) : (
    tile
  );

  if (!linkable) return labelled;

  return (
    <Link href={`/dictionary/${encodeURIComponent(part)}`} className="group">
      {labelled}
    </Link>
  );
}

/** Standard / graph switch for one entry. */
const ENTRY_VIEWS: ReadonlyArray<SegmentedOption<EntryView>> = [
  {
    value: "standard",
    label: (
      <>
        <Sparkles />
        Details
      </>
    ),
  },
  {
    value: "graph",
    label: (
      <>
        <Network />
        Graph
      </>
    ),
  },
];
