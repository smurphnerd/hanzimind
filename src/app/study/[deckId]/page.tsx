"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Suspense, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfettiBurst } from "@/components/confetti-burst";
import { ErrorBoundary } from "@/components/error-boundary";
import { StudyLoading } from "@/components/study-loading";
import {
  CompletionScreen,
  NothingDueScreen,
} from "@/components/study/completion-screen";
import { ResultCard } from "@/components/study/result-card";
import { StudyCard } from "@/components/study/study-card";
import { useORPC } from "@/lib/orpc.client";
import { playAnswerSound } from "@/lib/sounds";
import {
  initialStudySession,
  isGraded,
  studySessionReducer,
} from "@/lib/study-session";
import { useHydrated } from "@/lib/use-hydrated";

function StudySession() {
  const orpc = useORPC();
  const params = useParams();
  const queryClient = useQueryClient();
  const deckId = params.deckId as string;

  const { data: firstVocabItem } = useSuspenseQuery(
    orpc.study.nextVocabItem.queryOptions({ input: { deckId } }),
  );

  // The machine's one `loaded` transition, run in the initializer rather than
  // from an effect. The query has already suspended, so the first card is in
  // hand at the first render; dispatching it afterwards would cost a second
  // render and a frame of the wrong screen. Later refetches of this query —
  // the invalidation below causes one — deliberately do not reach the session:
  // the cards after the first arrive with the answer that earned them.
  const [session, dispatch] = useReducer(
    studySessionReducer,
    firstVocabItem,
    (vocabItem) =>
      studySessionReducer(initialStudySession, { type: "loaded", vocabItem }),
  );

  const [confettiKey, setConfettiKey] = useState(0);

  // `isPending` is React state, so it is still false for a second call made in
  // the same tick — a ref flips synchronously and actually blocks the double.
  const submitInFlight = useRef(false);

  const submitAnswerMutation = useMutation(
    orpc.study.submitAnswer.mutationOptions({
      onSuccess: () => {
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
      },
      onError: () =>
        toast.error("Couldn't save that answer. Try again in a moment."),
    }),
  );

  const submit = (answer: string, surrendered: boolean) => {
    if (session.phase !== "card") return;
    // Ignore repeat Enter presses / clicks while an answer is in flight,
    // otherwise the SRS level advances twice for one card.
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    const { card } = session;
    submitAnswerMutation.mutate(
      {
        deckId,
        answer: { vocabItemId: card.id, studyType: card.studyType, answer },
      },
      {
        // Per call rather than in mutationOptions, because only the call knows
        // what was typed and whether the learner gave up. The reducer decides
        // what that means for the card in hand.
        onSuccess: (result) => {
          dispatch(
            surrendered
              ? { type: "gaveUp", result }
              : { type: "answered", answer, result },
          );
          // An intro card earns neither, and `isGraded` is the same rule the
          // reducer uses to decide there is no result screen — so the two
          // cannot drift into disagreeing about what an intro card is.
          if (!isGraded(card)) return;
          playAnswerSound(result.correct);
          // The key only ever climbs, so the burst outlives the result screen
          // rather than being cancelled the moment Next unmounts it.
          if (result.correct) setConfettiKey((key) => key + 1);
        },
        // Released here rather than in mutationOptions: that object is built
        // during render, and reading a ref there is disallowed.
        onSettled: () => (submitInFlight.current = false),
      },
    );
  };

  // Unreachable: the initializer always leaves `loading`. Rendering the same
  // fallback the route already uses is cheaper than an assertion nobody reads.
  if (session.phase === "loading") return <StudyLoading />;
  if (session.phase === "empty") return <NothingDueScreen deckId={deckId} />;
  if (session.phase === "complete") return <CompletionScreen />;

  return (
    <>
      <ConfettiBurst trigger={confettiKey} />
      {session.phase === "result" ? (
        <ResultCard
          deckId={deckId}
          graded={session.graded}
          onNext={() => dispatch({ type: "next" })}
        />
      ) : (
        <StudyCard
          // The same item can come back for a different study type, and the
          // answer field and the once-only autoplay both have to reset when it
          // does — so the type is part of the identity, not just the id.
          key={`${session.card.id}:${session.card.studyType}`}
          card={session.card}
          onAnswer={(answer) => submit(answer, false)}
          onGiveUp={() => submit("", true)}
        />
      )}
    </>
  );
}

export default function StudyPage() {
  const hydrated = useHydrated();
  return (
    <ErrorBoundary>
      <Suspense fallback={<StudyLoading />}>
        {hydrated ? <StudySession /> : <StudyLoading />}
      </Suspense>
    </ErrorBoundary>
  );
}
