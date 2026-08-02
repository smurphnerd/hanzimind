import { Badge } from "@/components/ui/badge";
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
  { label: string; title: string; className: string }
> = {
  simplified: {
    label: "Simp",
    title: "Simplified — has a distinct traditional counterpart",
    className: "border-transparent bg-type-compound-soft text-type-compound",
  },
  traditional: {
    label: "Trad",
    title: "Traditional — has a distinct simplified counterpart",
    className: "border-transparent bg-type-sentence-soft text-type-sentence",
  },
  both: {
    label: "Both",
    title: "Written the same way in both scripts",
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
    <Badge
      variant="outline"
      title={meta.title}
      className={cn("font-display font-bold", meta.className, className)}
    >
      {meta.label}
    </Badge>
  );
}
