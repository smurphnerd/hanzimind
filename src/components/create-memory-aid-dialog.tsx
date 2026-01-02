"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const [memoryAidText, setMemoryAidText] = useState("");

  const createMemoryAidMutation = useMutation(
    orpc.vocab.createMemoryAid.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.vocab.get.queryKey({ input: { vocabItem } }),
        });
        setMemoryAidText("");
        onOpenChange(false);
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (memoryAidText.trim()) {
      createMemoryAidMutation.mutate({
        vocabItemId,
        memoryAid: memoryAidText.trim(),
      });
    }
  };

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
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Textarea
              placeholder="Enter your memory aid..."
              value={memoryAidText}
              onChange={(e) => setMemoryAidText(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          {createMemoryAidMutation.error && (
            <div className="mb-4 text-sm text-destructive">
              {createMemoryAidMutation.error.message}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !memoryAidText.trim() || createMemoryAidMutation.isPending
              }
            >
              {createMemoryAidMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
