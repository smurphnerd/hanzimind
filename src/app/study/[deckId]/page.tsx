"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Volume2, ArrowRight, BookOpen, Plus, Check } from "lucide-react";
import Link from "next/link";
import pinyinTone from "pinyin-tone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useORPC } from "@/lib/orpc.client";
import { ErrorBoundary } from "@/components/error-boundary";
import { StudyLoading } from "@/components/study-loading";
import { GrowthTracker } from "@/components/growth-tracker";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ConfettiBurst } from "@/components/confetti-burst";
import { CharacterStrokes } from "@/components/character-strokes";
import { Mika } from "@/components/mika";
import { cn } from "@/lib/utils";
import { vocabTypeMeta } from "@/lib/vocab-type";
import { filterDecomposition } from "@/lib/decomposition";
import { playAnswerSound } from "@/lib/sounds";
import type {
  VocabItemStudyDto,
  VocabType,
  StudyType,
  UserVocabItemDto,
} from "@/definitions/definitions";

const STUDY_LABELS: Record<string, string> = {
  reading: "Reading",
  listening: "Listening",
  understanding: "Understanding",
  writing: "Writing",
};

function playAudio(url: string) {
  // audioUrl is "" when TTS generation failed during seeding — calling play()
  // on an empty src rejects with NotSupportedError, so bail out first.
  if (!url) return;
  const audio = new Audio(url);
  audio.play().catch(() => {
    toast.error("Couldn't play audio");
  });
}

function HanziPanel({
  char,
  type,
  className,
  textClassName,
}: {
  char: string;
  type: VocabType;
  className?: string;
  textClassName?: string;
}) {
  const meta = vocabTypeMeta(type);
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl",
        meta.softClass,
        className,
      )}
    >
      <span className={cn("hanzi text-foreground", textClassName)}>{char}</span>
    </div>
  );
}

