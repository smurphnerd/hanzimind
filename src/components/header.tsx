"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/authClient";
import { useORPC } from "@/lib/orpc.client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Mika } from "@/components/mika";

const navLinks = [
  { href: "/study", label: "Study" },
  { href: "/decks", label: "Decks" },
  { href: "/dictionary", label: "Dictionary" },
  { href: "/profile", label: "Profile" },
];

const adminLinks = [
  { href: "/admin/vocab", label: "Vocabulary" },
  { href: "/admin/suggestions", label: "Suggestions" },
];

export function Header() {
  const { data: session } = authClient.useSession();
  const orpc = useORPC();

  // Whether *you* are an admin, decided server-side — ADMIN_EMAILS never reaches
  // the client. Hiding the link is cosmetic; the endpoints enforce access.
  const { data: profile } = useQuery({
    ...orpc.getProfile.queryOptions({}),
    enabled: !!session?.user,
  });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md backdrop-saturate-150">
      <div className="container mx-auto flex h-16 items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          <Mika pose="peek" size={32} />
          HanziMind
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {session?.user &&
            navLinks.map((link) => (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}

          {session?.user && profile?.isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Admin
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {adminLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href}>{link.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {session?.user ? (
            <Link
              href="/profile"
              aria-label="Your profile"
              title={session.user.name ?? session.user.email ?? "Profile"}
              className="flex size-9 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent uppercase transition-colors hover:bg-accent/25"
            >
              {(session.user.name ?? session.user.email ?? "?")
                .charAt(0)
                .toUpperCase()}
            </Link>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/signin">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
