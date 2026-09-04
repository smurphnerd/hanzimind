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
 * The chosen-state colours, written out under two selectors each.
 *
 * The `aria-` half is the one that actually fires here, and why is a trap worth
 * stating plainly. `TooltipTrigger asChild` forwards the trigger's own
 * `data-state="closed"` down into the child, and BOTH shadcn primitives spread
 * `{...props}` after writing their own `data-state` — Radix's Toggle is
 * `"data-state": pressed ? "on" : "off", ...buttonProps`. So the tooltip's value
 * lands last and every `data-[state=…]` rule silently stops matching. It shipped
 * that way in this PR's first head: all seven depth segments rendered
 * unselected, because every depth option carries a hint. `data-slot` is
 * overwritten the same way, for the same reason.
 *
 * `aria-checked` and `aria-selected` are written by the primitives *before*
 * those spreads and are not attributes any wrapper sets, so they survive. They
 * are also the honest thing to style off: the segment looks chosen exactly when
 * it announces itself as chosen.
 *
 * The `data-[state=…]` copies stay because a segment with NO hint keeps a real
 * `data-state`, and shadcn's own rules there paint it violet (`toggleVariants`
 * has `data-[state=on]:bg-accent`) or card-white (`TabsTrigger` has
 * `data-[state=active]:bg-background`). The copies name the same colours as the
 * aria rules, so the two can never disagree whichever a browser resolves first.
 *
 * Every hover rule is qualified by the state. Both primitives ship a bare
 * `hover:` colour, and a bare override would tie with the chosen-state colour on
 * specificity and be settled by stylesheet order — which is how you get coral
 * text on a coral pill the moment the pointer lands on it.
 *
 * Written out rather than composed by a helper: Tailwind v4 scans source for
 * whole class strings and emits nothing at all for a name built at runtime.
 */
const SEGMENT_ON_TAB = [
  "aria-[selected=false]:hover:text-primary data-[state=inactive]:hover:text-primary",
  "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm",
  "aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground",
  "dark:aria-selected:border-transparent dark:aria-selected:bg-primary dark:aria-selected:text-primary-foreground",
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
  "data-[state=active]:hover:bg-primary data-[state=active]:hover:text-primary-foreground",
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
].join(" ");
const SEGMENT_ON_TOGGLE = [
  "aria-[checked=false]:hover:text-primary data-[state=off]:hover:text-primary",
  "aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:shadow-sm",
  "aria-checked:hover:bg-primary aria-checked:hover:text-primary-foreground",
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm",
  "data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground",
].join(" ");

/**
 * Gives a segment its spoken label, where it has one.
 *
 * Neither Tooltip nor TooltipTrigger renders an element of its own, so the
 * segment stays a direct DOM child of the track and Radix's roving focus still
 * finds it. What `asChild` DOES do is forward the trigger's `data-state` and
 * `data-slot` onto the segment, overwriting the primitive's own — see the note
 * on the chosen-state classes above, and `e2e/segmented-control.spec.ts`, which
 * fails if the styling ever goes back to depending on them.
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
