"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Lightbulb, Plus, Volume2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { GrowthTracker } from "@/components/growth-tracker";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { Mika } from "@/components/mika";
import { HanziPanel } from "@/components/study/hanzi-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { useORPC } from "@/lib/orpc.client";
import type { GradedAnswer } from "@/lib/study-session";
import { cn } from "@/lib/utils";

/**
 * `parts` comes from the server (`constituents`), which has already dropped any
 * disabled part. Do not re-derive it from the raw `decomposition` string here —
 * the client cannot tell which parts are hidden.
 */
function Decomposition({ parts }: { parts: string[] }) {
  if (parts.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No decomposition available
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-4">
      {parts.map((component, index) => (
        <div key={index} className="flex items-center gap-3">
          {index > 0 && (
            <span className="text-xl text-muted-foreground">+</span>
          )}
          <Link
            href={`/dictionary/${encodeURIComponent(component)}`}
            className="group"
          >
            <div className="hanzi flex size-16 items-center justify-center rounded-xl border border-type-component/30 bg-type-component-soft text-3xl text-type-component transition-transform group-hover:-translate-y-0.5">
              {component}
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

interface ResultCardProps {
  deckId: string;
  graded: GradedAnswer;
  onNext: () => void;
}

/**
 * The answer to the card just played.
 *
 * Everything it shows comes out of one `GradedAnswer`, which the session
 * reducer only ever builds from the card that was actually answered. There is
 * no arrangement of props here that can show a level, an answer and an item
 * from three different cards, which is what the page's loose `useState` values
 * allowed.
 *
 * Mounted fresh per result — the session always shows a card in between — so
 * the once-only focus and the synonym flag reset on their own.
 */
export function ResultCard({ deckId, graded, onNext }: ResultCardProps) {
  const orpc = useORPC();
  const [synonymAdded, setSynonymAdded] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const addSynonymMutation = useMutation(
    orpc.study.addSynonym.mutationOptions({
      onSuccess: () => {
        setSynonymAdded(true);
        toast.success("Saved — we'll accept that answer next time.");
      },
      onError: () => toast.error("Couldn't save that answer."),
    }),
  );

  // Only meaning answers have synonyms worth teaching the grader, and only
  // when the learner actually offered one — giving up is not a claim that the
  // grader got it wrong.
  const canAddSynonym =
    !graded.correct &&
    !graded.surrendered &&
    graded.studyType === "understanding" &&
    graded.answer.trim().length > 0;

  useEffect(() => {
    nextRef.current?.focus();
  }, []);

  const handleNextKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Consume the key. Left to the browser, this same press activates the
      // button, React swaps in the next card, and the follow-up `keypress`
      // lands on that card's freshly focused input, whose default action is
      // implicit form submission, instantly answering it with "".
      e.preventDefault();
      onNext();
    },
    [onNext],
  );

  const item = graded.item;

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mb-2 flex justify-center">
            <Mika pose={graded.correct ? "cheer" : "read"} size={72} />
          </div>
          <div
            className={cn(
              "font-display text-3xl font-extrabold tracking-tight",
              graded.correct ? "text-success" : "text-destructive",
            )}
          >
            {graded.correct ? "对! Nailed it" : "Not quite"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {graded.correct
              ? "That one's growing nicely."
              : "No stress — it'll come back around soon."}
          </p>

          <div className="mt-5 flex justify-center">
            <Card className="inline-block">
              <CardContent className="py-4">
                <GrowthTracker level={graded.level} size="lg" />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card
          className={cn(
            "border-2",
            graded.correct ? "border-success/40" : "border-destructive/40",
          )}
        >
          <CardContent className="space-y-5">
            <div className="flex items-center gap-5">
              <HanziPanel
                char={item.vocabItem}
                type={item.vocabType}
                className="size-24 shrink-0"
                textClassName="text-5xl"
              />
              <div className="flex flex-1 flex-col items-start gap-2">
                <ItemTypeBadge type={item.vocabType} />
                {/* A meaning-only component is stored with no reading, a
                    phonetic one keeps it — branch on the data. */}
                {item.pinyin && (
                  <div className="hanzi text-2xl text-accent">
                    {item.pinyin}
                  </div>
                )}
                {canPlayAudio(item.audioUrl) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => playAudio(item.audioUrl)}
                  >
                    <Volume2 className="size-4" />
                    Play
                  </Button>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Meaning
              </div>
              <p className="text-lg">{item.translation}</p>
            </div>

            {item.memoryAid && (
              <div className="border-t border-border pt-4">
                <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-primary uppercase">
                  <Lightbulb className="size-3.5" />
                  Remember it
                </div>
                <p className="text-foreground">
                  &ldquo;{item.memoryAid}&rdquo;
                </p>
              </div>
            )}

            {item.vocabType === "character" && item.constituents.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="mb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Built from
                </div>
                <Decomposition parts={item.constituents} />
              </div>
            )}
          </CardContent>
        </Card>

        {canAddSynonym && (
          <div className="mt-5 flex justify-center">
            {synonymAdded ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <Check className="size-4" />
                &ldquo;{graded.answer.trim()}&rdquo; will be accepted from now
                on
              </p>
            ) : (
              <Button
                variant="outline"
                isPending={addSynonymMutation.isPending}
                onClick={() =>
                  addSynonymMutation.mutate({
                    deckId,
                    vocabItemId: item.id,
                    synonym: graded.answer,
                  })
                }
              >
                <Plus className="size-4" />
                My answer was right — accept &ldquo;{graded.answer.trim()}
                &rdquo;
              </Button>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button
            ref={nextRef}
            size="lg"
            onClick={onNext}
            onKeyDown={handleNextKeyDown}
          >
            Next
            <ArrowRight className="size-5" />
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Press Enter to continue
        </p>
      </div>
    </div>
  );
}
