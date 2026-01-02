"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Flag, ChevronLeft, ChevronRight } from "lucide-react";
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
  const hasMore = memoryAids.length === pageSize;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Memory Aids for {vocabItem}</DialogTitle>
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
            <div className="space-y-4">
              {memoryAids.map((mnemonic, index) => (
                <div
                  key={mnemonic.id}
                  className="rounded-md border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="mb-2 text-foreground">
                        {(page - 1) * pageSize + index + 1}. &ldquo;
                        {mnemonic.memoryAid}&rdquo;
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
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore || isLoading}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
