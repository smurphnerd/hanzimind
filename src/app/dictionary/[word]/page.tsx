"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  Flag,
  Lightbulb,
  Plus,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import { ErrorBoundary } from "@/components/error-boundary";
import { DictionaryWordLoading } from "@/components/dictionary-word-loading";
import { CreateMemoryAidDialog } from "@/components/create-memory-aid-dialog";
import { ViewAllMemoryAidsDialog } from "@/components/view-all-memory-aids-dialog";
import { ReportIssueDialog } from "@/components/report-issue-dialog";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { CharacterStrokes } from "@/components/character-strokes";
import { EmptyState } from "@/components/empty-state";
import type { MemoryAidDto, VocabType } from "@/definitions/definitions";
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

function DictionaryWordContent() {
  const orpc = useORPC();
  const params = useParams();
  const word = decodeURIComponent(params.word as string);
  const [isMemoryAidDialogOpen, setIsMemoryAidDialogOpen] = useState(false);
  const [isViewAllDialogOpen, setIsViewAllDialogOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  // Kept after the dialog closes so its contents don't blank out mid-animation.
  // null means the report is about the entry itself rather than a memory aid.
  const [reportedAid, setReportedAid] = useState<MemoryAidDto | null>(null);

  const { data: vocabData } = useSuspenseQuery(
    orpc.vocab.get.queryOptions({
      input: {
        vocabItem: word,
        memoryAidPage: 1,
        memoryAidPageSize: 10,
      },
    }),
  );

  const meta = vocabTypeMeta(vocabData.vocabType);
  const partMeta = vocabTypeMeta(PART_TYPE[vocabData.vocabType]);
  const isSingleGlyph =
    vocabData.vocabType === "character" || vocabData.vocabType === "component";
  const isLongForm = glyphCount(vocabData.vocabItem) > LONG_FORM_GLYPHS;

  const parts = vocabData.constituents ?? [];
  const memoryAids = vocabData.memoryAids ?? [];

  // Only a single glyph is written stroke by stroke; a word or sentence would
  // fall through to an empty "no stroke data" box.
  const showStrokes = isSingleGlyph && (vocabData.strokes?.length ?? 0) > 0;
  // A component is the floor of the hierarchy, so getVocabItemParts returns []
  // for it by design — branch on the type, not on the empty array.
  const showParts = vocabData.vocabType !== "component" && parts.length > 0;
  const hasOrigin =
    isSingleGlyph &&
    Boolean(
      vocabData.etymologyHint || vocabData.etymologyType || vocabData.radical,
    );
  const visualCards = (showStrokes ? 1 : 0) + (showParts || hasOrigin ? 1 : 0);

  const openReport = (aid: MemoryAidDto | null) => {
    setReportedAid(aid);
    setIsReportOpen(true);
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/dictionary"
        className="text-muted-foreground hover:text-primary mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Dictionary
      </Link>

      {/* Header */}
      <Card className="mb-6">
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
                  "hanzi text-foreground text-center",
                  glyphSize(vocabData.vocabItem, HEADER_GLYPH_SIZES),
                  isLongForm ? "leading-relaxed" : "whitespace-nowrap",
                )}
              >
                {vocabData.vocabItem}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-3">
              <ItemTypeBadge type={vocabData.vocabType} />
              {/* A component is a bound form — it is never pronounced on its
                  own, so it is stored with no reading and no audio. Explain the
                  absence rather than showing a blank line and a dead button. */}
              {vocabData.vocabType === "component" ? (
                <p className="text-muted-foreground text-sm">
                  A part used to build other characters — it has no pronunciation
                  of its own.
                </p>
              ) : (
                <>
                  <div className={cn("hanzi text-3xl", meta.colorClass)}>
                    {vocabData.pinyin}
                  </div>
                  {canPlayAudio(vocabData.audioUrl) && (
                    <Button
                      variant="outline"
                      onClick={() => playAudio(vocabData.audioUrl)}
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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">Definition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {vocabData.translation ? (
            <p className="text-foreground text-lg">{vocabData.translation}</p>
          ) : (
            <p className="text-muted-foreground text-lg">
              No definition yet for this entry.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary -ml-3"
            onClick={() => openReport(null)}
          >
            <Flag className="size-3.5" />
            Report or suggest an improvement
          </Button>
        </CardContent>
      </Card>

      {visualCards > 0 && (
        <div
          // items-start so a short card (an Origin note) sits at its own height
          // instead of stretching to match the stroke animation beside it.
          className={cn(
            "mb-6 grid items-start gap-6",
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
                  strokes={vocabData.strokes ?? []}
                  strokeMedians={vocabData.strokeMedians ?? undefined}
                />
              </CardContent>
            </Card>
          )}

          {(showParts || hasOrigin) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {showParts ? partsTitle(vocabData.vocabType) : "Origin"}
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
                        {index > 0 && vocabData.vocabType === "character" && (
                          <span className="text-muted-foreground font-display text-xl font-bold">
                            +
                          </span>
                        )}
                        <Link
                          href={`/dictionary/${encodeURIComponent(part)}`}
                          className="group"
                        >
                          <div
                            className={cn(
                              "hanzi border-border flex h-20 min-w-20 items-center justify-center rounded-2xl border px-3 whitespace-nowrap transition-all group-hover:border-current group-hover:shadow-card-hover",
                              partMeta.softClass,
                              partMeta.colorClass,
                              glyphSize(part, PART_GLYPH_SIZES),
                            )}
                          >
                            {part}
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {hasOrigin && (
                  <div className={cn(showParts && "border-border border-t pt-6")}>
                    <OriginDetails
                      hint={vocabData.etymologyHint}
                      etymologyType={vocabData.etymologyType}
                      radical={vocabData.radical}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Memory Aids */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl tracking-tight">
            <Lightbulb className="text-primary size-5" />
            Memory Aids
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memoryAids.length > 0 ? (
            <>
              <div className="mb-6 space-y-4">
                {memoryAids.map((mnemonic, index) => (
                  <div
                    key={mnemonic.id}
                    className="border-border border-b pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-foreground mb-2">
                          <span className="font-display text-primary mr-2 text-lg font-bold tabular-nums">
                            {index + 1}.
                          </span>
                          &ldquo;{mnemonic.memoryAid}&rdquo;
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Saved by {mnemonic.usageCount} users • by{" "}
                          {mnemonic.createdByUsername}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Report this memory aid"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => openReport(mnemonic)}
                      >
                        <Flag className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {vocabData.memoryAidTotal > memoryAids.length && (
                  <Button
                    variant="outline"
                    onClick={() => setIsViewAllDialogOpen(true)}
                  >
                    View all ({vocabData.memoryAidTotal})
                  </Button>
                )}
                <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
                  <Plus className="size-4" />
                  Create my own
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              bare
              pose="peek"
              title="No memory aids yet"
              description="Be the first to write a hook that makes this one stick."
              action={
                <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
                  <Plus className="size-4" />
                  Create the first one
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <CreateMemoryAidDialog
        vocabItemId={vocabData.id}
        vocabItem={vocabData.vocabItem}
        open={isMemoryAidDialogOpen}
        onOpenChange={setIsMemoryAidDialogOpen}
      />

      <ViewAllMemoryAidsDialog
        vocabItem={vocabData.vocabItem}
        open={isViewAllDialogOpen}
        onOpenChange={setIsViewAllDialogOpen}
      />

      <ReportIssueDialog
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        subject={reportedAid ? reportedAid.memoryAid : vocabData.vocabItem}
        vocabItemId={vocabData.id}
        memoryAidId={reportedAid?.id ?? null}
      />
    </div>
  );
}

export default function DictionaryWordPage() {
  const params = useParams();
  const word = decodeURIComponent(params.word as string);

  return (
    <ErrorBoundary>
      {/* The word alone tells the skeleton whether to reserve a stroke-order
          column — see DictionaryWordLoading. */}
      <Suspense fallback={<DictionaryWordLoading word={word} />}>
        <DictionaryWordContent />
      </Suspense>
    </ErrorBoundary>
  );
}
