"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Volume2, Flag } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import { useParams, useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { DictionaryWordLoading } from "@/components/dictionary-word-loading";
import { CreateMemoryAidDialog } from "@/components/create-memory-aid-dialog";
import { ViewAllMemoryAidsDialog } from "@/components/view-all-memory-aids-dialog";
import { playAudio } from "@/lib/audio";

function DictionaryWordContent() {
  const orpc = useORPC();
  const params = useParams();
  const router = useRouter();
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
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex items-center gap-6">
          {/* Characters and Pinyin aligned vertically */}
          <div className="flex gap-2">
            {vocabData.vocabItem.split("").map((char, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className="text-6xl font-bold">{char}</div>
                <div className="text-xl text-muted-foreground">
                  {vocabData.pinyin.split(" ")[index] || ""}
                </div>
              </div>
            ))}
          </div>

          {/* Play Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => playAudio(vocabData.audioUrl)}
          >
            <Volume2 className="mr-2 h-4 w-4" />
            Play
          </Button>
        </div>
      </Card>

      {/* Core Info - Definition */}
      <Card className="mb-6 p-6">
        <h2 className="mb-2 text-lg font-semibold">Definition</h2>
        <p className="mb-2 text-foreground">{vocabData.translation}</p>
        <Link
          href="#"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          (Report/Suggest Improvement)
        </Link>
      </Card>

      {/* Visuals - Two Column Layout */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stroke Order Animation */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Stroke Order Animation</h2>
          <div className="flex aspect-square items-center justify-center rounded-md bg-muted">
            <span className="text-sm text-muted-foreground">
              [SVG ANIMATION]
            </span>
          </div>
        </Card>

        {/* Decomposition */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Decomposition</h2>
          {vocabData.constituents && vocabData.constituents.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-4 py-8">
              {vocabData.constituents.map((component, index) => (
                <div key={index} className="flex items-center gap-4">
                  {index > 0 && (
                    <span className="text-2xl text-muted-foreground">+</span>
                  )}
                  <Link
                    href={`/dictionary/${encodeURIComponent(component)}`}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                  >
                    <div className="rounded-md border-2 border-border p-4 text-4xl font-bold transition-colors hover:border-primary">
                      {component}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No decomposition available
            </p>
          )}
        </Card>
      </div>

      {/* Memory Aids */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Memory Aids</h2>
        {vocabData.memoryAids && vocabData.memoryAids.length > 0 ? (
          <>
            <div className="mb-4 space-y-4">
              {vocabData.memoryAids.map((mnemonic, index) => (
                <div
                  key={mnemonic.id}
                  className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="mb-2 text-foreground">
                        {index + 1}. &ldquo;{mnemonic.memoryAid}&rdquo;
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Saved by {mnemonic.usageCount} users • by{" "}
                        {mnemonic.createdByUsername}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
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
                + Create My Own
              </Button>
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="mb-4 text-muted-foreground">
              No memory aids yet for this word
            </p>
            <Button onClick={() => setIsMemoryAidDialogOpen(true)}>
              + Create the First One
            </Button>
          </div>
        )}
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
