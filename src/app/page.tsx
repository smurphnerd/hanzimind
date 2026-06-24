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
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-brush text-primary text-sm">心</span>
          </div>
        </div>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        {/* Welcome Card with lantern styling */}
        <Card className="relative mb-12 overflow-hidden ornament-corners">
          {/* Decorative top accent */}
          <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-primary via-vermillion to-primary" />

          <CardContent className="py-16 text-center">
            <p className="font-brush text-2xl text-gold mb-2">欢迎回来</p>
            <Button size="lg" className="mb-4 text-lg" asChild>
              <Link href="/study">RESUME STUDYING</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Last Deck: HSK 1 Standard Course
            </p>
          </CardContent>
        </Card>

        {/* Section divider */}
        <div className="divider-ornamental mb-8">
          <span className="medallion">学</span>
        </div>

        <h2 className="mb-8 text-center">
          <span className="font-brush text-3xl text-primary brush-underline">
            Your Progress
          </span>
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Progress Cards with lantern tops */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 flex justify-center">
              <div className="h-3 w-16 rounded-b-full bg-gradient-to-b from-gold to-gold-bright shadow-md" />
            </div>
            <CardHeader className="pt-8">
              <CardTitle className="text-center font-brush text-xl">
                Total Cards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-4xl font-bold text-primary">150</p>
              <p className="text-center text-sm text-gold mt-1">字</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 flex justify-center">
              <div className="h-3 w-16 rounded-b-full bg-gradient-to-b from-gold to-gold-bright shadow-md" />
            </div>
            <CardHeader className="pt-8">
              <CardTitle className="text-center font-brush text-xl">
                Day Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-4xl font-bold text-primary">5</p>
              <p className="text-center text-sm text-gold mt-1">天</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 flex justify-center">
              <div className="h-3 w-16 rounded-b-full bg-gradient-to-b from-gold to-gold-bright shadow-md" />
            </div>
            <CardHeader className="pt-8">
              <CardTitle className="text-center font-brush text-xl">
                Reviews Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-4xl font-bold text-primary">20</p>
              <p className="text-center text-sm text-gold mt-1">复习</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Landing page for non-authenticated users
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4">
      <div className="max-w-3xl text-center">
        {/* Decorative top element */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-4 border-gold flex items-center justify-center bg-rice-paper shadow-lg">
              <span className="font-brush text-5xl text-primary">心</span>
            </div>
            <div className="absolute -inset-4 rounded-full border border-gold/30" />
          </div>
        </div>

        <h1 className="mb-6">
          <span className="font-brush text-5xl tracking-wide text-primary sm:text-6xl md:text-7xl brush-underline">
            Master Chinese
          </span>
        </h1>

        <p className="mb-4 font-brush text-2xl text-gold">
          学中文，懂中国
        </p>

        <p className="mb-10 text-lg text-muted-foreground sm:text-xl max-w-xl mx-auto">
          Clean, focused, and efficient flashcard learning with stroke animations,
          pinyin, and spaced repetition.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button size="lg" variant="outline" className="text-lg px-8" asChild>
            <Link href="/signin">LOG IN</Link>
          </Button>
          <Button size="lg" className="text-lg px-8" asChild>
            <Link href="/signup">START LEARNING</Link>
          </Button>
        </div>

        {/* Decorative bottom element */}
        <div className="mt-16 divider-ornamental">
          <span className="medallion">福</span>
        </div>
      </div>
    </div>
  );
}
