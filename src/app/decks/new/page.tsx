"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeckCreationForm } from "@/components/deck-creation-form";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-primary" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-brush text-primary text-sm">心</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="container mx-auto max-w-2xl py-10">
        <Card className="ornament-corners">
          <CardContent className="py-12 text-center">
            <div className="mb-6">
              <div className="h-16 w-16 mx-auto rounded-full border-3 border-gold bg-rice-paper flex items-center justify-center">
                <span className="font-brush text-3xl text-primary">锁</span>
              </div>
            </div>
            <h1 className="font-brush text-2xl text-primary mb-4">Authentication Required</h1>
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
        <h1 className="font-brush text-4xl text-primary brush-underline mb-4">
          Create New Deck
        </h1>
        <p className="text-muted-foreground">
          Create a new vocabulary deck to start learning Chinese characters.
        </p>
      </div>

      {/* Section Divider */}
      <div className="divider-ornamental mb-8">
        <span className="medallion">新</span>
      </div>

      <Card className="ornament-corners">
        <CardContent className="pt-8">
          <DeckCreationForm />
        </CardContent>
      </Card>
    </div>
  );
}
