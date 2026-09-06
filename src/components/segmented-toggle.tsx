"use client";

import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SEGMENT,
  SEGMENT_ON_TOGGLE,
  TRACK,
  type HintedSegmentedOption,
} from "@/components/segmented-control";
import { cn } from "@/lib/utils";

/**
 * Gives a segment its spoken label, where it has one.
 *
 * Neither Tooltip nor TooltipTrigger renders an element of its own, so the
 * segment stays a direct DOM child of the track and Radix's roving focus still
 * finds it. What `asChild` DOES do is overwrite the segment's `data-state` and
 * `data-slot` with the tooltip's own — which is why the chosen-state colours in
 * `segmented-control.ts` hang off `aria-checked`, and why
 * `e2e/decks-segmented-control.spec.ts` asserts on a computed background rather
 * than on a class name.
 */
function SegmentHint({
  hint,
  children,
}: {
  hint: string | undefined;
  children: ReactNode;
}) {
  if (!hint) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A pill of mutually exclusive segments that picks a *value* rather than a
 * panel — the deck graph's depth control, where all seven segments narrow the
 * one graph below them.
 *
 * `ui/toggle-group` rather than `ui/tabs` for exactly that reason. Tabs would put
 * `role="tab"` on seven segments and give each an `aria-controls` pointing at a
 * panel that does not exist. Radix's single-select toggle group announces them as
 * radios inside a named group, which is what they are, and brings the same roving
 * arrow-key focus.
 *
 * Buttons rather than a Switch or a Select: the options are alternatives of equal
 * standing and all of them are worth showing at once. A switch would imply one is
 * an enhancement of the other, and a select would hide the range behind a click —
 * which matters most here, where seeing how many levels exist is half the
 * information.
 */
export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  disabled = false,
}: {
  options: readonly HintedSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader — required, since it has no visible label. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    // The provider lives here rather than in the root layout. In the layout it
    // put @radix-ui/react-tooltip in every route's chunk, including the many
    // routes with no tooltip on them at all. One per control also keeps the
    // shared delay group exactly where it earns its keep: once a hint is open,
    // sweeping across the other six shows them instantly.
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        // Radix speaks strings; the depth control counts in numbers.
        value={String(value)}
        onValueChange={(next) => {
          // A single-select toggle group lets you press the selected item again
          // to clear it, which reports "". These controls always have exactly one
          // answer — an empty depth would blank the graph — so a second press on
          // the current segment does nothing, as it did when they were buttons.
          const chosen = options.find(
            (option) => String(option.value) === next,
          );
          if (chosen) onChange(chosen.value);
        }}
        aria-label={label}
        spacing={1}
        disabled={disabled}
        className={cn(TRACK, className)}
      >
        {options.map((option) => (
          <SegmentHint key={option.value} hint={option.hint}>
            <ToggleGroupItem
              value={String(option.value)}
              className={cn(SEGMENT, SEGMENT_ON_TOGGLE)}
            >
              {option.label}
            </ToggleGroupItem>
          </SegmentHint>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
