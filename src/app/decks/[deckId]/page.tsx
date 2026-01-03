"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Play } from "lucide-react";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useORPC } from "@/lib/orpc.client";
import {
  DeckSettingsDialog,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { DeckDetailLoading } from "@/components/deck-detail-loading";
import { playAudio } from "@/lib/audio";

function DeckOverviewContent() {
  const params = useParams();
  const deckId = params.deckId as string;
  const orpc = useORPC();
  const [includeConstituents, setIncludeConstituents] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSettings, setSaveSettings] = useState<DeckSettings>({
    includeConstituents: false,
    readingEnabled: true,
    listeningEnabled: true,
    understandingEnabled: true,
    writingEnabled: true,
  });

  const { data: deck } = useSuspenseQuery(
    orpc.decks.getById.queryOptions({
      input: { deckId, includeConstituents },
    }),
  );

  const saveDeckMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success("Deck added to your study list!");
        setShowSaveDialog(false);
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to save deck",
        );
      },
    }),
  );

  const handleSaveDeck = () => {
    saveDeckMutation.mutate({
      deckId,
      ...saveSettings,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-6">
        <Link
          href="/decks"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4 mr-1" />
          Back to Decks
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">{deck.deckName}</h1>
          <p className="text-sm text-muted-foreground">
            Created by: @{deck.createdByUsername}
          </p>
        </div>
        <Button onClick={() => setShowSaveDialog(true)}>SAVE DECK</Button>
      </div>

      <DeckSettingsDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        settings={saveSettings}
        onSettingsChange={setSaveSettings}
        onSave={handleSaveDeck}
        isPending={saveDeckMutation.isPending}
        title="Add Deck to Study List"
        description="Configure your study settings for this deck."
        saveButtonText="Add to Study List"
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            {deck.description}
          </CardDescription>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Words in this Deck</h2>
          <div className="flex items-center space-x-2">
            <Switch
              id="include-constituents"
              checked={includeConstituents}
              onCheckedChange={setIncludeConstituents}
            />
            <Label htmlFor="include-constituents">
              Include constituent characters
            </Label>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Character</TableHead>
                  <TableHead className="w-[45%]">Translation</TableHead>
                  <TableHead className="w-[15%]">Audio</TableHead>
                  <TableHead className="w-[20%]">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deck.vocabItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => {
                      window.location.href = `/dictionary/${item.vocabItem}`;
                    }}
                  >
                    <TableCell className="font-medium text-lg">
                      {item.vocabItem}
                    </TableCell>
                    <TableCell>{item.translation}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(item.audioUrl);
                        }}
                      >
                        <Play className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.vocabType === "character"
                        ? "Char"
                        : item.vocabType === "compound"
                          ? "Word"
                          : item.vocabType}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DeckOverviewPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<DeckDetailLoading />}>
        <DeckOverviewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
