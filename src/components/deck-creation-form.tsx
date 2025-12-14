"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useORPC } from "@/lib/orpc.client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

export function DeckCreationForm() {
  const orpc = useORPC();
  const router = useRouter();
  const [deckName, setDeckName] = useState("");
  const [description, setDescription] = useState("");
  const [vocabList, setVocabList] = useState("");

  const createDeckMutation = useMutation(
    orpc.decks.create.mutationOptions({
      onSuccess: () => {
        toast.success("Deck created!");
        router.refresh();
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to create deck",
        );
      },
    }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!deckName.trim() || !description.trim()) {
      toast.error("Deck name and description are required");
      return;
    }

    // Split vocab list by newlines and filter out empty strings
    const vocabArray = vocabList
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    createDeckMutation.mutate({
      deckName: deckName.trim(),
      description: description.trim(),
      vocabList: vocabArray,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="deckName">Deck Name</Label>
        <Input
          id="deckName"
          placeholder="Enter deck name"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Enter deck description"
          className="resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vocabList">Vocabulary Items</Label>
        <Textarea
          id="vocabList"
          placeholder="Enter vocabulary items (one per line)&#10;Example:&#10;你好&#10;谢谢&#10;再见"
          className="min-h-[200px] font-mono"
          value={vocabList}
          onChange={(e) => setVocabList(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Enter one vocabulary item per line. Each item will be automatically
          broken down into components.
        </p>
      </div>

      <Button type="submit" disabled={createDeckMutation.isPending}>
        {createDeckMutation.isPending ? "Creating..." : "Create Deck"}
      </Button>
    </form>
  );
}
