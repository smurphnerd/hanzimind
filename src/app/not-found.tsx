import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Renders inside the root layout, so the header's Study, Decks and Dictionary
 * links are already on the page — these are the same three within reach of the
 * thumb, for the phone width where that nav collapses behind a menu.
 */
export default function NotFound() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        pose="peek"
        title="This page does not exist"
        description="The link may be out of date, or the character may not be in the dictionary yet."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/">Go home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dictionary">Dictionary</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/decks">Decks</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
