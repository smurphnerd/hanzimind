"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Flame, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mika } from "@/components/mika";
import { authClient } from "@/lib/authClient";

function StatTile({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "violet" | "coral" | "green";
  value: string;
  label: string;
}) {
  const toneClass = {
    violet: "bg-type-character-soft text-type-character",
    coral: "bg-secondary text-primary",
    green: "bg-success/15 text-success",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span
          className={`flex size-12 items-center justify-center rounded-2xl ${toneClass}`}
        >
          {icon}
        </span>
        <div>
          <div className="font-display text-2xl font-extrabold tracking-tight">
            {value}
          </div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-10">
        {/* Greeting */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mika pose="wave" size={56} />
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                Welcome back!
              </h1>
              <p className="text-sm text-muted-foreground">
                Your garden&apos;s looking healthy. Let&apos;s keep it growing.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-display text-sm font-bold text-primary">
            <Flame className="size-4" />5 day streak
          </div>
        </div>

        {/* Resume hero */}
        <Card className="mb-6 border-none bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-card">
          <CardContent className="flex items-center gap-5 py-2">
            <div className="font-display text-5xl font-extrabold tracking-tight tabular-nums">
              20
            </div>
            <div className="flex-1">
              <div className="font-display text-lg font-bold">
                Reviews ready today
              </div>
              <div className="text-sm text-primary-foreground/80">
                Continue · HSK 1 Standard Course
              </div>
            </div>
            <Button
              asChild
              variant="secondary"
              size="icon"
              className="size-12 shrink-0 bg-white text-primary hover:bg-white/90"
            >
              <Link href="/study" aria-label="Resume studying">
                <ArrowRight className="size-5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            tone="violet"
            icon={<BookOpen className="size-6" />}
            value="150"
            label="Items learned"
          />
          <StatTile
            tone="coral"
            icon={<Flame className="size-6" />}
            value="5"
            label="Day streak"
          />
          <StatTile
            tone="green"
            icon={<Target className="size-6" />}
            value="20"
            label="Reviews due"
          />
        </div>
      </div>
    );
  }

  // Landing page for logged-out visitors
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="max-w-2xl text-center">
        <div className="mb-6 flex justify-center">
          <Mika pose="wave" size={112} />
        </div>

        <h1 className="font-display text-5xl font-extrabold tracking-tight text-balance sm:text-6xl">
          Master Chinese, one <span className="text-primary">sprout</span> at a
          time
        </h1>

        <p className="hanzi mt-4 text-xl text-muted-foreground">
          学中文，懂中国
        </p>

        <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
          Clean, focused flashcard learning with stroke animations, pinyin, and
          spaced repetition that actually feels good.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" variant="outline" asChild>
            <Link href="/signin">Log in</Link>
          </Button>
          <Button size="lg" asChild>
            <Link href="/signup">
              Start learning
              <ArrowRight className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
