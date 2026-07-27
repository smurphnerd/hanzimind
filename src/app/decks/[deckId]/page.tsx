"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Layers,
  User,
  Users,
  Volume2,
} from "lucide-react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useORPC } from "@/lib/orpc.client";
import {
  DeckSettingsDialog,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { DeckDetailLoading } from "@/components/deck-detail-loading";
import { EmptyState } from "@/components/empty-state";
import { InlineStat } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { cn } from "@/lib/utils";
import type {
  DeckTypeCountsDto,
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
const GROUPS: Array<{ type: VocabType; label: string; previewLimit: number }> = [
  { type: "component", label: "Components", previewLimit: 60 },
  { type: "character", label: "Characters", previewLimit: 60 },
  { type: "compound", label: "Words", previewLimit: 48 },
  { type: "sentence", label: "Sentences", previewLimit: 8 },
];

/** `translation` is nullable, and a chip with a blank line reads as a bug. */
function translationOf(item: DeckVocabItemSummaryDto): string {
  return item.translation ?? "No translation yet";
}

function GlyphChip({ item }: { item: DeckVocabItemSummaryDto }) {
  const meta = vocabTypeMeta(item.vocabType);
  // A component is a bound form with no reading of its own, so its gloss is the
  // only thing worth putting under the glyph.
  const subtitle = item.pinyin || translationOf(item);

  return (
    <div
      className={cn(
        "flex max-w-full items-center rounded-2xl border border-transparent transition-colors hover:border-primary/50",
        meta.softClass,
      )}
    >
      <Link
        href={`/dictionary/${encodeURIComponent(item.vocabItem)}`}
        title={translationOf(item)}
        className="flex min-w-0 flex-col gap-1 rounded-2xl px-3 py-2"
      >
        <span className="hanzi text-foreground text-xl leading-tight break-words">
          {item.vocabItem}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {subtitle}
        </span>
      </Link>
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
          <span className="text-muted-foreground text-sm tabular-nums">
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
                  className="text-muted-foreground hover:text-primary mt-3 rounded-full"
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

/**
 * The deck's type mix as one strip. The colours match the group headings below,
 * so the proportions and the sections read as the same thing.
 */
function CompositionBar({
  typeCounts,
  className,
}: {
  typeCounts: DeckTypeCountsDto;
  className?: string;
}) {
  const total = GROUPS.reduce((sum, group) => sum + typeCounts[group.type], 0);

  if (total === 0) return null;

  const present = GROUPS.filter((group) => typeCounts[group.type] > 0);

  return (
    <div
      className={cn(
        "bg-muted flex h-2.5 w-full overflow-hidden rounded-full",
        className,
      )}
      role="img"
      aria-label={present
        .map(
          (group) => `${typeCounts[group.type]} ${group.label.toLowerCase()}`,
        )
        .join(", ")}
    >
      {present.map((group) => (
        <span
          key={group.type}
          className={vocabTypeMeta(group.type).fillClass}
          style={{ width: `${(typeCounts[group.type] / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function DeckOverviewContent() {
  const params = useParams();
  const deckId = params.deckId as string;
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSettings, setSaveSettings] = useState<DeckSettings>({
    readingEnabled: true,
    listeningEnabled: true,
    understandingEnabled: true,
    writingEnabled: true,
  });

  const { data: deck } = useSuspenseQuery(
    orpc.decks.getById.queryOptions({ input: { deckId } }),
  );

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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/decks"
        className="text-muted-foreground hover:text-primary mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Decks
      </Link>

      <PageHeader
        className="mb-4"
        title={deck.deckName}
        description={deck.description.trim() || "No description yet."}
        action={
          <Button size="lg" onClick={() => setShowSaveDialog(true)}>
            <BookOpen className="size-5" />
            Save Deck
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
          {deck.numLearners}{" "}
          {deck.numLearners === 1 ? "learner" : "learners"}
        </InlineStat>
      </div>

      <CompositionBar typeCounts={deck.typeCounts} className="mb-8" />

      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          What&apos;s inside
        </h2>
        {/* Constituents are always part of a deck, so say so: the counts here are
            larger than the word list the deck was created from, and that is the
            deck the learner actually gets. */}
        <p className="text-muted-foreground text-sm">
          Smallest pieces first, the way you&apos;ll learn them. Every part a
          character is built from is included.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="This deck is empty"
          description="Nothing has been added to it yet. Try another deck, or create your own."
          action={
            <Button asChild variant="outline">
              <Link href="/decks">Browse decks</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <GlyphGroup
              key={group.type}
              type={group.type}
              label={group.label}
              previewLimit={group.previewLimit}
              items={group.items}
            />
          ))}
        </div>
      )}

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
