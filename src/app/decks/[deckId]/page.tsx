"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Layers,
  List,
  Network,
  User,
  Users,
  Volume2,
} from "lucide-react";
import {
  useSuspenseQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { CompositionBar } from "@/components/composition-bar";
import { COMPOSITION_ORDER } from "@/lib/deck-composition";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useORPC } from "@/lib/orpc.client";
import {
  DEFAULT_DECK_SETTINGS,
  DeckSettingsDialog,
  SAVED_DECKS_INPUT,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { authClient } from "@/lib/authClient";
import { useHydrated } from "@/lib/use-hydrated";
import { DeckDetailLoading } from "@/components/deck-detail-loading";
import { DeckGraphPanel } from "@/components/deck-graph-panel";
import {
  SegmentedTabsList,
  type SegmentedOption,
} from "@/components/segmented-toggle";
import { EmptyState } from "@/components/empty-state";
import { InlineStat } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { cn } from "@/lib/utils";
import type {
  DeckVocabItemSummaryDto,
  VocabType,
} from "@/definitions/definitions";

/**
 * Smallest unit first, which is the order the app teaches in — so the page reads
 * as the route through the deck rather than an arbitrary list.
 *
 * `previewLimit` is per type because the chips are not the same size: a few
 * hundred characters still scan as a block, while eight sentences already fill a
 * screen.
 */
const GROUP_META: Record<VocabType, { label: string; previewLimit: number }> = {
  component: { label: "Components", previewLimit: 60 },
  character: { label: "Characters", previewLimit: 60 },
  compound: { label: "Words", previewLimit: 48 },
  sentence: { label: "Sentences", previewLimit: 8 },
};

/**
 * Ordered by the same list the composition bar uses, so the strip's segments and
 * the headings below it cannot fall out of step — which is the whole reason the
 * two share a colour.
 */
const GROUPS = COMPOSITION_ORDER.map((type) => ({
  type,
  ...GROUP_META[type],
}));

/** List / graph switch for the deck's contents. */
type DeckView = "standard" | "graph";

const DECK_VIEWS: ReadonlyArray<SegmentedOption<DeckView>> = [
  {
    value: "standard",
    label: (
      <>
        <List />
        List
      </>
    ),
  },
  {
    value: "graph",
    label: (
      <>
        <Network />
        Graph
      </>
    ),
  },
];

/** `translation` is nullable, and a chip with a blank line reads as a bug. */
function translationOf(item: DeckVocabItemSummaryDto): string {
  return item.translation ?? "No translation yet";
}

function GlyphChip({ item }: { item: DeckVocabItemSummaryDto }) {
  const meta = vocabTypeMeta(item.vocabType);
  // A meaning-only component has no reading of its own, so its gloss is the only
  // thing worth putting under the glyph; a phonetic one falls through to pinyin.
  const subtitle = item.pinyin || translationOf(item);

  return (
    <div
      className={cn(
        "flex max-w-full items-center rounded-2xl border border-transparent transition-colors hover:border-primary/50",
        meta.softClass,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/dictionary/${encodeURIComponent(item.vocabItem)}`}
            className="flex min-w-0 flex-col gap-1 rounded-2xl px-3 py-2"
          >
            <span className="hanzi text-xl leading-tight break-words text-foreground">
              {item.vocabItem}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          </Link>
        </TooltipTrigger>
        {/* The chip already shows the pinyin where there is one, so the meaning
            is the half that gets truncated away — which is exactly what the
            hint was for. */}
        <TooltipContent>{translationOf(item)}</TooltipContent>
      </Tooltip>
      {canPlayAudio(item.audioUrl) && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Play ${item.vocabItem}`}
          className={cn("mr-2 size-7 shrink-0 rounded-full", meta.colorClass)}
          onClick={() => playAudio(item.audioUrl)}
        >
          <Volume2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function GlyphGroup({
  type,
  label,
  previewLimit,
  items,
}: {
  type: VocabType;
  label: string;
  previewLimit: number;
  items: DeckVocabItemSummaryDto[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = vocabTypeMeta(type);
  const preview = items.slice(0, previewLimit);
  const rest = items.slice(previewLimit);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <span className={cn("size-2.5 rounded-full", meta.fillClass)} />
          {label}
          <span className="text-sm text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <div className="flex flex-wrap gap-2">
            {preview.map((item) => (
              <GlyphChip key={item.id} item={item} />
            ))}
          </div>
          {rest.length > 0 && (
            <>
              <CollapsibleContent>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rest.map((item) => (
                    <GlyphChip key={item.id} item={item} />
                  ))}
                </div>
              </CollapsibleContent>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 rounded-full text-muted-foreground hover:text-primary"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                  {expanded ? "Show fewer" : `Show all ${items.length}`}
                </Button>
              </CollapsibleTrigger>
            </>
          )}
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function ContentsHeading({ showingGraph }: { showingGraph: boolean }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight">
        What&apos;s inside
      </h2>
      {/* Constituents are always part of a deck, so say so: the counts here are
          larger than the word list the deck was created from, and that is the
          deck the learner actually gets. */}
      <p className="text-sm text-muted-foreground">
        {showingGraph
          ? "How the deck is built: every part points at what it helps build."
          : "Smallest pieces first, the way you'll learn them. Every part a character is built from is included."}
      </p>
    </div>
  );
}

function DeckOverviewContent() {
  const params = useParams();
  const deckId = params.deckId as string;
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [view, setView] = useState<DeckView>("standard");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSettings, setSaveSettings] = useState<DeckSettings>(
    DEFAULT_DECK_SETTINGS,
  );

  const { data: deck } = useSuspenseQuery(
    orpc.decks.getById.queryOptions({ input: { deckId } }),
  );

  const {
    data: savedDecks,
    isPending: isSavedPending,
    isError: isSavedError,
  } = useQuery(
    orpc.decks.getUserDecks.queryOptions({ input: SAVED_DECKS_INPUT }),
  );
  const savedSettings = useMemo(() => {
    const saved = savedDecks?.decks.find(
      (candidate: { id: string }) => candidate.id === deckId,
    );
    if (!saved) return undefined;
    return {
      readingEnabled: saved.readingEnabled,
      listeningEnabled: saved.listeningEnabled,
      understandingEnabled: saved.understandingEnabled,
      writingEnabled: saved.writingEnabled,
    };
  }, [savedDecks, deckId]);
  const isSaved = savedSettings !== undefined;

  const saveDeckMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success("Deck added to your study list!");
        setShowSaveDialog(false);
        void queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.key(),
        });
        // Enrolling seeds progress rows, and the enabled study types decide how
        // every item buckets — so /study's cached figures are wrong the moment
        // this succeeds.
        void queryClient.invalidateQueries({
          queryKey: orpc.study.deckProgress.key(),
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

  const groups = GROUPS.map((group) => ({
    ...group,
    items: deck.vocabItems.filter((item) => item.vocabType === group.type),
  })).filter((group) => group.items.length > 0);

  const showingGraph = view === "graph";

  return (
    // The graph earns the extra width: 398 nodes banded into 7 rows need room
    // across, and at max-w-4xl the widest band wraps into an unreadable pile.
    <div
      className={cn(
        "container mx-auto px-4 py-8",
        showingGraph ? "max-w-7xl" : "max-w-4xl",
      )}
    >
      <BackLink href="/decks">Back to Decks</BackLink>

      <PageHeader
        className="mb-4"
        heading={deck.deckName}
        description={deck.description.trim() || "No description yet."}
        action={
          <Button
            size="lg"
            variant={isSaved ? "secondary" : "default"}
            // Until the stored row arrives this cannot tell a saved deck from a
            // new one, and study.addDeck upserts all four mode columns, so a
            // click before then writes the defaults over the learner's choices.
            // isPending is false once a query has failed, so a 500 has to be
            // held too, not just the wait.
            disabled={isSavedPending || isSavedError}
            onClick={() => {
              setSaveSettings(savedSettings ?? DEFAULT_DECK_SETTINGS);
              setShowSaveDialog(true);
            }}
          >
            <BookOpen className="size-5" />
            {isSaved ? "Study Settings" : "Save Deck"}
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <InlineStat icon={<User className="size-4" />}>
          @{deck.createdByUsername}
        </InlineStat>
        <InlineStat icon={<Layers className="size-4" />}>
          {deck.itemCount} {deck.itemCount === 1 ? "item" : "items"}
        </InlineStat>
        <InlineStat icon={<Users className="size-4" />}>
          {deck.numLearners} {deck.numLearners === 1 ? "learner" : "learners"}
        </InlineStat>
      </div>

      <CompositionBar typeCounts={deck.typeCounts} className="mb-8" />

      {/* An empty deck has nothing to switch between, so it gets the heading
          without a Tabs root — a tab panel with no tab to select it is as wrong
          as the other way round. */}
      {groups.length === 0 ? (
        <>
          <ContentsHeading showingGraph={false} />
          <EmptyState
            heading="This deck is empty"
            description="Nothing has been added to it yet. Try another deck, or create your own."
            action={
              <Button asChild variant="outline">
                <Link href="/decks">Browse decks</Link>
              </Button>
            }
          />
        </>
      ) : (
        <Tabs
          value={view}
          onValueChange={(next) => setView(next as DeckView)}
          // The children carry their own margins; the root is here to hold the
          // selected value, not to lay anything out.
          className="gap-0"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <ContentsHeading showingGraph={showingGraph} />
            <SegmentedTabsList options={DECK_VIEWS} label="Deck view" />
          </div>

          {/* flex-none over TabsContent's own flex-1: these panels size to their
              content inside a page column, not to a share of it. */}
          <TabsContent value="graph" className="flex-none">
            <DeckGraphPanel deckId={deckId} />
          </TabsContent>
          <TabsContent value="standard" className="flex-none space-y-6">
            {groups.map((group) => (
              <GlyphGroup
                key={group.type}
                type={group.type}
                label={group.label}
                previewLimit={group.previewLimit}
                items={group.items}
              />
            ))}
          </TabsContent>
        </Tabs>
      )}

      <DeckSettingsDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        settings={saveSettings}
        onSettingsChange={setSaveSettings}
        onSave={handleSaveDeck}
        isPending={saveDeckMutation.isPending}
        heading={isSaved ? "Study Settings" : "Add Deck to Study List"}
        description={
          isSaved
            ? `Change how you study “${deck.deckName}”.`
            : "Configure your study settings for this deck."
        }
        saveButtonText={isSaved ? "Save Settings" : "Add to Study List"}
      />
    </div>
  );
}

export default function DeckOverviewPage() {
  const params = useParams();
  const deckId = params.deckId as string;
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  if (!hydrated || isPending) return <DeckDetailLoading />;

  if (!session) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <EmptyState
          pose="peek"
          heading="Sign in to see this deck"
          description="Decks and your study settings live with your account."
          action={
            <Button asChild>
              <Link href={`/signin?redirectUrl=decks/${deckId}`}>Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<DeckDetailLoading />}>
        <DeckOverviewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
