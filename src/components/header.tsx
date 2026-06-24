"use client";

import Link from "next/link";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

export function Header() {
  const { data: session } = authClient.useSession();

  return (
    <header className="imperial-gradient pattern-lattice relative border-b-4 border-gold">
      {/* Decorative top border */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold-bright to-transparent" />

      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        {/* Logo with brush stroke font */}
        <Link
          href="/"
          className="font-brush text-3xl text-cream tracking-wide hover:text-gold-bright transition-colors duration-300 drop-shadow-md"
        >
          漢字心
          <span className="ml-2 text-lg font-sans font-medium text-gold">HanziMind</span>
        </Link>

        <nav className="flex items-center gap-2">
          {session?.user ? (
            <>
              <Button asChild variant="ghost" className="text-cream hover:text-gold-bright hover:bg-white/10">
                <Link href="/decks">Decks</Link>
              </Button>
              <Button asChild variant="ghost" className="text-cream hover:text-gold-bright hover:bg-white/10">
                <Link href="/study">Study</Link>
              </Button>
              <Button asChild variant="ghost" className="text-cream hover:text-gold-bright hover:bg-white/10">
                <Link href="/dictionary">Dictionary</Link>
              </Button>
              <Button asChild variant="ghost" className="text-cream hover:text-gold-bright hover:bg-white/10">
                <Link href="/profile">Profile</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-cream hover:text-gold-bright hover:bg-white/10">
                <Link href="/signin">Sign In</Link>
              </Button>
              <Button
                asChild
                className="bg-gold text-ink hover:bg-gold-bright border-none"
              >
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>

      {/* Decorative wave pattern at bottom */}
      <div className="absolute inset-x-0 -bottom-2 h-2 pattern-waves opacity-60" />
    </header>
  );
}
