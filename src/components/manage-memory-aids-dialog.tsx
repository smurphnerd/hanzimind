"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemoryAidCard } from "@/components/memory-aid-card";
import { MemoryAidForm } from "@/components/memory-aid-form";
import { useORPC } from "@/lib/orpc.client";
import { cn } from "@/lib/utils";

interface ManageMemoryAidsDialogProps {
  /** The item whose aids are being managed. Null keeps the dialog closed. */
  item: { id: string; vocabItem: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageMemoryAidsDialog({
  item,
  open,
  onOpenChange,
}: ManageMemoryAidsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold tracking-tight">
            Memory aids{" "}
            {item && (
              <span className="hanzi ml-1 text-primary">{item.vocabItem}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            Star one as the official pick — it shows first in the dictionary and
            on the study card until a learner writes their own.
          </DialogDescription>
        </DialogHeader>

        {/* Remount per item so the list and the draft reset on each open. */}
        {item && <ManageBody key={item.id} vocabItemId={item.id} />}
      </DialogContent>
    </Dialog>
  );
}

function ManageBody({ vocabItemId }: { vocabItemId: string }) {
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const listOptions = orpc.admin.listMemoryAids.queryOptions({
    input: { vocabItemId },
  });
  const { data, isPending, isError } = useQuery(listOptions);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    // The dictionary reads the same star, so keep it from going stale too.
    void queryClient.invalidateQueries({ queryKey: orpc.vocab.get.key() });
  };

  const createMutation = useMutation(
    orpc.admin.createMemoryAid.mutationOptions({
      // The form clears its own draft, and reports the failure under the field
      // rather than in a toast that is gone by the time the admin looks back.
      onSuccess: invalidate,
    }),
  );

  const setDefaultMutation = useMutation(
    orpc.admin.setDefaultMemoryAid.mutationOptions({
      onSuccess: invalidate,
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Couldn't update the star",
        ),
    }),
  );

  const busy = createMutation.isPending || setDefaultMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {isPending &&
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}

        {isError && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the aids for this glyph.
          </p>
        )}

        {data && data.items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No memory aids yet. Add the first curated one below.
          </p>
        )}

        {data?.items.map((aid) => {
          const toggleDefault = () =>
            setDefaultMutation.mutate({
              vocabItemId,
              // Clicking the current star clears it.
              memoryAidId: aid.isDefault ? null : aid.id,
            });

          return (
            <MemoryAidCard
              key={aid.id}
              highlighted={aid.isDefault}
              marker={
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={toggleDefault}
                  aria-label={
                    aid.isDefault
                      ? "Remove official pick"
                      : "Make official pick"
                  }
                  aria-pressed={aid.isDefault}
                  // Down from the icon size's 40px, which would out-weigh a
                  // three-line card, but still a real target rather than the
                  // bare 20px glyph this replaced.
                  className={cn(
                    "size-8",
                    aid.isDefault
                      ? "text-primary"
                      : "text-muted-foreground hover:text-primary",
                  )}
                >
                  <Star
                    className={cn("size-5", aid.isDefault && "fill-current")}
                  />
                </Button>
              }
              meta={
                <>
                  {aid.isDefault && <Badge>Official</Badge>}
                  {!aid.isPublic && <Badge variant="secondary">Private</Badge>}
                  <span className="tabular-nums">
                    {aid.usageCount} saved • by {aid.createdByUsername}
                  </span>
                </>
              }
            >
              {aid.memoryAid}
            </MemoryAidCard>
          );
        })}
      </div>

      <MemoryAidForm
        onSubmit={(memoryAid) =>
          createMutation.mutate({ vocabItemId, memoryAid })
        }
        isPending={createMutation.isPending}
        error={createMutation.error}
        submitLabel="Add aid"
        placeholder="Add a curated memory aid…"
      />
    </div>
  );
}
