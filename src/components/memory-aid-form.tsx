"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The write-a-memory-aid field, shared by the learner's dialog and the admin's.
 *
 * It owns the draft, so a caller never has to clear it: the draft is dropped the
 * moment a submit is accepted. The two copies this replaces disagreed on almost
 * every affordance — one swapped the button's label for "Creating…", the other
 * its icon for a spinner; one left the field editable mid-write, the other did
 * not; one showed the failure inline, the other as a toast that had vanished by
 * the time the learner looked back at the field. This keeps the spinner, the
 * disabled field and the inline message, and the differences that remain are the
 * ones that mean something: who is writing, and whether there is a way out.
 */
export function MemoryAidForm({
  onSubmit,
  isPending,
  error,
  submitLabel,
  placeholder,
  onCancel,
}: {
  onSubmit: (memoryAid: string) => void;
  isPending: boolean;
  /** Rendered under the field. Null when the last attempt succeeded. */
  error?: { message: string } | null;
  submitLabel: string;
  placeholder: string;
  /** Given only where the form is the whole dialog and needs a way out. */
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed) return;
        setDraft("");
        onSubmit(trimmed);
      }}
    >
      <Textarea
        value={draft}
        disabled={isPending}
        placeholder={placeholder}
        rows={4}
        className="resize-none"
        onChange={(event) => setDraft(event.target.value)}
      />

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!trimmed || isPending}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
