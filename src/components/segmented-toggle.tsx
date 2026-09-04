"use client";

import type { ReactNode } from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Spoken label, where `label` is a bare number or an icon. */
  hint?: string;
}

/**
 * The Sprout skin for a pill of mutually exclusive segments.
 *
 * Both controls below wear it, so the depth control on the deck graph and the
 * Details/Graph switch above it stay the same object to look at even though
 * they are different things underneath. Written as class overrides rather than
 * edits to `ui/tabs.tsx` and `ui/toggle.tsx`, so the next tab set or toggle
 * group installed here still gets stock shadcn.
 *
 * The dark overrides are not redundant. Both shadcn primitives ship their own
 * `dark:data-[state=…]` colours; a light-only override leaves those in place,
 * tailwind-merge keeps both because the modifiers differ, and the selected
 * segment comes out shadcn-grey in dark mode and coral in light.
 */
const TRACK = "w-fit gap-1 rounded-full bg-muted p-1";
/**
 * TabsList takes its height from a `group-data-[orientation=…]` rule, and
 * tailwind-merge only collapses classes whose modifiers match exactly — a plain
 * `h-auto` would sit beside it and lose, leaving a 36px track around 32px
 * segments. Overriding it in its own words is what actually replaces it.
 */
const TABS_TRACK = "group-data-[orientation=horizontal]/tabs:h-auto";
const SEGMENT =
  "h-8 rounded-full border-transparent px-4 font-display text-xs font-bold text-foreground shadow-none";
/**
 * The selected-state rules, once per primitive because they spell the state
 * differently (`active`/`inactive` for a tab, `on`/`off` for a toggle).
 *
 * Every hover rule is qualified by the state rather than left bare. Both
 * primitives ship a bare `hover:` colour, and a bare override of mine would tie
 * with the selected-state colour on specificity and be decided by stylesheet
 * order — which is how you get coral text on a coral pill the moment the
 * pointer lands on it. Qualifying wins outright and says which case it is for.
 */
const SEGMENT_ON_TAB = [
  "data-[state=inactive]:hover:text-primary",
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
  "data-[state=active]:hover:bg-primary data-[state=active]:hover:text-primary-foreground",
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
].join(" ");
const SEGMENT_ON_TOGGLE = [
  "data-[state=off]:hover:text-primary",
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm",
  "data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground",
].join(" ");

/**
 * Gives a segment its spoken label, where it has one.
 *
 * Neither Tooltip nor TooltipTrigger renders an element of its own, so the
 * segment stays a direct DOM child of the track and Radix's roving focus still
 * finds it.
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
 * The switch half of a `ui/tabs` set: use it where the segments choose which
 * panel is on screen, and put the panels in `TabsContent` under the same
 * `Tabs` root.
 *
 * It renders only the list, because Radix holds the selected value on the root
 * and the panels are rarely the next thing on the page — the entry view's sits
 * under a header card, the deck view's under a heading and a paragraph. The
 * association is what earns Tabs here: roving arrow-key focus over one tab stop
 * instead of one per segment, `aria-selected`, and an `aria-controls` that
 * points at the panel it actually switches.
 */
export function SegmentedTabsList<T extends string>({
  options,
  label,
  className,
  disabled = false,
}: {
  options: readonly SegmentedOption<T>[];
  /** Names the group for a screen reader — required, since it has no visible label. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <TabsList aria-label={label} className={cn(TRACK, TABS_TRACK, className)}>
      {options.map((option) => (
        <SegmentHint key={option.value} hint={option.hint}>
          <TabsTrigger
            value={option.value}
            disabled={disabled}
            className={cn(SEGMENT, SEGMENT_ON_TAB)}
          >
            {option.label}
          </TabsTrigger>
        </SegmentHint>
      ))}
    </TabsList>
  );
}

/**
 * A pill of mutually exclusive segments that picks a *value* rather than a
 * panel — the deck graph's depth control, where all seven segments narrow the
 * one graph below them.
 *
 * `ui/toggle-group` rather than `ui/tabs` for exactly that reason. Tabs would
 * put `role="tab"` on seven segments and give each an `aria-controls` pointing
 * at a panel that does not exist. Radix's single-select toggle group announces
 * them as radios inside a named group, which is what they are, and brings the
 * same roving arrow-key focus.
 *
 * Buttons rather than a Switch or a Select: the options are alternatives of
 * equal standing and all of them are worth showing at once. A switch would imply
 * one is an enhancement of the other, and a select would hide the range behind a
 * click — which matters most here, where seeing how many levels exist is half
 * the information.
 */
export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  disabled = false,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader — required, since it has no visible label. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      // Radix speaks strings; the depth control counts in numbers.
      value={String(value)}
      onValueChange={(next) => {
        // A single-select toggle group lets you press the selected item again
        // to clear it, which reports "". These controls always have exactly one
        // answer — an empty depth would blank the graph — so a second press on
        // the current segment does nothing, as it did when they were buttons.
        const chosen = options.find((option) => String(option.value) === next);
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
  );
}
