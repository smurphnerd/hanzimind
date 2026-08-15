"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mika } from "@/components/mika";
import { authClient } from "@/lib/authClient";

/**
 * The gate for every admin screen.
 *
 * The server re-checks on each admin endpoint, so this is presentation only — it
 * decides what to render, never what is permitted.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  // Sent back without its leading slash: the sign-in page appends it to the base
  // URL itself, to keep the callback from becoming an open redirect.
  const returnTo = usePathname().replace(/^\//, "");

  // Admin status rides on the session now, so there is nothing extra to wait on.
  const isAdmin = session?.user?.role === "admin";

  if (isPending) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mb-8 h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session?.user || !isAdmin) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Mika pose="peek" size={96} />
            <h1 className="font-display text-2xl font-bold">
              {session?.user ? "Admins only" : "Sign in required"}
            </h1>
            <p className="text-muted-foreground">
              {session?.user
                ? "Your account doesn't have admin access."
                : "Sign in with an admin account to manage HanziMind."}
            </p>
            <Button asChild>
              <Link
                href={
                  session?.user
                    ? "/"
                    : `/signin?redirectUrl=${encodeURIComponent(returnTo)}`
                }
              >
                {session?.user ? "Back home" : "Sign In"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
