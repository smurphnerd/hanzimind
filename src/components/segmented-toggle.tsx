"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Spoken label, where `label` is a bare number or an icon. */
  title?: string;
}

interface SegmentedToggleProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader — required, since it has no visible label. */
  label: string;
  className?: string;
}

/**
 * A pill of mutually exclusive buttons.
 *
 * Buttons rather than a Switch or a Select: the options are alternatives of equal
 * standing and all of them are worth showing at once. A switch would imply one is
 * an enhancement of the other, and a select would hide the range behind a click —
 * which matters most for the deck graph's depth control, where seeing how many
 * levels exist is half the information.
 */
export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center gap-1 rounded-full bg-muted p-1",
        className,
      )}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={option.value === value ? "default" : "ghost"}
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
