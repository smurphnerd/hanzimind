"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportIssueDialog } from "@/components/report-issue-dialog";
import type { MemoryAidDto } from "@/definitions/definitions";
import { useORPC } from "@/lib/orpc.client";

interface ViewAllMemoryAidsDialogProps {
  vocabItem: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewAllMemoryAidsDialog({
  vocabItem,
  open,
  onOpenChange,
}: ViewAllMemoryAidsDialogProps) {
  const orpc = useORPC();
  const [page, setPage] = useState(1);
  const [isReportOpen, setIsReportOpen] = useState(false);
  // Kept after the dialog closes so its contents don't blank out mid-animation.
  const [reportedAid, setReportedAid] = useState<MemoryAidDto | null>(null);
  const pageSize = 20;

  const { data, isLoading } = useQuery(
    orpc.vocab.get.queryOptions({
      input: {
        vocabItem,
        memoryAidPage: page,
        memoryAidPageSize: pageSize,
      },
      enabled: open,
    }),
  );

  const memoryAids = data?.memoryAids ?? [];
  // The response carries an exact total; inferring "there is more" from a full
  // page offered a Next button onto an empty page whenever the count landed on
  // an exact multiple of pageSize.
  const totalPages = Math.max(
    1,
    Math.ceil((data?.memoryAidTotal ?? 0) / pageSize),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold tracking-tight">
            Memory aids for <span className="hanzi">{vocabItem}</span>
          </DialogTitle>
          <DialogDescription>
            Community-contributed memory aids to help remember this word
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-muted-foreground py-8 text-center">
              Loading...
            </div>
          ) : memoryAids.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No memory aids found
            </div>
          ) : (
            <div className="space-y-3">
              {memoryAids.map((mnemonic, index) => (
                <div
                  key={mnemonic.id}
                  className="border-border rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-foreground mb-2">
                        <span className="font-display text-primary mr-2 font-bold tabular-nums">
                          {(page - 1) * pageSize + index + 1}.
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
                      onClick={() => {
                        setReportedAid(mnemonic);
                        setIsReportOpen(true);
                      }}
                    >
                      <Flag className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-border flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-muted-foreground font-display text-sm font-bold tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || isLoading}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Nested inside the content so Radix stacks the two dismissable layers
            in the right order — a click in the report dialog must not be read
            as a click outside this one. */}
        <ReportIssueDialog
          open={isReportOpen}
          onOpenChange={setIsReportOpen}
          subject={reportedAid?.memoryAid ?? ""}
          vocabItemId={data?.id ?? null}
          memoryAidId={reportedAid?.id ?? null}
        />
      </DialogContent>
    </Dialog>
  );
}
