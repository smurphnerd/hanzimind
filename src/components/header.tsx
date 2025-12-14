"use client";

import Link from "next/link";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

export function Header() {
  const { data: session } = authClient.useSession();

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold">
          HanziMind
        </Link>

        <nav className="flex items-center gap-4">
          {session?.user ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/decks">Decks</Link>
              </Button>
              <Button asChild>
                <Link href="/decks/new">Create Deck</Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href="/signin">Sign In</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
