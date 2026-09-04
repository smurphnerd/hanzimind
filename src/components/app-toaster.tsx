"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";

export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      // Undefined until next-themes resolves, and forcing "light" in that gap
      // paints a light toast over a dark page. "system" matches the media query
      // the blocking script already used.
      theme={
        resolvedTheme === "dark"
          ? "dark"
          : resolvedTheme === "light"
            ? "light"
            : "system"
      }
      className="toaster"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as CSSProperties
      }
    />
  );
}
