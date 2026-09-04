"use client";

import { ArrowRight, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ItemTypeBadge } from "@/components/item-type-badge";
import { Mika } from "@/components/mika";
import { HanziPanel } from "@/components/study/hanzi-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VocabEntryDetail } from "@/components/vocab-entry";
import type { StudyType, VocabItemStudyDto } from "@/definitions/definitions";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { foldPinyinInput } from "@/lib/pinyin";
import { cn } from "@/lib/utils";

const STUDY_LABELS: Record<StudyType, string> = {
  reading: "Reading",
  listening: "Listening",
  understanding: "Understanding",
  writing: "Writing",
};

interface StudyCardProps {
  card: VocabItemStudyDto;
  /** The typed answer, or "" from the intro card's Continue. */
  onAnswer: (answer: string) => void;
  onGiveUp: () => void;
}

/**
 * One card, asked.
 *
 * Mount it with a key that changes per card. Everything that has to reset
 * between cards — the answer field, the once-only autoplay — lives in state
 * and refs here, so a fresh mount is what clears them.
 */
export function StudyCard({ card, onAnswer, onGiveUp }: StudyCardProps) {
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoPlayed = useRef(false);

  useEffect(() => {
    if (hasAutoPlayed.current) return;

    // Listening cards need the audio to be answerable at all; new-word intros
    // play it so you hear the pronunciation the first time you meet the word.
    if (card.studyType === "listening") {
      hasAutoPlayed.current = true;
      if (!card.audioUrl) {
        toast.error("No audio available for this card");
        return;
      }
      playAudio(card.audioUrl);
      return;
    }

    if (card.studyType === "new") {
      hasAutoPlayed.current = true;
      // Missing audio is not worth interrupting an intro card over.
      if (card.audioUrl) playAudio(card.audioUrl);
    }
  }, [card]);

  useEffect(() => {
    if (card.studyType !== "new") {
      inputRef.current?.focus();
    }
  }, [card.studyType]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      onAnswer(answer);
    },
    [answer, onAnswer],
  );

  if (card.studyType === "new") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <Mika pose="read" size={44} />
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                New word
              </h1>
              <p className="text-sm text-muted-foreground">
                Meet it before you&apos;re quizzed.
              </p>
            </div>
          </div>
          {/* The first time a learner meets an item, show them exactly what the
              dictionary would — same component, so the two can't drift apart
              again. Parts are not links here: following one mid-session would
              abandon the card. */}
          <VocabEntryDetail entry={card} partsLinkable={false} />
          <div className="sticky bottom-0 -mx-6 mt-6 flex justify-center border-t border-border bg-background/90 px-6 py-4 backdrop-blur">
            <Button size="lg" onClick={() => onAnswer("")}>
              Continue
              <ArrowRight className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // "writing" shows the English and expects the Chinese characters back — the
  // server grades it against vocabItem, not pinyin.
  const isPinyinAnswer =
    card.studyType === "reading" || card.studyType === "listening";
  const isHanziAnswer = card.studyType === "writing";

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center justify-center gap-2">
          <ItemTypeBadge type={card.vocabType} />
          <span className="font-display text-sm font-bold text-muted-foreground">
            · {STUDY_LABELS[card.studyType]}
          </span>
        </div>

        <Card className="mb-6">
          <CardContent className="py-10">
            {card.studyType === "reading" && (
              <HanziPanel
                char={card.vocabItem}
                type={card.vocabType}
                className="mx-auto size-40"
                textClassName="text-7xl"
              />
            )}

            {card.studyType === "listening" && (
              <div className="flex flex-col items-center gap-6">
                <Button
                  variant="outline"
                  className="size-32 rounded-full hover:border-accent hover:bg-accent/10"
                  onClick={() => playAudio(card.audioUrl)}
                  aria-label="Play audio"
                >
                  <Volume2 className="size-14 text-accent" />
                </Button>
                <p className="text-sm text-muted-foreground">
                  Tap to play again
                </p>
              </div>
            )}

            {card.studyType === "understanding" && (
              <div className="flex flex-col items-center gap-4">
                <HanziPanel
                  char={card.vocabItem}
                  type={card.vocabType}
                  className="size-32"
                  textClassName="text-6xl"
                />
                {/* A meaning-only component has no audio to offer alongside the
                    glyph, so branch on what is stored rather than on the type —
                    a phonetic component does. */}
                {canPlayAudio(card.audioUrl) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => playAudio(card.audioUrl)}
                  >
                    <Volume2 className="size-4" />
                    Play
                  </Button>
                )}
              </div>
            )}

            {card.studyType === "writing" && (
              <p className="text-center font-display text-2xl font-bold text-accent">
                {card.translation}
              </p>
            )}
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            ref={inputRef}
            type="text"
            placeholder={
              isPinyinAnswer
                ? "Pinyin — e.g. ni3 hao3"
                : isHanziAnswer
                  ? "Type the characters (e.g. 你好)"
                  : "Enter English meaning"
            }
            value={answer}
            onChange={(e) =>
              setAnswer(
                isPinyinAnswer
                  ? foldPinyinInput(e.target.value)
                  : e.target.value,
              )
            }
            // The Input primitive shrinks to `md:text-sm` from 768px up, which
            // outranks a bare `text-2xl`. Drop the `md:` half and the answer
            // field is 14px on every desktop.
            className={cn(
              "h-14 text-center text-2xl md:text-2xl",
              isHanziAnswer && "hanzi",
            )}
            autoComplete="off"
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              size="lg"
              onClick={onGiveUp}
            >
              Give up
            </Button>
            <Button type="submit" className="flex-1" size="lg">
              Check
            </Button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {isPinyinAnswer ? (
            <>
              Tones as numbers (<span className="font-medium">hao3</span> → hǎo)
              · type <span className="font-medium">v</span> for ü (
              <span className="font-medium">nv3</span> → nǚ) · Enter to check
            </>
          ) : (
            "Press Enter to check"
          )}
        </p>
      </div>
    </div>
  );
}
