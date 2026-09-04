"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemoryAidCard } from "@/components/memory-aid-card";
import { Pagination } from "@/components/pagination";
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
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : memoryAids.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No memory aids found
            </div>
          ) : (
            <div className="space-y-3">
              {memoryAids.map((mnemonic, index) => (
                <MemoryAidCard
                  key={mnemonic.id}
                  marker={
                    <span className="font-display font-bold text-primary tabular-nums">
                      {(page - 1) * pageSize + index + 1}.
                    </span>
                  }
                  meta={
                    <span>
                      Saved by {mnemonic.usageCount} users • by{" "}
                      {mnemonic.createdByUsername}
                    </span>
                  }
                  action={
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
                  }
                >
                  {mnemonic.memoryAid}
                </MemoryAidCard>
              ))}
            </div>
          )}
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.memoryAidTotal ?? 0}
          onPageChange={setPage}
          disabled={isLoading}
          className="border-t border-border pt-4"
        />

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
