"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Mika } from "@/components/mika";
import { cn } from "@/lib/utils";
import { isCurrentPage } from "@/lib/nav";

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
  const pathname = usePathname();

  // Admin status rides on the session as `user.role`. Hiding the link is
  // cosmetic; the endpoints enforce access regardless.
  const isAdmin = session?.user?.role === "admin";

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
                className={cn(
                  "text-muted-foreground hover:text-foreground",
                  isCurrentPage(pathname, link.href) && "text-foreground",
                )}
              >
                <Link
                  href={link.href}
                  aria-current={
                    isCurrentPage(pathname, link.href) ? "page" : undefined
                  }
                >
                  {link.label}
                </Link>
              </Button>
            ))}

          {session?.user && isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    isCurrentPage(pathname, "/admin") && "text-foreground",
                  )}
                >
                  Admin
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {adminLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      aria-current={
                        isCurrentPage(pathname, link.href) ? "page" : undefined
                      }
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Below 640px the nav above is display:none, which left a signed-in
              learner with no way to reach Study, Decks, Dictionary, Profile or
              Admin at all. Same links, same order, in a menu. */}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  className="sm:hidden"
                >
                  <Menu className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {navLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      aria-current={
                        isCurrentPage(pathname, link.href) ? "page" : undefined
                      }
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {isAdmin &&
                  adminLinks.map((link) => (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link
                        href={link.href}
                        aria-current={
                          isCurrentPage(pathname, link.href)
                            ? "page"
                            : undefined
                        }
                      >
                        Admin: {link.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <ThemeToggle />
          {session?.user ? (
            // The one place a tooltip is NOT worth it. The header sits in the
            // root layout, so a Radix tooltip here puts @radix-ui/react-tooltip
            // in every route's layout chunk — measured at 9,533 bytes on
            // /dictionary/[word], which is most of that route's budget for the
            // whole of this PR. The account name moves into the accessible
            // name instead, so assistive tech still gets it; what is lost is
            // revealing it by hovering with a mouse.
            <Link
              href="/profile"
              aria-label={`Your profile — ${session.user.name ?? session.user.email ?? "signed in"}`}
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
