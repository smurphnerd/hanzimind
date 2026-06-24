"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { Volume2, ArrowRight, Trophy, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
      <Card className="relative overflow-hidden ornament-corners">
        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-primary via-vermillion to-primary" />
        <CardContent className="pt-8 pb-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center">
              <span className="font-brush text-5xl text-primary">{vocabItem.vocabItem}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="font-brush text-2xl text-gold">
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
        </CardContent>
      </Card>

      {/* Definition */}
      <Card>
        <CardHeader>
          <CardTitle className="font-brush text-xl">Definition</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg text-foreground">{vocabItem.translation}</p>
        </CardContent>
      </Card>

      {/* Visuals - Two Column Layout */}
      {vocabItem.vocabType === "character" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Stroke Order Animation */}
          {vocabItem.strokes && (
            <Card>
              <CardHeader>
                <CardTitle className="font-brush text-xl">Stroke Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-gold/30 bg-cream">
                  <span className="text-sm text-muted-foreground">
                    [SVG ANIMATION]
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Decomposition */}
          <Card>
            <CardHeader>
              <CardTitle className="font-brush text-xl">Decomposition</CardTitle>
            </CardHeader>
            <CardContent>
              {vocabItem.decomposition ? (
                <div className="flex flex-wrap items-center justify-center gap-4 py-6">
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
                          <span className="text-2xl text-gold">+</span>
                        )}
                        <Link
                          href={`/dictionary/${encodeURIComponent(component)}`}
                          className="group"
                        >
                          <div className="h-16 w-16 rounded-lg border-2 border-gold/50 bg-rice-paper flex items-center justify-center text-3xl font-brush text-primary transition-all group-hover:border-gold group-hover:shadow-md">
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Memory Aids - Only for character and compound types */}
      {(vocabItem.vocabType === "character" ||
        vocabItem.vocabType === "compound") && (
        <Card>
          <CardHeader>
            <CardTitle className="font-brush text-xl">Memory Aids</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                Memory aids feature coming soon
              </p>
            </div>
          </CardContent>
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
      <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-8 text-center">
            <h1 className="font-brush text-4xl text-primary brush-underline">New Word</h1>
            <p className="mt-2 text-gold font-brush text-xl">新词</p>
          </div>
          <VocabOverview vocabItem={vocabItem} />
          <div className="mt-8 flex justify-center">
            <Button size="lg" onClick={() => onSubmit("")}>
              Continue
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const studyTypeLabels: Record<string, { en: string; zh: string }> = {
    reading: { en: "Reading", zh: "阅读" },
    listening: { en: "Listening", zh: "听力" },
    understanding: { en: "Understanding", zh: "理解" },
    writing: { en: "Writing", zh: "写作" },
  };

  const currentType = studyTypeLabels[vocabItem.studyType] || { en: vocabItem.studyType, zh: "" };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Study Type Header */}
        <div className="mb-8 text-center">
          <h1 className="font-brush text-3xl text-primary">{currentType.en}</h1>
          <p className="text-gold font-brush text-xl">{currentType.zh}</p>
        </div>

        {/* Main Content Area */}
        <Card className="mb-8 ornament-corners">
          <CardContent className="py-12">
            {vocabItem.studyType === "reading" && (
              <div className="text-center">
                <div className="h-36 w-36 mx-auto rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center mb-4">
                  <span className="font-brush text-7xl text-primary">{vocabItem.vocabItem}</span>
                </div>
              </div>
            )}

            {vocabItem.studyType === "listening" && (
              <div className="flex flex-col items-center gap-8">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-32 w-32 rounded-full border-4 border-gold hover:border-gold-bright hover:bg-gold/10"
                  onClick={() => {
                    const audio = new Audio(vocabItem.audioUrl);
                    audio.play();
                  }}
                >
                  <Volume2 className="h-16 w-16 text-primary" />
                </Button>
                <p className="text-muted-foreground">Click to play again</p>
              </div>
            )}

            {vocabItem.studyType === "understanding" && (
              <div className="text-center">
                <div className="h-28 w-28 mx-auto rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center mb-4">
                  <span className="font-brush text-5xl text-primary">{vocabItem.vocabItem}</span>
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
                <p className="font-brush text-3xl text-gold mb-4">{vocabItem.translation}</p>
              </div>
            )}
          </CardContent>
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
                className="text-center text-2xl h-14"
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
                className="text-center text-2xl h-14"
                autoComplete="off"
              />
            )}
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="lg"
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
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        {/* Result Header */}
        <div className="mb-8 text-center">
          <div className={`mb-4 font-brush text-6xl ${isCorrect ? "text-green-600" : "text-primary"}`}>
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>
          <p className="font-brush text-2xl text-gold">
            {isCorrect ? "正确" : "不正确"}
          </p>

          {/* Level Change Display */}
          <Card className="mt-6 inline-block">
            <CardContent className="py-4 px-8">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="mb-2 text-sm text-muted-foreground">Previous</div>
                  <LevelStars level={previousLevel} size="lg" />
                </div>
                <div className="text-3xl text-gold">→</div>
                <div className="text-center">
                  <div className="mb-2 text-sm text-muted-foreground">New</div>
                  <LevelStars level={newLevel} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section Divider */}
        <div className="divider-ornamental mb-6">
          <span className="medallion">词</span>
        </div>

        {/* Vocab Overview - Show for all types in result card */}
        {userVocabItem && (
          <div className="space-y-6">
            {/* Header */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold-bright to-gold" />
              <CardContent className="pt-6 pb-4">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 rounded-full border-3 border-gold bg-rice-paper flex items-center justify-center">
                    <span className="font-brush text-4xl text-primary">{userVocabItem.vocabItem}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="font-brush text-2xl text-gold">
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
              </CardContent>
            </Card>

            {/* Definition */}
            <Card>
              <CardHeader>
                <CardTitle className="font-brush text-xl">Definition</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-foreground">{userVocabItem.translation}</p>
              </CardContent>
            </Card>

            {/* Decomposition - Only for character types */}
            {userVocabItem.vocabType === "character" &&
              userVocabItem.decomposition && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-brush text-xl">Decomposition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-center gap-4 py-4">
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
                              <span className="text-2xl text-gold">+</span>
                            )}
                            <Link
                              href={`/dictionary/${encodeURIComponent(component)}`}
                              className="group"
                            >
                              <div className="h-16 w-16 rounded-lg border-2 border-gold/50 bg-rice-paper flex items-center justify-center text-3xl font-brush text-primary transition-all group-hover:border-gold">
                                {component}
                              </div>
                            </Link>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        )}

        {/* Next Button */}
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={onNext}>
            Next
            <ArrowRight className="ml-2 h-5 w-5" />
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
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center p-8">
      <Card className="max-w-lg ornament-corners">
        <CardContent className="py-12 text-center">
          <div className="h-24 w-24 mx-auto mb-6 rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center">
            <Trophy className="h-12 w-12 text-gold" />
          </div>
          <h1 className="mb-2 font-brush text-5xl text-primary">Complete!</h1>
          <p className="mb-2 font-brush text-2xl text-gold">完成</p>
          <p className="mb-8 text-lg text-muted-foreground">
            Great work! You&apos;ve completed all the cards in this session.
          </p>
          <Button size="lg" onClick={() => router.push("/study")}>
            <BookOpen className="mr-2 h-5 w-5" />
            Return to Study
          </Button>
        </CardContent>
      </Card>
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
