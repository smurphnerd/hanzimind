import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { vocabTypeMeta, type ItemTypeKey } from "@/lib/vocab-type";

interface ItemTypeBadgeProps {
  type: ItemTypeKey;
  withIcon?: boolean;
  short?: boolean;
  className?: string;
}

/**
 * Which kind of item this is: component, character, word or sentence.
 *
 * `palette` rather than one Badge variant per type, because the four tints are
 * already a data-driven palette in `vocab-type.ts` — the same one the tiles,
 * chips and graph legend read — and copying it into `badgeVariants` would give
 * the app two places to change a type colour.
 */
export function ItemTypeBadge({
  type,
  withIcon = true,
  short = false,
  className,
}: ItemTypeBadgeProps) {
  const meta = vocabTypeMeta(type);
  const Icon = meta.icon;

  return (
    <Badge
      variant="palette"
      className={cn(meta.softClass, meta.colorClass, className)}
    >
      {withIcon && <Icon />}
      {short ? meta.shortLabel : meta.label}
    </Badge>
  );
}
