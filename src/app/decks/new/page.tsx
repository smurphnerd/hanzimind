"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeckCreationForm } from "@/components/deck-creation-form";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

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
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground mb-6">
            You must be logged in to create a deck.
          </p>
          <Button asChild>
            <Link href="/signin?redirectUrl=decks/new">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create New Deck</h1>
        <p className="text-muted-foreground mt-2">
          Create a new vocabulary deck to start learning Chinese characters.
        </p>
      </div>
      <DeckCreationForm />
    </div>
  );
}
