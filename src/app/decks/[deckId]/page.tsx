"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Play, BookOpen } from "lucide-react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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
import { ItemTypeBadge } from "@/components/item-type-badge";

function DeckOverviewContent() {
  const params = useParams();
  const deckId = params.deckId as string;
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [includeConstituents, setIncludeConstituents] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSettings, setSaveSettings] = useState<DeckSettings>({
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
        void queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.key(),
        });
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
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ChevronLeft className="size-4 mr-1" />
          Back to Decks
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground mb-2">
            {deck.deckName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Created by: @{deck.createdByUsername}
          </p>
        </div>
        <Button size="lg" onClick={() => setShowSaveDialog(true)}>
          <BookOpen className="size-5 mr-2" />
          Save Deck
        </Button>
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
          <CardTitle className="font-display text-xl font-bold">
            Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            {deck.description}
          </CardDescription>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Words in this Deck
          </h2>
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
                  <TableHead className="w-[20%] font-display text-muted-foreground">
                    Character
                  </TableHead>
                  <TableHead className="w-[45%] font-display text-muted-foreground">
                    Translation
                  </TableHead>
                  <TableHead className="w-[15%] font-display text-muted-foreground">
                    Audio
                  </TableHead>
                  <TableHead className="w-[20%] font-display text-muted-foreground">
                    Type
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deck.vocabItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer border-border hover:bg-muted transition-colors"
                    onClick={() => {
                      window.location.href = `/dictionary/${encodeURIComponent(
                        item.vocabItem,
                      )}`;
                    }}
                  >
                    <TableCell className="hanzi text-xl text-foreground">
                      {item.vocabItem}
                    </TableCell>
                    <TableCell>{item.translation}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement audio playback
                          console.log("Play audio for:", item.vocabItem);
                        }}
                      >
                        <Play className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <ItemTypeBadge type={item.vocabType} short />
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
