"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Mika } from "@/components/mika";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/authClient";

export default function VerifiedPage() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !isPending && !!session?.user;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Card className="w-[30rem] max-w-full">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <Mika pose="cheer" size={96} />

          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-5" />
            <span className="font-display text-sm font-bold tracking-wide uppercase">
              Email verified
            </span>
          </div>

          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            You&apos;re all set!
          </h1>
          <p className="text-sm text-muted-foreground">
            {signedIn
              ? "Your account is verified and you're signed in. Time to grow your first sprout."
              : "Your email address has been confirmed. Sign in to start learning."}
          </p>

          <Button asChild size="lg" className="mt-2">
            <Link href={signedIn ? "/study" : "/signin"}>
              {signedIn ? "Start studying" : "Sign in"}
              <ArrowRight className="size-5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
