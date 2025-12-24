"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/authClient";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <Card className="mb-8">
          <CardContent className="py-12 text-center">
            <Button size="lg" className="mb-4" asChild>
              <Link href="/study">RESUME STUDYING</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Last Deck: HSK 1 Standard Course
            </p>
          </CardContent>
        </Card>

        <h2 className="mb-6 text-2xl font-semibold">YOUR PROGRESS</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Total Cards</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-3xl font-bold">150</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Day Streak</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-3xl font-bold">5</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Reviews Due</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-3xl font-bold">20</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Master Chinese Vocabulary
        </h1>
        <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
          Clean, focused, and efficient flashcard learning.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button size="lg" variant="outline" asChild>
            <Link href="/auth/signin">LOG IN</Link>
          </Button>
          <Button size="lg" asChild>
            <Link href="/auth/signup">SIGN UP</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
