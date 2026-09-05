"use client";

import type { VocabType } from "@/definitions/definitions";

/**
 * Canvas colours and fonts, read off the live stylesheet so light/dark just work.
 *
 * Fonts belong here too: `ctx.font` takes a plain CSS shorthand and REJECTS the
 * whole assignment if any part is invalid, so a `var(--font-hanzi)` in the string
 * silently leaves the canvas on its 10px default. The families have to be resolved
 * to literals before they reach the context.
 *
 * Consumed with `useSyncExternalStore(subscribeToTheme, paletteSnapshot, () => null)`
 * — the stylesheet is an external system, not React state.
 */
interface GraphPalette {
  type: Record<VocabType, string>;
  focus: string;
  text: string;
  muted: string;
  line: string;
  surface: string;
  danger: string;
  hanziFont: string;
  sansFont: string;
}

function readPalette(): GraphPalette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();

  return {
    type: {
      character: token("--type-character"),
      compound: token("--type-compound"),
      sentence: token("--type-sentence"),
      component: token("--type-component"),
    },
    focus: token("--coral"),
    text: token("--text"),
    muted: token("--muted-fg"),
    line: token("--line"),
    surface: token("--surface"),
    danger: token("--red"),
    hanziFont: token("--font-hanzi") || "sans-serif",
    sansFont: token("--font-sans") || "system-ui, sans-serif",
  };
}

/**
 * Snapshot identity has to be stable across calls or useSyncExternalStore spins
 * forever, so the resolved palette is cached against the theme class it was read
 * from. One theme is live at a time, so a single-entry cache is enough.
 */
let paletteCache: { themeClass: string; palette: GraphPalette } | null = null;

export function paletteSnapshot(): GraphPalette {
  const themeClass = document.documentElement.className;
  if (paletteCache?.themeClass !== themeClass) {
    paletteCache = { themeClass, palette: readPalette() };
  }

  return paletteCache.palette;
}

export function subscribeToTheme(onThemeChange: () => void) {
  const observer = new MutationObserver(onThemeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}
