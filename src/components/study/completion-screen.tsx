"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Mika } from "@/components/mika";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The two ways a session ends with no card on screen.
 *
 * They are separate components, not one with a flag, because they are reached
 * from different phases of the session and only the reducer can tell them
 * apart: `complete` is only ever entered by answering the last card, `empty`
 * only by opening a deck that had nothing due. Collapsing them is exactly the
 * defect that shipped once — an empty deck congratulating a learner for
 * clearing every card in a session they never started.
 */
export function CompletionScreen() {
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

export function NothingDueScreen({ deckId }: { deckId: string }) {
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
