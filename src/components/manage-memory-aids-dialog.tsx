"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [draft, setDraft] = useState("");

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
      onSuccess: () => {
        setDraft("");
        invalidate();
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Couldn't add that aid",
        ),
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
  const trimmed = draft.trim();

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
            <div
              key={aid.id}
              className={cn(
                "flex items-start gap-3 rounded-2xl border border-border p-3",
                aid.isDefault && "border-primary/40 bg-secondary/40",
              )}
            >
              <button
                type="button"
                disabled={busy}
                onClick={toggleDefault}
                aria-label={
                  aid.isDefault ? "Remove official pick" : "Make official pick"
                }
                aria-pressed={aid.isDefault}
                className={cn(
                  "mt-0.5 shrink-0 transition-colors disabled:opacity-50",
                  aid.isDefault
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                <Star
                  className={cn("size-5", aid.isDefault && "fill-current")}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  &ldquo;{aid.memoryAid}&rdquo;
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {aid.isDefault && (
                    <Badge className="bg-primary text-primary-foreground">
                      Official
                    </Badge>
                  )}
                  {!aid.isPublic && <Badge variant="secondary">Private</Badge>}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {aid.usageCount} saved • by {aid.createdByUsername}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed) return;
          createMutation.mutate({ vocabItemId, memoryAid: trimmed });
        }}
      >
        <Textarea
          value={draft}
          disabled={createMutation.isPending}
          placeholder="Add a curated memory aid…"
          className="min-h-20 resize-none"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!trimmed || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add aid
          </Button>
        </div>
      </form>
    </div>
  );
}