function Decomposition({ decomposition }: { decomposition: string }) {
  const parts = filterDecomposition(decomposition);
  if (parts.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No decomposition available
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-4">
      {parts.map((component, index) => (
        <div key={index} className="flex items-center gap-3">
          {index > 0 && (
            <span className="text-muted-foreground text-xl">+</span>
          )}
          <Link
            href={`/dictionary/${encodeURIComponent(component)}`}
            className="group"
          >
            <div className="hanzi bg-type-component-soft text-type-component border-type-component/30 flex size-16 items-center justify-center rounded-xl border text-3xl transition-transform group-hover:-translate-y-0.5">
              {component}
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function VocabOverview({ vocabItem }: { vocabItem: VocabItemStudyDto }) {
  if (vocabItem.studyType !== "new") return null;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex items-center gap-6">
          <HanziPanel
            char={vocabItem.vocabItem}
            type={vocabItem.vocabType}
            className="size-28 shrink-0"
            textClassName="text-6xl"
          />
          <div className="flex flex-col items-start gap-3">
            <ItemTypeBadge type={vocabItem.vocabType} />
            <div className="hanzi text-accent text-2xl">
              {vocabItem.pinyin}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => playAudio(vocabItem.audioUrl)}
            >
              <Volume2 className="size-4" />
              Play
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Definition</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg">{vocabItem.translation}</p>
        </CardContent>
      </Card>

      {vocabItem.vocabType === "character" && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stroke order</CardTitle>
            </CardHeader>
            <CardContent>
              {vocabItem.strokes && vocabItem.strokes.length > 0 ? (
                <CharacterStrokes
                  strokes={vocabItem.strokes}
                  strokeMedians={vocabItem.strokeMedians ?? undefined}
                />
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No stroke data available
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Decomposition</CardTitle>
            </CardHeader>
            <CardContent>
              <Decomposition decomposition={vocabItem.decomposition ?? ""} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StudyCard({
  vocabItem,
  onSubmit,
}: {
  vocabItem: VocabItemStudyDto;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoPlayed = useRef(false);

  useEffect(() => {
    if (hasAutoPlayed.current) return;

    // Listening cards need the audio to be answerable at all; new-word intros
    // play it so you hear the pronunciation the first time you meet the word.
    if (vocabItem.studyType === "listening") {
      hasAutoPlayed.current = true;
      if (!vocabItem.audioUrl) {
        toast.error("No audio available for this card");
        return;
      }
      playAudio(vocabItem.audioUrl);
      return;
    }

    if (vocabItem.studyType === "new") {
      hasAutoPlayed.current = true;
      // Missing audio is not worth interrupting an intro card over.
      if (vocabItem.audioUrl) playAudio(vocabItem.audioUrl);
    }
  }, [vocabItem]);

  useEffect(() => {
    if (vocabItem.studyType !== "new") {
      inputRef.current?.focus();
    }
  }, [vocabItem.studyType]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      onSubmit(answer);
    },
    [answer, onSubmit],
  );

  const handleGiveUp = useCallback(() => onSubmit(""), [onSubmit]);

  useEffect(() => {
    if (vocabItem.studyType === "new") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // This listener already submits, so cancel the key to stop the browser
      // also implicitly submitting the form via the focused input.
      e.preventDefault();
      handleSubmit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, vocabItem.studyType]);

  if (vocabItem.studyType === "new") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <Mika pose="read" size={44} />
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                New word
              </h1>
              <p className="text-muted-foreground text-sm">
                Meet it before you&apos;re quizzed.
              </p>
            </div>
          </div>
          <VocabOverview vocabItem={vocabItem} />
          <div className="mt-6 flex justify-center">
            <Button size="lg" onClick={() => onSubmit("")}>
              Continue
              <ArrowRight className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const modeLabel = STUDY_LABELS[vocabItem.studyType] ?? vocabItem.studyType;
  // "writing" shows the English and expects the Chinese characters back — the
  // server grades it against vocabItem, not pinyin.
  const isPinyinAnswer =
    vocabItem.studyType === "reading" || vocabItem.studyType === "listening";
  const isHanziAnswer = vocabItem.studyType === "writing";

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center justify-center gap-2">
          <ItemTypeBadge type={vocabItem.vocabType} />
          <span className="text-muted-foreground font-display text-sm font-bold">
            · {modeLabel}
          </span>
        </div>

        <Card className="mb-6">
          <CardContent className="py-10">
            {vocabItem.studyType === "reading" && (
              <HanziPanel
                char={vocabItem.vocabItem}
                type={vocabItem.vocabType}
                className="mx-auto size-40"
                textClassName="text-7xl"
              />
            )}

            {vocabItem.studyType === "listening" && (
              <div className="flex flex-col items-center gap-6">
                <Button
                  variant="outline"
                  className="hover:bg-accent/10 hover:border-accent size-32 rounded-full"
                  onClick={() => playAudio(vocabItem.audioUrl)}
                  aria-label="Play audio"
                >
                  <Volume2 className="text-accent size-14" />
                </Button>
                <p className="text-muted-foreground text-sm">
                  Tap to play again
                </p>
              </div>
            )}

            {vocabItem.studyType === "understanding" && (
              <div className="flex flex-col items-center gap-4">
                <HanziPanel
                  char={vocabItem.vocabItem}
                  type={vocabItem.vocabType}
                  className="size-32"
                  textClassName="text-6xl"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => playAudio(vocabItem.audioUrl)}
                >
                  <Volume2 className="size-4" />
                  Play
                </Button>
              </div>
            )}

            {vocabItem.studyType === "writing" && (
              <p className="text-accent font-display text-center text-2xl font-bold">
                {vocabItem.translation}
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
                  ? // The converter runs per keystroke, so "v" becomes "ü"
                    // before its tone digit is typed — and it can't put a tone
                    // on "ü". Folding ü back to v first makes "nv3" → "nǚ".
                    (pinyinTone(e.target.value.replace(/ü/g, "v")) as string)
                  : e.target.value,
              )
            }
            className={`h-14 text-center text-2xl${isHanziAnswer ? " hanzi" : ""}`}
            autoComplete="off"
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              size="lg"
              onClick={handleGiveUp}
            >
              Give up
            </Button>
            <Button type="submit" className="flex-1" size="lg">
              Check
            </Button>
          </div>
        </form>

        <p className="text-muted-foreground mt-4 text-center text-xs">
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

function ResultCard({
  isCorrect,
  userVocabItem,
  newLevel,
  lastAnswer,
  studyType,
  onNext,
}: {
  isCorrect: boolean;
  userVocabItem: UserVocabItemDto | null;
  newLevel: number;
  lastAnswer: string;
  studyType: StudyType | "new" | null;
  onNext: () => void;
}) {
  const orpc = useORPC();
  const [synonymAdded, setSynonymAdded] = useState(false);

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
  // when the user actually typed something.
  const canAddSynonym =
    !isCorrect &&
    studyType === "understanding" &&
    lastAnswer.trim().length > 0 &&
    !!userVocabItem;

  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Without this, the same physical Enter press goes on to fire `keypress`,
      // which by then targets the next card's freshly focused input — and its
      // default action is implicit form submission, instantly answering the
      // next card with "". Cancelling keydown suppresses keypress entirely.
      e.preventDefault();
      onNext();
    },
    [onNext],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mb-2 flex justify-center">
            <Mika pose={isCorrect ? "cheer" : "read"} size={72} />
          </div>
          <div
            className={cn(
              "font-display text-3xl font-extrabold tracking-tight",
              isCorrect ? "text-success" : "text-destructive",
            )}
          >
            {isCorrect ? "对! Nailed it" : "Not quite"}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {isCorrect
              ? "That one's growing nicely."
              : "No stress — it'll come back around soon."}
          </p>

          <div className="mt-5 flex justify-center">
            <Card className="inline-block">
              <CardContent className="py-4">
                <GrowthTracker level={newLevel} size="lg" />
              </CardContent>
            </Card>
          </div>
        </div>

        {userVocabItem && (
          <Card
            className={cn(
              "border-2",
              isCorrect ? "border-success/40" : "border-destructive/40",
            )}
          >
            <CardContent className="space-y-5">
              <div className="flex items-center gap-5">
                <HanziPanel
                  char={userVocabItem.vocabItem}
                  type={userVocabItem.vocabType}
                  className="size-24 shrink-0"
                  textClassName="text-5xl"
                />
                <div className="flex flex-1 flex-col items-start gap-2">
                  <ItemTypeBadge type={userVocabItem.vocabType} />
                  <div className="hanzi text-accent text-2xl">
                    {userVocabItem.pinyin}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => playAudio(userVocabItem.audioUrl)}
                  >
                    <Volume2 className="size-4" />
                    Play
                  </Button>
                </div>
              </div>

              <div className="border-border border-t pt-4">
                <div className="text-muted-foreground mb-1 text-xs font-bold tracking-wider uppercase">
                  Meaning
                </div>
                <p className="text-lg">{userVocabItem.translation}</p>
              </div>

              {userVocabItem.vocabType === "character" &&
                userVocabItem.decomposition && (
                  <div className="border-border border-t pt-4">
                    <div className="text-muted-foreground mb-1 text-xs font-bold tracking-wider uppercase">
                      Built from
                    </div>
                    <Decomposition
                      decomposition={userVocabItem.decomposition}
                    />
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {canAddSynonym && (
          <div className="mt-5 flex justify-center">
            {synonymAdded ? (
              <p className="text-success flex items-center gap-2 text-sm">
                <Check className="size-4" />
                &ldquo;{lastAnswer.trim()}&rdquo; will be accepted from now on
              </p>
            ) : (
              <Button
                variant="outline"
                isPending={addSynonymMutation.isPending}
                onClick={() =>
                  addSynonymMutation.mutate({
                    vocabItemId: userVocabItem.id,
                    synonym: lastAnswer,
                  })
                }
              >
                <Plus className="size-4" />
                My answer was right — accept &ldquo;{lastAnswer.trim()}&rdquo;
              </Button>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button size="lg" onClick={onNext}>
            Next
            <ArrowRight className="size-5" />
          </Button>
        </div>
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Press Enter to continue
        </p>
      </div>
    </div>
  );
}

function CompletionScreen() {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardContent className="py-12 text-center">
          <div className="mb-4 flex justify-center">
            <Mika pose="cheer" size={104} />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            All done!
          </h1>
          <p className="text-muted-foreground mt-2 mb-6 text-lg">
            Great work — you&apos;ve cleared every card in this session.
          </p>
          <Button size="lg" onClick={() => router.push("/study")}>
            <BookOpen className="size-5" />
            Return to study
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StudyPageContent() {
  const orpc = useORPC();
  const params = useParams();
  const queryClient = useQueryClient();
  const deckId = params.deckId as string;

  const { data: initialVocabItem } = useSuspenseQuery(
    orpc.study.nextVocabItem.queryOptions({ input: { deckId } }),
  );

  const [currentVocabItem, setCurrentVocabItem] =
    useState<VocabItemStudyDto | null>(initialVocabItem);
  const [showingResult, setShowingResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [userVocabItem, setUserVocabItem] = useState<UserVocabItemDto | null>(
    null,
  );
  const [isCompleted, setIsCompleted] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastStudyType, setLastStudyType] = useState<StudyType | "new" | null>(
    null,
  );
  const [confettiKey, setConfettiKey] = useState(0);

  // `isPending` is React state, so it is still false for a second call made in
  // the same tick — a ref flips synchronously and actually blocks the double.
  const submitInFlight = useRef(false);

  const submitAnswerMutation = useMutation(
    orpc.study.submitAnswer.mutationOptions({
      onSuccess: (data) => {
        // The seed query is cached (staleTime 60s); without this, re-entering
        // the deck soon after answering replays an already-answered card.
        void queryClient.invalidateQueries({
          queryKey: orpc.study.nextVocabItem.queryKey({ input: { deckId } }),
        });

        const studyType = currentVocabItem?.studyType;
        // "new" is an intro card, not a graded answer: it has no level and
        // shouldn't show a result/celebration screen.
        const isIntro = studyType === "new";

        if (!isIntro) {
          const levelKey = `${studyType as StudyType}Level` as
            | "readingLevel"
            | "listeningLevel"
            | "understandingLevel"
            | "writingLevel";
          setNewLevel(data.userVocabItem[levelKey] ?? 0);
          setIsCorrect(data.correct);
          playAnswerSound(data.correct);
          if (data.correct) setConfettiKey((k) => k + 1);
          setUserVocabItem(data.userVocabItem);
          setShowingResult(true);
        }

        if (!data.nextVocabItem) {
          setIsCompleted(true);
        } else {
          setCurrentVocabItem(data.nextVocabItem);
        }
      },
    }),
  );

  const handleSubmit = (answer: string) => {
    if (!currentVocabItem) return;
    setLastAnswer(answer);
    setLastStudyType(currentVocabItem.studyType);
    // Ignore repeat Enter presses / clicks while an answer is in flight,
    // otherwise the SRS level advances twice for one card.
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    submitAnswerMutation.mutate(
      {
        deckId,
        answer: {
          vocabItemId: currentVocabItem.id,
          userId: "",
          deckId,
          studyType: currentVocabItem.studyType,
          answer,
        },
      },
      // Released here rather than in mutationOptions: that object is built
      // during render, and reading a ref there is disallowed.
      { onSettled: () => (submitInFlight.current = false) },
    );
  };

  const handleNext = () => setShowingResult(false);

  if (isCompleted && !showingResult) {
    return <CompletionScreen />;
  }

  if (!currentVocabItem && !showingResult) {
    return <CompletionScreen />;
  }

  return (
    <>
      <ConfettiBurst trigger={confettiKey} />
      {showingResult ? (
        <ResultCard
          isCorrect={isCorrect}
          userVocabItem={userVocabItem}
          newLevel={newLevel}
          lastAnswer={lastAnswer}
          studyType={lastStudyType}
          onNext={handleNext}
        />
      ) : (
        currentVocabItem && (
          <StudyCard
            key={currentVocabItem.id}
            vocabItem={currentVocabItem}
            onSubmit={handleSubmit}
          />
        )
      )}
    </>
  );
}

export default function StudyPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<StudyLoading />}>
        <StudyPageContent />
      </Suspense>
    </ErrorBoundary>
  );
}
