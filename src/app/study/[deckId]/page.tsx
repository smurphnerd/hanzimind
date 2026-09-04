"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Volume2,
  ArrowRight,
  BookOpen,
  Plus,
  Check,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import pinyinTone from "pinyin-tone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useORPC } from "@/lib/orpc.client";
import { ErrorBoundary } from "@/components/error-boundary";
import { StudyLoading } from "@/components/study-loading";
import { GrowthTracker } from "@/components/growth-tracker";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ConfettiBurst } from "@/components/confetti-burst";
import { Mika } from "@/components/mika";
import { VocabEntryDetail } from "@/components/vocab-entry";
import { canPlayAudio, playAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { vocabTypeMeta } from "@/lib/vocab-type";
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

/**
 * The first time a learner meets an item, show them exactly what the dictionary
 * would — same component, so the two can't drift apart again. Parts are not
 * links here: following one mid-session would abandon the card.
 */
function VocabOverview({ vocabItem }: { vocabItem: VocabItemStudyDto }) {
  if (vocabItem.studyType !== "new") return null;

  return <VocabEntryDetail entry={vocabItem} partsLinkable={false} />;
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
              <p className="text-sm text-muted-foreground">
                Meet it before you&apos;re quizzed.
              </p>
            </div>
          </div>
          <VocabOverview vocabItem={vocabItem} />
          <div className="sticky bottom-0 -mx-6 mt-6 flex justify-center border-t border-border bg-background/90 px-6 py-4 backdrop-blur">
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
          <span className="font-display text-sm font-bold text-muted-foreground">
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
                  className="size-32 rounded-full hover:border-accent hover:bg-accent/10"
                  onClick={() => playAudio(vocabItem.audioUrl)}
                  aria-label="Play audio"
                >
                  <Volume2 className="size-14 text-accent" />
                </Button>
                <p className="text-sm text-muted-foreground">
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
                {/* A meaning-only component has no audio to offer alongside the
                    glyph, so branch on what is stored rather than on the type —
                    a phonetic component does. */}
                {canPlayAudio(vocabItem.audioUrl) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => playAudio(vocabItem.audioUrl)}
                  >
                    <Volume2 className="size-4" />
                    Play
                  </Button>
                )}
              </div>
            )}

            {vocabItem.studyType === "writing" && (
              <p className="text-center font-display text-2xl font-bold text-accent">
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
              onClick={handleGiveUp}
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

function ResultCard({
  deckId,
  isCorrect,
  userVocabItem,
  newLevel,
  lastAnswer,
  studyType,
  onNext,
}: {
  deckId: string;
  isCorrect: boolean;
  userVocabItem: UserVocabItemDto | null;
  newLevel: number;
  lastAnswer: string;
  studyType: StudyType | "new" | null;
  onNext: () => void;
}) {
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
  // when the user actually typed something.
  const canAddSynonym =
    !isCorrect &&
    studyType === "understanding" &&
    lastAnswer.trim().length > 0 &&
    !!userVocabItem;

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
          <p className="mt-1 text-sm text-muted-foreground">
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
                  {/* A meaning-only component is stored with no reading, a
                      phonetic one keeps it — branch on the data. */}
                  {userVocabItem.pinyin && (
                    <div className="hanzi text-2xl text-accent">
                      {userVocabItem.pinyin}
                    </div>
                  )}
                  {canPlayAudio(userVocabItem.audioUrl) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => playAudio(userVocabItem.audioUrl)}
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
                <p className="text-lg">{userVocabItem.translation}</p>
              </div>

              {userVocabItem.memoryAid && (
                <div className="border-t border-border pt-4">
                  <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-primary uppercase">
                    <Lightbulb className="size-3.5" />
                    Remember it
                  </div>
                  <p className="text-foreground">
                    &ldquo;{userVocabItem.memoryAid}&rdquo;
                  </p>
                </div>
              )}

              {userVocabItem.vocabType === "character" &&
                userVocabItem.constituents.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <div className="mb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Built from
                    </div>
                    <Decomposition parts={userVocabItem.constituents} />
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {canAddSynonym && (
          <div className="mt-5 flex justify-center">
            {synonymAdded ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <Check className="size-4" />
                &ldquo;{lastAnswer.trim()}&rdquo; will be accepted from now on
              </p>
            ) : (
              <Button
                variant="outline"
                isPending={addSynonymMutation.isPending}
                onClick={() =>
                  addSynonymMutation.mutate({
                    deckId,
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
          <p className="mt-2 mb-6 text-lg text-muted-foreground">
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

function NothingDueScreen({ deckId }: { deckId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardContent className="py-12 text-center">
          <div className="mb-4 flex justify-center">
            <Mika pose="sleep" size={104} />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Nothing due
          </h1>
          {/* Three decks land here: one scheduled for later, one still
              locked behind its parts, and one with no cards at all. The copy
              has to hold for all three, and the deck page is where the
              difference is visible. */}
          <p className="mt-2 mb-6 text-lg text-muted-foreground">
            No card in this deck is ready right now. The deck page shows what is
            scheduled and what is still waiting on its parts.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={`/decks/${deckId}`}>
                <BookOpen className="size-5" />
                Back to the deck
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/study">Return to study</Link>
            </Button>
          </div>
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
  const [openedWithNothingDue] = useState(initialVocabItem === null);
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
        // Every figure on the /study card — the stage bar, "X of Y grown",
        // due-now, locked — moves with this answer. Clearing a whole session
        // inside the 60s staleTime would otherwise send the learner back to a
        // card still advertising the reviews they just finished.
        void queryClient.invalidateQueries({
          queryKey: orpc.study.deckProgress.key(),
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
      onError: () =>
        toast.error("Couldn't save that answer. Try again in a moment."),
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

  if (openedWithNothingDue) {
    return <NothingDueScreen deckId={deckId} />;
  }

  if (!showingResult && (isCompleted || !currentVocabItem)) {
    return <CompletionScreen />;
  }

  return (
    <>
      <ConfettiBurst trigger={confettiKey} />
      {showingResult ? (
        <ResultCard
          deckId={deckId}
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
