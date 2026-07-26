"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";

function DeckGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="h-full">
          <CardHeader className="gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="flex-1" />
          <CardFooter>
            <Skeleton className="h-10 w-full rounded-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function DeckGrid({
  search,
  onSelectDeck,
}: {
  search: string;
  onSelectDeck: (deck: { id: string; settings: DeckSettings }) => void;
}) {
  const orpc = useORPC();
  // useQuery (not useSuspenseQuery) so searching never collapses the page into
  // a Suspense fallback; keepPreviousData holds the old results on screen while
  // the new ones load.
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    ...orpc.decks.browse.queryOptions({
      input: { search: search || undefined, page: 1, perPage: 50 },
    }),
    placeholderData: keepPreviousData,
  });

  if (isPending) return <DeckGridSkeleton />;

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            {error instanceof Error && /unauthorized/i.test(error.message)
              ? "Please sign in to browse decks."
              : "Couldn't load decks. Please try again."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.decks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            {search
              ? `No decks match “${search}”.`
              : "No decks yet — create the first one!"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 gap-6 transition-opacity md:grid-cols-2 ${
        isPlaceholderData ? "opacity-60" : ""
      }`}
    >
      {data.decks.map((deck) => (
        <Link key={deck.id} href={`/decks/${deck.id}`}>
          <Card className="group h-full cursor-pointer">
            <CardHeader>
              <CardTitle className="font-display text-xl font-bold transition-colors group-hover:text-primary">
                {deck.deckName}
              </CardTitle>
              <CardDescription>By: @{deck.createdByUsername}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1" />
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.preventDefault();
                  onSelectDeck({
                    id: deck.id,
                    settings: {
                      readingEnabled: true,
                      listeningEnabled: true,
                      understandingEnabled: true,
                      writingEnabled: true,
                    },
                  });
                }}
              >
                <Plus className="mr-1 size-4" />
                Save to Study List
              </Button>
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function DecksContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedDeck, setSelectedDeck] = useState<{
    id: string;
    settings: DeckSettings;
  } | null>(null);

  const addDeckMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success("Deck added to your study list!");
        setSelectedDeck(null);
        // Otherwise /study keeps showing a stale list for the 60s staleTime.
        void queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.key(),
        });
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
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
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
      <div className="border-border border-t mb-8" />

      {/* Deck results */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-6">
          {activeSearch ? `Results for “${activeSearch}”` : "Most Popular"}
        </h2>

        <DeckGrid search={activeSearch} onSelectDeck={setSelectedDeck} />
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
