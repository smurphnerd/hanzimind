"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Play, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useORPC } from "@/lib/orpc.client";
import {
  DeckSettingsDialog,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { StudyLoading } from "@/components/study-loading";

function StudyContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [selectedDeck, setSelectedDeck] = useState<{
    id: string;
    settings: DeckSettings;
  } | null>(null);

  const { data } = useSuspenseQuery(
    orpc.decks.getUserDecks.queryOptions({
      input: { page: 1, perPage: 50 },
    }),
  );

  const updateSettingsMutation = useMutation(
    orpc.study.updateDeckSettings.mutationOptions({
      onSuccess: () => {
        toast.success("Deck settings updated!");
        setSelectedDeck(null);
        queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.queryKey({
            input: { page: 1, perPage: 50 },
          }),
        });
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to update settings",
        );
      },
    }),
  );

  const handleUpdateSettings = () => {
    if (!selectedDeck) return;

    updateSettingsMutation.mutate({
      deckId: selectedDeck.id,
      ...selectedDeck.settings,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="font-brush text-4xl text-primary brush-underline mb-2">
          My Study Decks
        </h1>
        <p className="text-muted-foreground">
          Manage your saved decks and their study settings
        </p>
      </div>

      {/* Section Divider */}
      <div className="divider-ornamental mb-8">
        <span className="medallion">学</span>
      </div>

      {data.decks.length === 0 ? (
        <Card className="ornament-corners">
          <CardContent className="py-16 text-center">
            <div className="mb-6">
              <div className="h-20 w-20 mx-auto rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center">
                <span className="font-brush text-4xl text-primary">空</span>
              </div>
            </div>
            <p className="text-muted-foreground mb-6 text-lg">
              You haven&apos;t added any decks to your study list yet.
            </p>
            <Button asChild size="lg">
              <Link href="/decks">
                <BookOpen className="size-5 mr-2" />
                Browse Decks
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.decks.map((deck) => (
            <Card key={deck.id} className="flex flex-col group relative overflow-hidden">
              {/* Lantern top decoration */}
              <div className="absolute inset-x-0 top-0 flex justify-center">
                <div className="h-2 w-12 rounded-b-full bg-gradient-to-b from-gold to-gold-bright opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>

              <CardHeader className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="mb-1 font-brush text-xl group-hover:text-vermillion transition-colors">
                      {deck.deckName}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      By @{deck.createdByUsername}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gold hover:text-primary"
                    onClick={() =>
                      setSelectedDeck({
                        id: deck.id,
                        settings: {
                          includeConstituents: deck.includeConstituents,
                          readingEnabled: deck.readingEnabled,
                          listeningEnabled: deck.listeningEnabled,
                          understandingEnabled: deck.understandingEnabled,
                          writingEnabled: deck.writingEnabled,
                        },
                      })
                    }
                  >
                    <Settings className="size-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {deck.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  {deck.readingEnabled && (
                    <Badge variant="outline" className="text-xs border-gold/50 text-primary">
                      Reading
                    </Badge>
                  )}
                  {deck.listeningEnabled && (
                    <Badge variant="outline" className="text-xs border-gold/50 text-primary">
                      Listening
                    </Badge>
                  )}
                  {deck.understandingEnabled && (
                    <Badge variant="outline" className="text-xs border-gold/50 text-primary">
                      Understanding
                    </Badge>
                  )}
                  {deck.writingEnabled && (
                    <Badge variant="outline" className="text-xs border-gold/50 text-primary">
                      Writing
                    </Badge>
                  )}
                  {deck.includeConstituents && (
                    <Badge variant="secondary" className="text-xs">
                      + Constituents
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="bg-gold/20 text-primary">
                    {deck.numLearners} learners
                  </Badge>
                </div>

                <div className="pt-2">
                  <Button asChild className="w-full" size="lg">
                    <Link href={`/study/${deck.id}`}>
                      <Play className="size-5 mr-2" />
                      Start Studying
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedDeck && (
        <DeckSettingsDialog
          open={!!selectedDeck}
          onOpenChange={(open) => !open && setSelectedDeck(null)}
          settings={selectedDeck.settings}
          onSettingsChange={(settings) =>
            setSelectedDeck({ ...selectedDeck, settings })
          }
          onSave={handleUpdateSettings}
          isPending={updateSettingsMutation.isPending}
          title="Update Study Settings"
          description="Modify your study preferences for this deck."
          saveButtonText="Update Settings"
        />
      )}
    </div>
  );
}

export default function StudyPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<StudyLoading />}>
        <StudyContent />
      </Suspense>
    </ErrorBoundary>
  );
}
