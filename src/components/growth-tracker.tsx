import { Sprout } from "lucide-react";

import { cn } from "@/lib/utils";
import { growthStage } from "@/lib/growth";

interface GrowthTrackerProps {
  level: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const PIP = {
  sm: "h-1.5 w-4",
  md: "h-2 w-5",
  lg: "h-2.5 w-6",
} as const;

const ICON = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

const LABEL = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
} as const;

export function GrowthTracker({
  level,
  size = "md",
  showLabel = true,
  className,
}: GrowthTrackerProps) {
  const stage = growthStage(level);
  const started = stage.index > 0;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Sprout
        className={cn(
          ICON[size],
          started ? stage.colorClass : "text-stage-none",
        )}
      />
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-colors duration-300",
              PIP[size],
              i <= stage.index ? stage.fillClass : "bg-stage-none/40",
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span
          className={cn(
            "font-display font-bold",
            LABEL[size],
            started ? stage.colorClass : "text-muted-foreground",
          )}
        >
          {stage.label}
        </span>
      )}
    </div>
  );
}
