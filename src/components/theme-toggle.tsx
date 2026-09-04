"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        hydrated
          ? isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
          : "Switch between light and dark theme"
      }
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* next-themes stamps the class before paint, so CSS picks the right icon
          in the first frame where reading resolvedTheme could not. */}
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
}
