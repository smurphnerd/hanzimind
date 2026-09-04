"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Layers,
  Plus,
  Search,
  Settings2,
  User,
  Users,
} from "lucide-react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { CompositionBar } from "@/components/composition-bar";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
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
  DEFAULT_DECK_SETTINGS,
  DeckSettingsDialog,
  SAVED_DECKS_INPUT,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { DeckGridSkeleton } from "@/components/decks-loading";
import { EmptyState } from "@/components/empty-state";
import { InlineStat } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { DeckDto } from "@/definitions/definitions";

const DECKS_PER_PAGE = 12;

type SelectedDeck = {
  id: string;
  deckName: string;
  /** Already in the study list, so the dialog is an edit rather than an add. */
  isSaved: boolean;
  settings: DeckSettings;
};

function DeckCard({
  deck,
  savedSettings,
  isSavedPending,
  onSelectDeck,
}: {
  deck: DeckDto;
  /** The learner's existing settings for this deck, or undefined if not saved. */
  savedSettings: DeckSettings | undefined;
  isSavedPending: boolean;
  onSelectDeck: (deck: SelectedDeck) => void;
}) {
  const isSaved = !!savedSettings;

  return (
    <Card className="group h-full gap-4">
      {/* An overlay link rather than a Button inside a Link: the old nesting was
          invalid HTML and needed preventDefault to keep the dialog usable. */}
      <Link
        href={`/decks/${deck.id}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="sr-only">{deck.deckName}</span>
      </Link>

      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl transition-colors group-hover:text-primary">
            {deck.deckName}
          </CardTitle>
          {isSaved && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 font-display text-xs font-bold text-success">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
        </div>
        <CardDescription className="line-clamp-2">
          {deck.description.trim() || "No description yet."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <InlineStat icon={<User className="size-4" />}>
            @{deck.createdByUsername}
          </InlineStat>
          <InlineStat icon={<Users className="size-4" />}>
            {deck.numLearners} {deck.numLearners === 1 ? "learner" : "learners"}
          </InlineStat>
          <InlineStat icon={<Layers className="size-4" />}>
            {deck.itemCount} {deck.itemCount === 1 ? "item" : "items"}
          </InlineStat>
        </div>

        <CompositionBar typeCounts={deck.typeCounts} legend />
      </CardContent>

      <CardFooter>
        <Button
          variant={isSaved ? "secondary" : "outline"}
          className="relative z-10 w-full"
          // Opening before the study list lands would seed the defaults and
          // overwrite settings the learner already has.
          disabled={isSavedPending}
          onClick={() =>
            onSelectDeck({
              id: deck.id,
              deckName: deck.deckName,
              isSaved,
              settings: savedSettings ?? DEFAULT_DECK_SETTINGS,
            })
          }
        >
          {isSaved ? (
            <Settings2 className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {isSaved ? "Study Settings" : "Save to Study List"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function DeckGrid({
  search,
  page,
  onPageChange,
  onSelectDeck,
}: {
  search: string;
  page: number;
  onPageChange: (page: number) => void;
  onSelectDeck: (deck: SelectedDeck) => void;
}) {
  const orpc = useORPC();
  // useQuery (not useSuspenseQuery) so searching never collapses the page into
  // a Suspense fallback; keepPreviousData holds the old results on screen while
  // the new ones load.
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    ...orpc.decks.browse.queryOptions({
      input: { search: search || undefined, page, perPage: DECKS_PER_PAGE },
    }),
    placeholderData: keepPreviousData,
  });

  const {
    data: savedDecks,
    isPending: isSavedPending,
    isError: isSavedError,
  } = useQuery(
    orpc.decks.getUserDecks.queryOptions({ input: SAVED_DECKS_INPUT }),
  );

  const savedSettings = useMemo(() => {
    const byDeckId = new Map<string, DeckSettings>();

    for (const deck of savedDecks?.decks ?? []) {
      byDeckId.set(deck.id, {
        readingEnabled: deck.readingEnabled,
        listeningEnabled: deck.listeningEnabled,
        understandingEnabled: deck.understandingEnabled,
        writingEnabled: deck.writingEnabled,
      });
    }

    return byDeckId;
  }, [savedDecks]);

  if (isPending) return <DeckGridSkeleton />;

  if (isError) {
    return (
      <EmptyState
        pose="peek"
        title="Couldn't load decks"
        description={
          error instanceof Error && /unauthorized/i.test(error.message)
            ? "Please sign in to browse decks."
            : "Something went wrong on our end. Please try again."
        }
      />
    );
  }

  if (data.decks.length === 0) {
    return (
      <EmptyState
        title={search ? `No decks match “${search}”` : "No decks yet"}
        description={
          search
            ? "Try a different word, or plant a deck of your own."
            : "Nothing has been planted here yet — be the first."
        }
        action={
          <Button asChild>
            <Link href="/decks/new">
              <Plus className="size-4" />
              Create Deck
            </Link>
          </Button>
        }
      />
    );
  }

  const { total } = data.pagingInfo;

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-6 transition-opacity md:grid-cols-2",
          isPlaceholderData && "opacity-60",
        )}
      >
        {data.decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            savedSettings={savedSettings.get(deck.id)}
            isSavedPending={isSavedPending || isSavedError}
            onSelectDeck={onSelectDeck}
          />
        ))}
      </div>

      <Pagination
        page={page}
        pageSize={DECKS_PER_PAGE}
        total={total}
        onPageChange={onPageChange}
        className="mt-8"
      />
    </>
  );
}

function DecksContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedDeck, setSelectedDeck] = useState<SelectedDeck | null>(null);

  const addDeckMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success(
          selectedDeck?.isSaved
            ? "Study settings updated!"
            : "Deck added to your study list!",
        );
        setSelectedDeck(null);
        // Otherwise /study keeps showing a stale list for the 60s staleTime, and
        // this page's own "Saved" markers go stale with it.
        void queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.key(),
        });
        // Progress is computed against the enabled study types, so switching one
        // off rebuckets every item. The deckIds key is unchanged, which means
        // the stale entry would otherwise be served straight from cache.
        void queryClient.invalidateQueries({
          queryKey: orpc.study.deckProgress.key(),
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
      setPage(1);
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
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Vocabulary Decks"
        description="Browse what the community has planted, then add a deck to your garden."
        action={
          <Button size="lg" asChild>
            <Link href="/decks/new">
              <Plus className="size-5" />
              Create Deck
            </Link>
          </Button>
        }
      />

      <div className="relative mb-8">
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          aria-label="Search decks"
          placeholder="Search decks..."
          className="h-12 pl-12 text-base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <h2 className="mb-6 font-display text-2xl font-bold tracking-tight text-foreground">
        {activeSearch ? `Results for “${activeSearch}”` : "Most Popular"}
      </h2>

      <DeckGrid
        search={activeSearch}
        page={page}
        onPageChange={setPage}
        onSelectDeck={setSelectedDeck}
      />

      {selectedDeck && (
        <DeckSettingsDialog
          open
          onOpenChange={(open) => !open && setSelectedDeck(null)}
          settings={selectedDeck.settings}
          onSettingsChange={(settings) =>
            setSelectedDeck({ ...selectedDeck, settings })
          }
          onSave={handleSaveDeck}
          isPending={addDeckMutation.isPending}
          title={
            selectedDeck.isSaved
              ? "Update Study Settings"
              : "Add Deck to Study List"
          }
          description={`Choose how you want to study “${selectedDeck.deckName}”.`}
          saveButtonText={
            selectedDeck.isSaved ? "Save Settings" : "Add to Study List"
          }
        />
      )}
    </div>
  );
}

export default function DecksPage() {
  return <DecksContent />;
}
