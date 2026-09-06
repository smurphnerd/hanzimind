import type { ReactNode } from "react";

/**
 * A segment of a segmented control.
 *
 * There is no `hint` here, and that is the point. A hint becomes a tooltip, a
 * tooltip trigger uses `asChild`, and `asChild` overwrites the `data-state` the
 * primitive underneath was relying on — see the note on the chosen-state classes
 * below. Only `SegmentedToggle` accepts a hint, because only its labels (bare
 * numbers) need one; a tab always carries readable text, so the option type it
 * takes makes a hint impossible rather than merely unwise.
 */
export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

/** A segment whose label cannot be read on its own — a number, or an icon. */
export interface HintedSegmentedOption<
  T extends string | number,
> extends SegmentedOption<T> {
  /** Spoken label, shown as a tooltip. */
  hint?: string;
}

/**
 * The Sprout skin for a pill of mutually exclusive segments.
 *
 * Both controls wear it, so the depth control on the deck graph and the
 * Details/Graph switch above it stay the same object to look at even though they
 * are different primitives underneath. Written as class overrides rather than
 * edits to `ui/tabs.tsx` and `ui/toggle.tsx`, so the next tab set or toggle group
 * installed here still gets stock shadcn.
 *
 * It lives in its own module, with no JSX and no primitive imports, so that
 * importing one control never drags in the other's Radix package. That is not
 * tidiness: `vocab-entry.tsx` needs only the tab set, and while the two shared a
 * module every dictionary entry shipped `@radix-ui/react-toggle-group` and
 * `@radix-ui/react-tooltip` for a control it never renders.
 */
export const TRACK = "w-fit gap-1 rounded-full bg-muted p-1";

/**
 * TabsList takes its height from a `group-data-[orientation=…]` rule, and
 * tailwind-merge only collapses classes whose modifiers match exactly — a plain
 * `h-auto` would sit beside it and lose, leaving a 36px track around 32px
 * segments. Overriding it in its own words is what actually replaces it.
 */
export const TABS_TRACK = "group-data-[orientation=horizontal]/tabs:h-auto";

export const SEGMENT =
  "h-8 rounded-full border-transparent px-4 font-display text-xs font-bold text-foreground shadow-none";

/**
 * The chosen-state colours, written out under two selectors each.
 *
 * The `aria-` half is the one that fires when a segment is a tooltip trigger,
 * and why is a trap worth stating plainly. `TooltipTrigger asChild` forwards the
 * trigger's own `data-state="closed"` down into the child, and both shadcn
 * primitives write their own `data-state` and THEN spread `{...props}` — Radix's
 * Toggle is literally `"data-state": pressed ? "on" : "off", ...buttonProps`. So
 * the tooltip's value lands last and every `data-[state=…]` rule silently stops
 * matching. It shipped that way in this PR's first head: all seven depth
 * segments rendered unselected, because every depth option carries a hint.
 * `data-slot` is overwritten the same way, for the same reason.
 *
 * `aria-checked` and `aria-selected` are written before those spreads and are not
 * attributes any wrapper sets, so they survive. They are also the honest thing to
 * style off: a segment looks chosen exactly when it announces itself as chosen.
 *
 * The `data-[state=…]` copies stay because a segment with no hint keeps a real
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
export const SEGMENT_ON_TAB = [
  "aria-[selected=false]:hover:text-primary data-[state=inactive]:hover:text-primary",
  "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm",
  "aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground",
  "dark:aria-selected:border-transparent dark:aria-selected:bg-primary dark:aria-selected:text-primary-foreground",
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
  "data-[state=active]:hover:bg-primary data-[state=active]:hover:text-primary-foreground",
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
].join(" ");

export const SEGMENT_ON_TOGGLE = [
  "aria-[checked=false]:hover:text-primary data-[state=off]:hover:text-primary",
  "aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:shadow-sm",
  "aria-checked:hover:bg-primary aria-checked:hover:text-primary-foreground",
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm",
  "data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground",
].join(" ");
