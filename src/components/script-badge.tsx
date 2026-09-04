import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Script } from "@/definitions/definitions";

/**
 * Which script a glyph belongs to.
 *
 * `both` is deliberately the quietest of the three. It is the majority of the
 * dictionary — over half of all characters are written identically in either
 * script — so rendering it as loudly as the other two would put a badge on every
 * row and leave the two that actually carry information competing with it.
 */
const SCRIPT_META: Record<
  Script,
  { label: string; hint: string; className: string }
> = {
  simplified: {
    label: "Simp",
    hint: "Simplified — has a distinct traditional counterpart",
    className: "border-transparent bg-type-compound-soft text-type-compound",
  },
  traditional: {
    label: "Trad",
    hint: "Traditional — has a distinct simplified counterpart",
    className: "border-transparent bg-type-sentence-soft text-type-sentence",
  },
  both: {
    label: "Both",
    hint: "Written the same way in both scripts",
    className: "text-muted-foreground",
  },
};

export function ScriptBadge({
  script,
  className,
}: {
  script: Script;
  className?: string;
}) {
  // Falls back the way vocabTypeMeta does: a row written before the column
  // existed, or one hand-edited to something unexpected, should render as
  // script-neutral rather than crash the whole table.
  const meta = SCRIPT_META[script] ?? SCRIPT_META.both;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A Badge is a span, and a span is not in the tab order, so the hint
            this replaced was mouse-only — three words of "Simp" and nothing
            else for anyone who does not hover. tabIndex makes the trigger
            reachable; the focus ring is already in badgeVariants. */}
        <Badge
          variant="outline"
          tabIndex={0}
          className={cn(meta.className, className)}
        >
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{meta.hint}</TooltipContent>
    </Tooltip>
  );
}
