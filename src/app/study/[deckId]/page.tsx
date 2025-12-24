"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useORPC } from "@/lib/orpc.client";
import { ErrorBoundary } from "@/components/error-boundary";
import { StudyLoading } from "@/components/study-loading";
import { LevelStars } from "@/components/level-stars";
import type {
  VocabItemStudyDto,
  StudyType,
  UserVocabItemDto,
} from "@/definitions/definitions";
import Link from "next/link";
import pinyinTone from "pinyin-tone";

function VocabOverview({ vocabItem }: { vocabItem: VocabItemStudyDto }) {
  if (vocabItem.studyType !== "new") return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="text-6xl font-bold">{vocabItem.vocabItem}</div>
          <div className="flex flex-col gap-2">
            <div className="text-2xl text-muted-foreground">
              {vocabItem.pinyin}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const audio = new Audio(vocabItem.audioUrl);
                audio.play();
              }}
            >
              <Volume2 className="mr-2 h-4 w-4" />
              Play
            </Button>
          </div>
        </div>
      </Card>

      {/* Definition */}
      <Card className="p-6">
        <h2 className="mb-2 text-lg font-semibold">Definition</h2>
        <p className="text-foreground">{vocabItem.translation}</p>
      </Card>

      {/* Visuals - Two Column Layout */}
      {vocabItem.vocabType === "character" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Stroke Order Animation */}
          {vocabItem.strokes && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Stroke Order Animation
              </h2>
              <div className="flex aspect-square items-center justify-center rounded-md bg-muted">
                <span className="text-sm text-muted-foreground">
                  [SVG ANIMATION]
                </span>
              </div>
            </Card>
          )}

          {/* Decomposition */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Decomposition</h2>
            {vocabItem.decomposition ? (
              <div className="flex flex-wrap items-center justify-center gap-4 py-8">
                {vocabItem.decomposition
                  .split("")
                  .filter(
                    (c) =>
                      c !== "？" &&
                      c !== "?" &&
                      !(c.charCodeAt(0) >= 0x2ff0 && c.charCodeAt(0) <= 0x2fff),
                  )
                  .map((component, index) => (
                    <div key={index} className="flex items-center gap-4">
                      {index > 0 && (
                        <span className="text-2xl text-muted-foreground">
                          +
                        </span>
                      )}
                      <Link
                        href={`/dictionary/${encodeURIComponent(component)}`}
                        className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                      >
                        <div className="rounded-md border-2 border-border p-4 text-4xl font-bold transition-colors hover:border-primary">
                          {component}
                        </div>
                      </Link>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No decomposition available
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Memory Aids - Only for character and compound types */}
      {(vocabItem.vocabType === "character" ||
        vocabItem.vocabType === "compound") && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Memory Aids</h2>
          <div className="py-8 text-center">
            <p className="mb-4 text-muted-foreground">
              Memory aids feature coming soon
            </p>
          </div>
        </Card>
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

  // Auto-play audio for listening type
  useEffect(() => {
    if (vocabItem.studyType === "listening" && !hasAutoPlayed.current) {
      const audio = new Audio(vocabItem.audioUrl);
      audio.play();
      hasAutoPlayed.current = true;
    }
  }, [vocabItem]);

  // Focus input on mount for non-"new" study types
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

  const handleGiveUp = useCallback(() => {
    onSubmit("");
  }, [onSubmit]);

  // Handle Enter key
  useEffect(() => {
    if (vocabItem.studyType === "new") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, vocabItem.studyType]);

  if (vocabItem.studyType === "new") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold">New Word</h1>
          </div>
          <VocabOverview vocabItem={vocabItem} />
          <div className="mt-8 flex justify-center">
            <Button size="lg" onClick={() => onSubmit("")}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Study Type Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold capitalize">
            {vocabItem.studyType}
          </h1>
        </div>

        {/* Main Content Area */}
        <Card className="mb-8 p-12">
          {vocabItem.studyType === "reading" && (
            <div className="text-center">
              <div className="mb-8 text-8xl font-bold">
                {vocabItem.vocabItem}
              </div>
            </div>
          )}

          {vocabItem.studyType === "listening" && (
            <div className="flex flex-col items-center gap-8">
              <Button
                size="lg"
                variant="outline"
                className="h-32 w-32 rounded-full"
                onClick={() => {
                  const audio = new Audio(vocabItem.audioUrl);
                  audio.play();
                }}
              >
                <Volume2 className="h-16 w-16" />
              </Button>
            </div>
          )}

          {vocabItem.studyType === "understanding" && (
            <div className="text-center">
              <div className="mb-4 text-6xl font-bold">
                {vocabItem.vocabItem}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const audio = new Audio(vocabItem.audioUrl);
                  audio.play();
                }}
              >
                <Volume2 className="mr-2 h-4 w-4" />
                Play
              </Button>
            </div>
          )}

          {vocabItem.studyType === "writing" && (
            <div className="text-center">
              <div className="mb-8 text-4xl">{vocabItem.translation}</div>
            </div>
          )}
        </Card>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            {(vocabItem.studyType === "reading" ||
              vocabItem.studyType === "listening" ||
              vocabItem.studyType === "writing") && (
              <Input
                ref={inputRef}
                type="text"
                placeholder="Enter pinyin (e.g., ni3hao3)"
                value={answer}
                onChange={(e) => {
                  const converted = pinyinTone(e.target.value) as string;
                  setAnswer(converted);
                }}
                className="text-center text-2xl"
                autoComplete="off"
              />
            )}

            {vocabItem.studyType === "understanding" && (
              <Input
                ref={inputRef}
                type="text"
                placeholder="Enter English translation"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="text-center text-2xl"
                autoComplete="off"
              />
            )}
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleGiveUp}
            >
              Give Up
            </Button>
            <Button type="submit" className="flex-1" size="lg">
              Submit
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Press Enter to submit
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  isCorrect,
  userVocabItem,
  previousLevel,
  newLevel,
  onNext,
}: {
  isCorrect: boolean;
  userVocabItem: UserVocabItemDto | null;
  previousLevel: number;
  newLevel: number;
  onNext: () => void;
}) {
  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onNext();
      }
    },
    [onNext],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        {/* Result Header */}
        <div className="mb-8 text-center">
          <div
            className={`mb-4 text-6xl font-bold ${
              isCorrect ? "text-green-500" : "text-red-500"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>

          {/* Level Change Display */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="mb-2 text-sm text-muted-foreground">Previous</div>
              <LevelStars level={previousLevel} size="lg" />
            </div>
            <div className="text-4xl text-muted-foreground">→</div>
            <div className="text-center">
              <div className="mb-2 text-sm text-muted-foreground">New</div>
              <LevelStars level={newLevel} size="lg" />
            </div>
          </div>
        </div>

        {/* Vocab Overview - Show for all types in result card */}
        {userVocabItem && (
          <div className="space-y-6">
            {/* Header */}
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="text-6xl font-bold">
                  {userVocabItem.vocabItem}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-2xl text-muted-foreground">
                    {userVocabItem.pinyin}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const audio = new Audio(userVocabItem.audioUrl);
                      audio.play();
                    }}
                  >
                    <Volume2 className="mr-2 h-4 w-4" />
                    Play
                  </Button>
                </div>
              </div>
            </Card>

            {/* Definition */}
            <Card className="p-6">
              <h2 className="mb-2 text-lg font-semibold">Definition</h2>
              <p className="text-foreground">{userVocabItem.translation}</p>
            </Card>

            {/* Decomposition - Only for character types */}
            {userVocabItem.vocabType === "character" &&
              userVocabItem.decomposition && (
                <Card className="p-6">
                  <h2 className="mb-4 text-lg font-semibold">Decomposition</h2>
                  <div className="flex flex-wrap items-center justify-center gap-4 py-8">
                    {userVocabItem.decomposition
                      .split("")
                      .filter(
                        (c: string) =>
                          c !== "？" &&
                          c !== "?" &&
                          !(
                            c.charCodeAt(0) >= 0x2ff0 &&
                            c.charCodeAt(0) <= 0x2fff
                          ),
                      )
                      .map((component: string, index: number) => (
                        <div key={index} className="flex items-center gap-4">
                          {index > 0 && (
                            <span className="text-2xl text-muted-foreground">
                              +
                            </span>
                          )}
                          <Link
                            href={`/dictionary/${encodeURIComponent(component)}`}
                            className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                          >
                            <div className="rounded-md border-2 border-border p-4 text-4xl font-bold transition-colors hover:border-primary">
                              {component}
                            </div>
                          </Link>
                        </div>
                      ))}
                  </div>
                </Card>
              )}
          </div>
        )}

        {/* Next Button */}
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={onNext}>
            Next
          </Button>
        </div>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Press Enter to continue
        </div>
      </div>
    </div>
  );
}

function CompletionScreen() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold">You&apos;re Done!</h1>
        <p className="mb-8 text-xl text-muted-foreground">
          Great work! You&apos;ve completed all the cards in this session.
        </p>
        <Button size="lg" onClick={() => router.push("/study")}>
          Return to Study
        </Button>
      </div>
    </div>
  );
}

function StudyPageContent() {
  const orpc = useORPC();
  const params = useParams();
  const deckId = params.deckId as string;

  // Fetch initial vocab item
  const { data: initialVocabItem } = useSuspenseQuery(
    orpc.study.nextVocabItem.queryOptions({
      input: { deckId },
    }),
  );

  const [currentVocabItem, setCurrentVocabItem] =
    useState<VocabItemStudyDto | null>(initialVocabItem);
  const [showingResult, setShowingResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [previousLevel, setPreviousLevel] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [userVocabItem, setUserVocabItem] = useState<UserVocabItemDto | null>(
    null,
  );
  const [isCompleted, setIsCompleted] = useState(false);

  const submitAnswerMutation = useMutation(
    orpc.study.submitAnswer.mutationOptions({
      onSuccess: (data) => {
        setIsCorrect(data.correct);

        // Get previous level based on study type
        const studyType = currentVocabItem?.studyType as StudyType;
        const levelKey = `${studyType}Level` as
          | "readingLevel"
          | "listeningLevel"
          | "understandingLevel"
          | "writingLevel";

        setPreviousLevel(data.userVocabItem[levelKey]);
        setNewLevel(data.userVocabItem[levelKey]);
        setUserVocabItem(data.userVocabItem);
        setShowingResult(true);

        // Check if session is complete
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

    submitAnswerMutation.mutate({
      deckId,
      answer: {
        vocabItemId: currentVocabItem.id,
        userId: "", // Will be filled by backend
        deckId,
        studyType: currentVocabItem.studyType,
        answer,
      },
    });
  };

  const handleNext = () => {
    setShowingResult(false);
  };

  if (isCompleted) {
    return <CompletionScreen />;
  }

  if (!currentVocabItem) {
    return <CompletionScreen />;
  }

  if (showingResult) {
    return (
      <ResultCard
        isCorrect={isCorrect}
        userVocabItem={userVocabItem}
        previousLevel={previousLevel}
        newLevel={newLevel}
        onNext={handleNext}
      />
    );
  }

  return <StudyCard key={currentVocabItem.id} vocabItem={currentVocabItem} onSubmit={handleSubmit} />;
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
