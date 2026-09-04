"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Lock,
  Play,
  Settings,
  Sparkles,
  Sprout,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useORPC } from "@/lib/orpc.client";
import {
  DeckSettingsDialog,
  type DeckSettings,
} from "@/components/deck-settings-dialog";
import { DeckProgressBar, GrowthLegend } from "@/components/deck-progress-bar";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { useHydrated } from "@/lib/use-hydrated";
import { InlineStat } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { StudyLoading } from "@/components/study-loading";
import type { DeckProgressDto } from "@/definitions/definitions";
import { cn } from "@/lib/utils";

const DECKS_INPUT = { page: 1, perPage: 50 };

const EMPTY_STAGES = [0, 0, 0, 0, 0, 0];

interface StudyDeckCardProps {
  deck: {
    id: string;
    deckName: string;
    description: string;
    createdByUsername: string;
  };
  /** Undefined only while a deck exists that the progress call did not cover. */
  progress: DeckProgressDto | undefined;
  onOpenSettings: () => void;
}

function StudyDeckCard({ deck, progress, onOpenSettings }: StudyDeckCardProps) {
  const byStage = progress?.byStage ?? EMPTY_STAGES;
  const total = progress?.total ?? 0;
  const dueNow = progress?.dueNow ?? 0;
  const newAvailable = progress?.newAvailable ?? 0;
  const locked = progress?.locked ?? 0;

  // Stage 0 is "Not started", so everything above it is something that grew.
  const grown = byStage.slice(1).reduce((sum, count) => sum + count, 0);
  const hasWork = dueNow > 0 || newAvailable > 0;

  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden",
        // A deck with reviews waiting should be findable at a glance.
        dueNow > 0 && "border-primary/40",
      )}
    >
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-xl transition-colors group-hover:text-primary">
              {deck.deckName}
            </CardTitle>
            <CardDescription className="text-xs">
              By @{deck.createdByUsername}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Study settings for ${deck.deckName}`}
            className="-mt-1 -mr-2 shrink-0 text-muted-foreground hover:text-primary"
            onClick={onOpenSettings}
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {deck.description}
        </p>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-sm font-bold tabular-nums">
              {grown}
              <span className="font-sans font-normal text-muted-foreground">
                {" "}
                of {total} grown
              </span>
            </span>
            {locked > 0 && (
              <InlineStat
                icon={<Lock className="size-3.5" />}
                className="text-xs"
              >
                {locked} locked
              </InlineStat>
            )}
          </div>

          <DeckProgressBar byStage={byStage} total={total} />
          <GrowthLegend byStage={byStage} />
        </div>

        <div className="mt-auto flex flex-col items-start gap-3">
          {dueNow > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-display text-sm font-bold text-primary">
              <Sparkles className="size-4" />
              <span className="tabular-nums">{dueNow}</span> ready to review
            </span>
          ) : newAvailable > 0 ? (
            <InlineStat icon={<Sprout className="size-4 text-success" />}>
              {newAvailable} new to plant
            </InlineStat>
          ) : total > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <Check className="size-4" />
              All caught up
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              Nothing to study here yet
            </span>
          )}

          <Button
            asChild
            size="lg"
            className="w-full"
            variant={hasWork ? "default" : "outline"}
          >
            <Link href={`/study/${deck.id}`}>
              <Play className="size-5" />
              Start studying
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StudyContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();
  const [selectedDeck, setSelectedDeck] = useState<{
    id: string;
    settings: DeckSettings;
  } | null>(null);

  const { data } = useSuspenseQuery(
    orpc.decks.getUserDecks.queryOptions({ input: DECKS_INPUT }),
  );

  const { data: progress } = useSuspenseQuery(
    orpc.study.deckProgress.queryOptions({
      input: { deckIds: data.decks.map((deck) => deck.id) },
    }),
  );

  const progressByDeck = new Map(
    progress.map((entry) => [entry.deckId, entry]),
  );

  const updateSettingsMutation = useMutation(
    orpc.study.addDeck.mutationOptions({
      onSuccess: () => {
        toast.success("Deck settings updated!");
        setSelectedDeck(null);
        void queryClient.invalidateQueries({
          queryKey: orpc.decks.getUserDecks.key(),
        });
        // Which study types are on decides what counts as studiable, so every
        // figure on the card moves with these settings.
        void queryClient.invalidateQueries({
          queryKey: orpc.study.deckProgress.key(),
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
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="My study decks"
        description="Watch each deck grow, and pick up wherever you left off."
      />

      {data.decks.length === 0 ? (
        <EmptyState
          title="No decks yet"
          description="Add a deck to your study list and Mika will start growing it with you."
          action={
            <Button asChild size="lg">
              <Link href="/decks">
                <BookOpen className="size-5" />
                Browse decks
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {data.decks.map((deck) => (
            <StudyDeckCard
              key={deck.id}
              deck={deck}
              progress={progressByDeck.get(deck.id)}
              onOpenSettings={() =>
                setSelectedDeck({
                  id: deck.id,
                  settings: {
                    readingEnabled: deck.readingEnabled,
                    listeningEnabled: deck.listeningEnabled,
                    understandingEnabled: deck.understandingEnabled,
                    writingEnabled: deck.writingEnabled,
                  },
                })
              }
            />
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
          title="Update study settings"
          description="Choose how this deck quizzes you."
          saveButtonText="Update settings"
        />
      )}
    </div>
  );
}

export default function StudyPage() {
  const hydrated = useHydrated();
  return (
    <ErrorBoundary>
      <Suspense fallback={<StudyLoading />}>
        {hydrated ? <StudyContent /> : <StudyLoading />}
      </Suspense>
    </ErrorBoundary>
  );
}
