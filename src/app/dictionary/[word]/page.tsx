"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Volume2, Flag, Plus, Lightbulb } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import { useParams } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { DictionaryWordLoading } from "@/components/dictionary-word-loading";
import { CreateMemoryAidDialog } from "@/components/create-memory-aid-dialog";
import { ViewAllMemoryAidsDialog } from "@/components/view-all-memory-aids-dialog";

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
      <Card className="mb-6 relative overflow-hidden ornament-corners">
        {/* Decorative top accent */}
        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-primary via-vermillion to-primary" />
        <div className="absolute inset-x-0 top-2 h-0.5 bg-gold" />

        <CardContent className="pt-8 pb-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="h-28 w-28 rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center shadow-lg">
                <span className="font-brush text-6xl text-primary">{vocabData.vocabItem}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="font-brush text-3xl text-gold">
                {vocabData.pinyin}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const audio = new Audio(vocabData.audioUrl);
                  audio.play();
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
          <CardTitle className="font-brush text-xl">Definition</CardTitle>
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

      {/* Section Divider */}
      <div className="divider-ornamental mb-6">
        <span className="medallion">画</span>
      </div>

      {/* Visuals - Two Column Layout */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stroke Order Animation */}
        <Card>
          <CardHeader>
            <CardTitle className="font-brush text-xl">Stroke Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-gold/30 bg-cream">
              <span className="text-sm text-muted-foreground">
                [SVG ANIMATION]
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Decomposition */}
        <Card>
          <CardHeader>
            <CardTitle className="font-brush text-xl">Decomposition</CardTitle>
          </CardHeader>
          <CardContent>
            {vocabData.constituents && vocabData.constituents.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-4 py-6">
                {vocabData.constituents.map((component, index) => (
                  <div key={index} className="flex items-center gap-4">
                    {index > 0 && (
                      <span className="text-2xl text-gold">+</span>
                    )}
                    <Link
                      href={`/dictionary/${encodeURIComponent(component)}`}
                      className="group"
                    >
                      <div className="h-20 w-20 rounded-lg border-2 border-gold/50 bg-rice-paper flex items-center justify-center text-4xl font-brush text-primary transition-all group-hover:border-gold group-hover:shadow-md">
                        {component}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="h-16 w-16 mx-auto rounded-full border-2 border-gold/30 bg-rice-paper flex items-center justify-center mb-3">
                  <span className="font-brush text-2xl text-muted-foreground">—</span>
                </div>
                <p className="text-muted-foreground">No decomposition available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section Divider */}
      <div className="divider-ornamental mb-6">
        <span className="medallion">记</span>
      </div>

      {/* Memory Aids */}
      <Card className="ornament-corners">
        <CardHeader>
          <CardTitle className="font-brush text-xl flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-gold" />
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
                    className="border-b border-gold/20 pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="mb-2 text-foreground">
                          <span className="font-brush text-lg text-gold mr-2">{index + 1}.</span>
                          &ldquo;{mnemonic.memoryAid}&rdquo;
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Saved by {mnemonic.usageCount} users • by{" "}
                          {mnemonic.createdByUsername}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
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
                  View All ({vocabData.memoryAids.length})
                </Button>
                <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
                  <Plus className="size-4 mr-2" />
                  Create My Own
                </Button>
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <div className="h-16 w-16 mx-auto rounded-full border-3 border-gold/50 bg-rice-paper flex items-center justify-center mb-4">
                <Lightbulb className="h-8 w-8 text-gold" />
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
