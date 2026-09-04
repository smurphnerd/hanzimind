"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Mika } from "@/components/mika";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The emailed link lands here rather than on better-auth's callback, because
 * that callback answers JSON: a refusal would reach the learner as a bare
 * `{"message":...}` in the address bar. This page makes the call and renders
 * whatever comes back.
 */
// A token is spent by the first call, refusal or not, so it must be sent once
// even though React mounts a client component twice in development.
const sent = new Map<string, Promise<string | null>>();

async function confirmDeletion(token: string) {
  const existing = sent.get(token);
  if (existing) return existing;
  const attempt = (async () => {
    const response = await fetch(
      `/api/auth/delete-user/callback?token=${encodeURIComponent(token)}&callbackURL=/`,
      { redirect: "manual" },
    );
    if (response.ok || response.type === "opaqueredirect") return null;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    // better-auth answers "Invalid token" for a spent link and for nonsense
    // alike, and answers 500 for anything that went wrong on our side. Neither
    // tells a learner what to do, so only a refusal this app wrote is worth
    // repeating; everything else gets a sentence that names the real state.
    if (
      response.status === 400 &&
      body?.message &&
      body.message !== "Invalid token"
    ) {
      return body.message;
    }
    if (response.status >= 500) {
      return "Something went wrong on our side and the account was not deleted. Nothing has been removed. Please try again from your profile, and tell us if it keeps happening.";
    }
    return "That link has expired or has already been used. Ask for a new one from your profile.";
  })();
  sent.set(token, attempt);
  return attempt;
}

export default function DeleteAccountClientPage() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<
    | { status: "working" }
    | { status: "done" }
    | { status: "refused"; message: string }
  >({ status: "working" });

  useEffect(() => {
    if (!token) return;
    let live = true;
    void confirmDeletion(token).then((message) => {
      if (!live) return;
      setState(message ? { status: "refused", message } : { status: "done" });
    });
    return () => {
      live = false;
    };
  }, [token]);

  const card = (
    pose: "read" | "cheer" | "peek",
    heading: string,
    body: string,
    action: { href: string; label: string },
  ) => (
    <div className="flex flex-1 flex-col items-center justify-center py-8">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Mika pose={pose} size={56} />
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {heading}
          </h1>
          <p className="text-muted-foreground">{body}</p>
          <Button asChild className="mt-2">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  if (!token) {
    return card(
      "peek",
      "That link doesn't work",
      "A deletion link works once. Ask for a new one from your profile.",
      { href: "/profile", label: "Back to profile" },
    );
  }
  if (state.status === "refused") {
    return card("peek", "We couldn't delete this account", state.message, {
      href: "/profile",
      label: "Back to profile",
    });
  }
  if (state.status === "done") {
    return card(
      "cheer",
      "Your account is gone",
      "Everything you had grown has been deleted. Thank you for studying with us.",
      { href: "/", label: "Back to HanziMind" },
    );
  }
  return card(
    "read",
    "Deleting your account",
    "One moment while we remove your account and everything in it.",
    { href: "/profile", label: "Back to profile" },
  );
}
