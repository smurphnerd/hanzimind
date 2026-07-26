"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeckCreationForm } from "@/components/deck-creation-form";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mika } from "@/components/mika";

export default function NewDeckPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/signin?redirectUrl=decks/new");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <div className="flex items-center justify-center py-16">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mb-6 flex justify-center">
              <Mika pose="peek" size={96} />
            </div>
            <h1 className="font-display text-foreground mb-4 text-2xl font-bold tracking-tight">
              Authentication Required
            </h1>
            <p className="text-muted-foreground mb-6">
              You must be logged in to create a deck.
            </p>
            <Button asChild size="lg">
              <Link href="/signin?redirectUrl=decks/new">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-10">
      <div className="mb-8 text-center">
        <h1 className="font-display text-foreground mb-4 text-4xl font-extrabold tracking-tight">
          Create New Deck
        </h1>
        <p className="text-muted-foreground">
          Create a new vocabulary deck to start learning Chinese characters.
        </p>
      </div>

      <Card>
        <CardContent className="pt-8">
          <DeckCreationForm />
        </CardContent>
      </Card>
    </div>
  );
}
