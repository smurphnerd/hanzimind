"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ORPCError } from "@orpc/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Mika } from "@/components/mika";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useORPC } from "@/lib/orpc.client";
import { cn } from "@/lib/utils";
import {
  SUGGESTION_BODY_MAX,
  type SuggestionKind,
} from "@/definitions/definitions";

const KIND_OPTIONS: { value: SuggestionKind; label: string; hint: string }[] = [
  {
    value: "translation",
    label: "The meaning is wrong",
    hint: "The English definition doesn't match",
  },
  {
    value: "pinyin",
    label: "The reading is wrong",
    hint: "Wrong pinyin or wrong tone",
  },
  {
    value: "decomposition",
    label: "The breakdown is wrong",
    hint: "The parts it's built from look off",
  },
  {
    value: "audio",
    label: "The audio is wrong",
    hint: "Missing, unclear, or the wrong word",
  },
  {
    value: "memoryAid",
    label: "A memory aid is a problem",
    hint: "Unhelpful, wrong, or inappropriate",
  },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being reported, echoed in the header so there's no ambiguity. */
  subject: string;
  vocabItemId?: string | null;
  memoryAidId?: string | null;
}

export function ReportIssueDialog({
  open,
  onOpenChange,
  subject,
  vocabItemId,
  memoryAidId,
}: ReportIssueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold tracking-tight">
            Report a problem
          </DialogTitle>
          <DialogDescription>
            About{" "}
            <span className="text-foreground font-semibold">{subject}</span>.
            Every report is read by a human — thank you for helping the garden
            grow.
          </DialogDescription>
        </DialogHeader>

        {/* One dialog serves many targets, and the content unmounts when it
            closes — so keeping the form here is what makes it start fresh, and
            pre-picked, on every open. */}
        <ReportIssueBody
          onOpenChange={onOpenChange}
          vocabItemId={vocabItemId}
          memoryAidId={memoryAidId}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dictionary is public but `suggestions.create` is not, so an anonymous
 * reader can reach every report button on the page. Checking the session here —
 * rather than at each of the three call sites — means they are told before
 * writing a paragraph, instead of after, when the 401 would surface as a
 * generic "please try again" that can never succeed.
 */
function ReportIssueBody({
  onOpenChange,
  vocabItemId,
  memoryAidId,
}: Pick<
  ReportIssueDialogProps,
  "onOpenChange" | "vocabItemId" | "memoryAidId"
>) {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  if (isPending) {
    return (
      <div className="flex justify-center py-10">
        <div className="border-muted border-t-primary size-8 animate-spin rounded-full border-4" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Mika pose="peek" size={72} />
        <p className="text-muted-foreground text-sm">
          Reports are tied to an account so we can follow up on them. Sign in and
          we&apos;ll bring you right back here.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href={`/signin?redirectUrl=${encodeURIComponent(pathname)}`}>
              Sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReportIssueForm
      onOpenChange={onOpenChange}
      vocabItemId={vocabItemId}
      memoryAidId={memoryAidId}
    />
  );
}

function ReportIssueForm({
  onOpenChange,
  vocabItemId,
  memoryAidId,
}: Pick<
  ReportIssueDialogProps,
  "onOpenChange" | "vocabItemId" | "memoryAidId"
>) {
  const orpc = useORPC();
  const [kind, setKind] = useState<SuggestionKind>(
    memoryAidId ? "memoryAid" : "translation",
  );
  const [body, setBody] = useState("");

  const createMutation = useMutation(
    orpc.suggestions.create.mutationOptions({
      onSuccess: () => {
        toast.success("Thanks! We'll take a look.");
        onOpenChange(false);
      },
      onError: (error) => {
        // The limiter is a normal thing to hit, not a failure — say so plainly
        // instead of dressing it up as an error the user should worry about.
        if (error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS") {
          toast.info(
            "You've sent a lot of suggestions in the last hour — try again later.",
          );
          return;
        }
        // ReportIssueBody keeps anonymous users out of this form, so reaching
        // here means the session expired while it was open. "Try again" would
        // be a lie — retrying fails identically until they sign back in.
        if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
          toast.error("Your session expired — sign in again to send this.");
          return;
        }
        toast.error("Couldn't send that. Please try again.");
      },
    }),
  );

  const trimmed = body.trim();
  const overLimit = body.length > SUGGESTION_BODY_MAX;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || overLimit) return;

    createMutation.mutate({
      kind,
      body: trimmed,
      vocabItemId: vocabItemId ?? null,
      memoryAidId: memoryAidId ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <RadioGroup
        value={kind}
        onValueChange={(value) => setKind(value as SuggestionKind)}
        className="gap-2"
      >
        {KIND_OPTIONS.map((option) => (
          <Label
            key={option.value}
            htmlFor={`report-kind-${option.value}`}
            className={cn(
              "hover:bg-muted flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
              kind === option.value
                ? "border-primary bg-secondary"
                : "border-border",
            )}
          >
            <RadioGroupItem
              id={`report-kind-${option.value}`}
              value={option.value}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block font-display font-bold">
                {option.label}
              </span>
              <span className="text-muted-foreground block text-xs font-normal">
                {option.hint}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      <div className="space-y-2">
        <Label htmlFor="report-body">What&apos;s wrong?</Label>
        <Textarea
          id="report-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Tell us what you'd expect to see instead…"
          rows={4}
          className="resize-none"
        />
        <p
          className={cn(
            "text-right text-xs tabular-nums",
            overLimit ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {body.length}/{SUGGESTION_BODY_MAX}
        </p>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!trimmed || overLimit || createMutation.isPending}
        >
          {createMutation.isPending ? "Sending…" : "Send report"}
        </Button>
      </DialogFooter>
    </form>
  );
}
