"use client";

import Link from "next/link";
import { Sparkles, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterStrokes } from "@/components/character-strokes";
import { ItemTypeBadge } from "@/components/item-type-badge";
import type { VocabType } from "@/definitions/definitions";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { cn } from "@/lib/utils";

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
  translation: string | null;
  strokes: string[] | null;
  strokeMedians: [number, number][][] | null;
  etymologyHint: string | null;
  etymologyType: string | null;
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
            <span className="bg-secondary text-primary font-display inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
              <Sparkles className="size-3.5" />
              {formation}
            </span>
          )}
          {radical && (
            <span className="bg-muted text-muted-foreground font-display inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
              Radical
              <span className="hanzi text-foreground text-sm">{radical}</span>
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

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardContent>
          <div
            className={cn("flex gap-6", isLongForm ? "flex-col" : "items-center")}
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
                  "hanzi text-foreground text-center",
                  glyphSize(entry.vocabItem, HEADER_GLYPH_SIZES),
                  isLongForm ? "leading-relaxed" : "whitespace-nowrap",
                )}
              >
                {entry.vocabItem}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-3">
              <ItemTypeBadge type={entry.vocabType} />
              {/* A component is a bound form — it is never pronounced on its
                  own, so it is stored with no reading and no audio. Explain the
                  absence rather than showing a blank line and a dead button. */}
              {entry.vocabType === "component" ? (
                <p className="text-muted-foreground text-sm">
                  A part used to build other characters — it has no pronunciation
                  of its own.
                </p>
              ) : (
                <>
                  <div className={cn("hanzi text-3xl", meta.colorClass)}>
                    {entry.pinyin}
                  </div>
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

      {/* Definition */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">Definition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {entry.translation ? (
            <p className="text-foreground text-lg">{entry.translation}</p>
          ) : (
            <p className="text-muted-foreground text-lg">
              No definition yet for this entry.
            </p>
          )}
          {definitionFooter}
        </CardContent>
      </Card>

      {visualCards > 0 && (
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
                          <span className="text-muted-foreground font-display text-xl font-bold">
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
                        />
                      </div>
                    ))}
                  </div>
                )}

                {hasOrigin && (
                  <div className={cn(showParts && "border-border border-t pt-6")}>
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
}: {
  part: string;
  className?: string;
  linkable: boolean;
}) {
  const tile = (
    <div
      className={cn(
        "hanzi border-border flex h-20 min-w-20 items-center justify-center rounded-2xl border px-3 whitespace-nowrap transition-all",
        linkable && "group-hover:border-current group-hover:shadow-card-hover",
        className,
      )}
    >
      {part}
    </div>
  );

  if (!linkable) return tile;

  return (
    <Link href={`/dictionary/${encodeURIComponent(part)}`} className="group">
      {tile}
    </Link>
  );
}
