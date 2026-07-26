"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Volume2, Flag, Plus, Lightbulb } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import { useParams } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { DictionaryWordLoading } from "@/components/dictionary-word-loading";
import { CreateMemoryAidDialog } from "@/components/create-memory-aid-dialog";
import { ViewAllMemoryAidsDialog } from "@/components/view-all-memory-aids-dialog";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { CharacterStrokes } from "@/components/character-strokes";
import { Mika } from "@/components/mika";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { cn } from "@/lib/utils";

function DictionaryWordContent() {
  const orpc = useORPC();
  const params = useParams();
  const word = decodeURIComponent(params.word as string);
  const [isMemoryAidDialogOpen, setIsMemoryAidDialogOpen] = useState(false);
  const [isViewAllDialogOpen, setIsViewAllDialogOpen] = useState(false);

  const { data: vocabData } = useSuspenseQuery(
    orpc.vocab.get.queryOptions({
      input: {
        vocabItem: word,
        memoryAidPage: 1,
        memoryAidPageSize: 10,
      },
    }),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Back Link */}
      <Link
        href="/dictionary"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Dictionary
      </Link>

      {/* Header Card */}
      <Card className="mb-6">
        <CardContent className="pt-8 pb-6">
          <div className="flex items-center gap-6">
            <div
              className={cn(
                "flex h-28 w-28 items-center justify-center rounded-2xl",
                vocabTypeMeta(vocabData.vocabType).softClass,
              )}
            >
              <span className="hanzi text-foreground text-6xl">
                {vocabData.vocabItem}
              </span>
            </div>
            <div className="flex flex-col items-start gap-3">
              <ItemTypeBadge type={vocabData.vocabType} />
              <div className="hanzi text-accent text-3xl">
                {vocabData.pinyin}
              </div>
              <Button
                variant="outline"
                // audioUrl is "" when TTS generation failed; new Audio("") makes
                // play() reject with NotSupportedError, so guard and catch.
                disabled={!vocabData.audioUrl}
                onClick={() => {
                  if (!vocabData.audioUrl) return;
                  const audio = new Audio(vocabData.audioUrl);
                  audio
                    .play()
                    .catch(() => toast.error("Couldn't play audio"));
                }}
              >
                <Volume2 className="mr-2 h-4 w-4" />
                Play Audio
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Definition Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold tracking-tight">
            Definition
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg text-foreground mb-3">{vocabData.translation}</p>
          <Link
            href="#"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Flag className="h-3 w-3" />
            Report/Suggest Improvement
          </Link>
        </CardContent>
      </Card>

      {/* Visuals - Two Column Layout */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stroke Order Animation */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl font-bold tracking-tight">
              Stroke Order
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vocabData.strokes && vocabData.strokes.length > 0 ? (
              <CharacterStrokes
                strokes={vocabData.strokes ?? []}
                strokeMedians={vocabData.strokeMedians ?? undefined}
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
                <span className="text-sm text-muted-foreground">
                  No stroke data available
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Decomposition */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl font-bold tracking-tight">
              Decomposition
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vocabData.constituents && vocabData.constituents.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-4 py-6">
                {vocabData.constituents.map((component, index) => (
                  <div key={index} className="flex items-center gap-4">
                    {index > 0 && (
                      <span className="text-2xl text-muted-foreground">+</span>
                    )}
                    <Link
                      href={`/dictionary/${encodeURIComponent(component)}`}
                      className="group"
                    >
                      <div className="hanzi bg-type-component-soft text-type-component border border-type-component/30 rounded-xl flex h-20 w-20 items-center justify-center text-4xl transition-all group-hover:border-type-component group-hover:shadow-md">
                        {component}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Mika pose="sleep" size={64} />
                <p className="text-muted-foreground">
                  No decomposition available
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Memory Aids */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold tracking-tight flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Memory Aids
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vocabData.memoryAids && vocabData.memoryAids.length > 0 ? (
            <>
              <div className="mb-6 space-y-4">
                {vocabData.memoryAids.map((mnemonic, index) => (
                  <div
                    key={mnemonic.id}
                    className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="mb-2 text-foreground">
                          <span className="font-display text-lg font-bold text-primary mr-2">
                            {index + 1}.
                          </span>
                          &ldquo;{mnemonic.memoryAid}&rdquo;
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Saved by {mnemonic.usageCount} users • by{" "}
                          {mnemonic.createdByUsername}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsViewAllDialogOpen(true)}
                >
                  View All ({vocabData.memoryAidTotal})
                </Button>
                <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
                  <Plus className="size-4 mr-2" />
                  Create My Own
                </Button>
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Lightbulb className="h-8 w-8 text-primary" />
              </div>
              <p className="mb-6 text-muted-foreground">
                No memory aids yet for this word
              </p>
              <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
                <Plus className="size-4 mr-2" />
                Create the First One
              </Button>
            </div>
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
    </div>
  );
}

export default function DictionaryWordPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<DictionaryWordLoading />}>
        <DictionaryWordContent />
      </Suspense>
    </ErrorBoundary>
  );
}
