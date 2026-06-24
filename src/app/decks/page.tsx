"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useORPC } from "@/lib/orpc.client";
import {
  DeckSettingsDialog,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { DecksLoading } from "@/components/decks-loading";

function DecksContent() {
  const orpc = useORPC();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedDeck, setSelectedDeck] = useState<{
    id: string;
    settings: DeckSettings;
  } | null>(null);

  const { data } = useSuspenseQuery(
    orpc.decks.browse.queryOptions({
      input: { search: activeSearch || undefined, page: 1, perPage: 50 },
    }),
  );

  const addDeckMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success("Deck added to your study list!");
        setSelectedDeck(null);
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to add deck",
        );
      },
    }),
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setActiveSearch(search);
    }
  };

  const handleSaveDeck = () => {
    if (!selectedDeck) return;

    addDeckMutation.mutate({
      deckId: selectedDeck.id,
      ...selectedDeck.settings,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Page Heading */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-brush text-4xl text-primary brush-underline">
          Vocabulary Decks
        </h1>
        <Link href="/decks/new">
          <Button size="lg">
            <Plus className="size-5 mr-1" />
            Create Deck
          </Button>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative mb-10">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gold" />
        <Input
          type="text"
          placeholder="Search Decks..."
          className="pl-12 h-12 text-base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Section Divider */}
      <div className="divider-ornamental mb-8">
        <span className="medallion">牌</span>
      </div>

      {/* Most Popular Section */}
      <div>
        <h2 className="font-brush text-2xl text-primary mb-6">Most Popular</h2>

        {/* Grid of Deck Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.decks.map((deck) => (
            <Link key={deck.id} href={`/decks/${deck.id}`}>
              <Card className="h-full cursor-pointer group relative overflow-hidden">
                {/* Lantern top decoration */}
                <div className="absolute inset-x-0 top-0 flex justify-center">
                  <div className="h-2 w-12 rounded-b-full bg-gradient-to-b from-gold to-gold-bright opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>

                <CardHeader className="pt-6">
                  <CardTitle className="font-brush text-xl group-hover:text-vermillion transition-colors">
                    {deck.deckName}
                  </CardTitle>
                  <CardDescription>
                    By: @{deck.createdByUsername}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1" />
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedDeck({
                        id: deck.id,
                        settings: {
                          includeConstituents: false,
                          readingEnabled: true,
                          listeningEnabled: true,
                          understandingEnabled: true,
                          writingEnabled: true,
                        },
                      });
                    }}
                  >
                    <Plus className="size-4 mr-1" />
                    Save to Study List
                  </Button>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {selectedDeck && (
        <DeckSettingsDialog
          open={!!selectedDeck}
          onOpenChange={(open) => !open && setSelectedDeck(null)}
          settings={selectedDeck.settings}
          onSettingsChange={(settings) =>
            setSelectedDeck({ ...selectedDeck, settings })
          }
          onSave={handleSaveDeck}
          isPending={addDeckMutation.isPending}
          title="Add Deck to Study List"
          description="Configure your study settings for this deck."
          saveButtonText="Add to Study List"
        />
      )}
    </div>
  );
}

export default function DecksPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<DecksLoading />}>
        <DecksContent />
      </Suspense>
    </ErrorBoundary>
  );
}
