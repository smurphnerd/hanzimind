"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BookOpen,
  Headphones,
  Languages,
  PenLine,
  Sprout,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DeckSettings = {
  readingEnabled: boolean;
  listeningEnabled: boolean;
  understandingEnabled: boolean;
  writingEnabled: boolean;
};

/**
 * The learner's whole study list in one lookup, so a page can seed this dialog
 * with the settings already in effect. `study.addDeck` upserts all four mode
 * columns, so a caller that opens on the defaults below and confirms silently
 * overwrites whatever the learner chose. Hold the control until this query has
 * either answered or failed, and note the endpoint's maximum perPage: a learner
 * with more than 100 saved decks is missing from this list.
 */
export const SAVED_DECKS_INPUT = { page: 1, perPage: 100 };

export const DEFAULT_DECK_SETTINGS: DeckSettings = {
  readingEnabled: true,
  listeningEnabled: true,
  understandingEnabled: true,
  writingEnabled: true,
};

interface StudyMode {
  key: keyof DeckSettings;
  label: string;
  /** What the card actually asks of you — the thing the old bare labels left out. */
  hint: string;
  icon: LucideIcon;
  /** Reuses the per-type tints, so the dialog sits in the same palette as the rest. */
  toneClass: string;
}

const STUDY_MODES: StudyMode[] = [
  {
    key: "readingEnabled",
    label: "Reading",
    hint: "See the characters, type the pinyin.",
    icon: BookOpen,
    toneClass: "bg-type-character-soft text-type-character",
  },
  {
    key: "listeningEnabled",
    label: "Listening",
    hint: "Hear it spoken, type the pinyin.",
    icon: Headphones,
    toneClass: "bg-type-component-soft text-type-component",
  },
  {
    key: "understandingEnabled",
    label: "Understanding",
    hint: "See the characters, recall the meaning.",
    icon: Languages,
    toneClass: "bg-type-sentence-soft text-type-sentence",
  },
  {
    key: "writingEnabled",
    label: "Writing",
    hint: "Read the meaning, type the characters.",
    icon: PenLine,
    toneClass: "bg-type-compound-soft text-type-compound",
  },
];

interface DeckSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DeckSettings;
  onSettingsChange: (settings: DeckSettings) => void;
  onSave: () => void;
  isPending?: boolean;
  title?: string;
  description?: string;
  saveButtonText?: string;
}

export function DeckSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onSave,
  isPending = false,
  title = "Configure study settings",
  description = "Pick the ways this deck should quiz you.",
  saveButtonText = "Save settings",
}: DeckSettingsDialogProps) {
  // A deck with every mode disabled has nothing to serve and errors on the
  // study screen, so block saving that combination.
  const hasAnyStudyMode = STUDY_MODES.some((mode) => settings[mode.key]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {STUDY_MODES.map((mode) => {
            const enabled = settings[mode.key];
            const Icon = mode.icon;

            return (
              <div
                key={mode.key}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                  // No opacity modifier on `secondary`: it is a color-mix token,
                  // and `bg-secondary/50` resolves to the light-mode tint even
                  // under .dark, washing the row out.
                  enabled ? "border-primary/40 bg-secondary" : "border-border",
                )}
              >
                {/* The label carries the whole row so the hit target is the tile,
                    not the words next to a switch. */}
                <Label
                  htmlFor={mode.key}
                  className="min-w-0 flex-1 cursor-pointer gap-3 leading-normal"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                      enabled
                        ? mode.toneClass
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-display text-sm font-bold">
                      {mode.label}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {mode.hint}
                    </span>
                  </span>
                </Label>

                <Switch
                  id={mode.key}
                  className="shrink-0"
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, [mode.key]: checked })
                  }
                />
              </div>
            );
          })}
        </div>

        {hasAnyStudyMode ? (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <Sprout className="mt-px size-4 shrink-0 text-success" />
            <span>
              The parts of each word are always included — you learn the parts
              first, and words unlock as their parts stick. Components
              (character parts like <span className="hanzi">亻</span> and{" "}
              <span className="hanzi">氵</span>) are reviewed by meaning only,
              since they have no pronunciation of their own.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>
              Pick at least one mode — otherwise there&apos;s nothing to review.
            </span>
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending || !hasAnyStudyMode}>
            {isPending ? "Saving..." : saveButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
