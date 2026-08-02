"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Flag, Lightbulb, Plus, Star } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import { ErrorBoundary } from "@/components/error-boundary";
import { DictionaryWordLoading } from "@/components/dictionary-word-loading";
import { CreateMemoryAidDialog } from "@/components/create-memory-aid-dialog";
import { ViewAllMemoryAidsDialog } from "@/components/view-all-memory-aids-dialog";
import { ReportIssueDialog } from "@/components/report-issue-dialog";
import { VocabEntryDetail } from "@/components/vocab-entry";
import { EmptyState } from "@/components/empty-state";
import type { MemoryAidDto } from "@/definitions/definitions";
import { cn } from "@/lib/utils";

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

  const memoryAids = vocabData.memoryAids ?? [];

  const openReport = (aid: MemoryAidDto | null) => {
    setReportedAid(aid);
    setIsReportOpen(true);
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/dictionary"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        Back to Dictionary
      </Link>

      <VocabEntryDetail
        entry={vocabData}
        className="mb-6"
        definitionFooter={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 text-muted-foreground hover:text-primary"
            onClick={() => openReport(null)}
          >
            <Flag className="size-3.5" />
            Report or suggest an improvement
          </Button>
        }
      />

      {/* Memory Aids */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl tracking-tight">
            <Lightbulb className="size-5 text-primary" />
            Memory Aids
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memoryAids.length > 0 ? (
            <>
              <div className="mb-6 space-y-4">
                {memoryAids.map((mnemonic, index) => {
                  const isDefault =
                    mnemonic.id === vocabData.defaultMemoryAidId;
                  return (
                    <div
                      key={mnemonic.id}
                      className={cn(
                        "border-b border-border pb-4 last:border-b-0 last:pb-0",
                        isDefault &&
                          "-mx-3 rounded-2xl border-b-0 bg-secondary/40 px-3 py-3",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="mb-2 text-foreground">
                            {isDefault ? (
                              <span className="mr-2 inline-flex translate-y-0.5 text-primary">
                                <Star className="size-5 fill-current" />
                              </span>
                            ) : (
                              <span className="mr-2 font-display text-lg font-bold text-primary tabular-nums">
                                {index + 1}.
                              </span>
                            )}
                            &ldquo;{mnemonic.memoryAid}&rdquo;
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {isDefault ? (
                              <span className="font-display font-bold text-primary">
                                Official pick
                              </span>
                            ) : (
                              <>Saved by {mnemonic.usageCount} users</>
                            )}{" "}
                            • by {mnemonic.createdByUsername}
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
                  );
                })}
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
