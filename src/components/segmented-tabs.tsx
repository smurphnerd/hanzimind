"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SEGMENT,
  SEGMENT_ON_TAB,
  TABS_TRACK,
  TRACK,
  type SegmentedOption,
} from "@/components/segmented-control";
import { cn } from "@/lib/utils";

/**
 * The switch half of a `ui/tabs` set: use it where the segments choose which
 * panel is on screen, and put the panels in `TabsContent` under the same `Tabs`
 * root.
 *
 * It renders only the list, because Radix holds the selected value on the root
 * and the panels are rarely the next thing on the page — the entry view's sits
 * under a header card, the deck view's under a heading and a paragraph. The
 * association is what earns Tabs here: roving arrow-key focus over one tab stop
 * instead of one per segment, `aria-selected`, and an `aria-controls` that
 * points at the panel it actually switches.
 *
 * Deliberately imports nothing but `ui/tabs`. It is the half `vocab-entry.tsx`
 * uses, and every dictionary entry pays for whatever this file reaches.
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
        <TabsTrigger
          key={option.value}
          value={option.value}
          disabled={disabled}
          className={cn(SEGMENT, SEGMENT_ON_TAB)}
        >
          {option.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
