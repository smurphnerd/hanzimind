"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemoryAidForm } from "@/components/memory-aid-form";
import { useORPC } from "@/lib/orpc.client";

interface CreateMemoryAidDialogProps {
  vocabItemId: string;
  vocabItem: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateMemoryAidDialog({
  vocabItemId,
  vocabItem,
  open,
  onOpenChange,
}: CreateMemoryAidDialogProps) {
  const orpc = useORPC();
  const queryClient = useQueryClient();

  const createMemoryAidMutation = useMutation(
    orpc.vocab.createMemoryAid.mutationOptions({
      onSuccess: () => {
        // Not awaited: the dialog used to stay open until the entry had
        // refetched, which made a slow read look like a slow write and a failed
        // one look like the aid had not saved.
        void queryClient.invalidateQueries({
          queryKey: orpc.vocab.get.queryKey({ input: { vocabItem } }),
        });
        onOpenChange(false);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Memory Aid for {vocabItem}</DialogTitle>
          <DialogDescription>
            Write anything that helps you remember this word. This is for your
            personal use.
          </DialogDescription>
        </DialogHeader>
        <MemoryAidForm
          onSubmit={(memoryAid) =>
            createMemoryAidMutation.mutate({ vocabItemId, memoryAid })
          }
          isPending={createMemoryAidMutation.isPending}
          error={createMemoryAidMutation.error}
          submitLabel="Create"
          placeholder="Enter your memory aid..."
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
