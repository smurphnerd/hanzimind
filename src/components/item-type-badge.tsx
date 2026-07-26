import { cn } from "@/lib/utils";
import { vocabTypeMeta, type ItemTypeKey } from "@/lib/vocab-type";

interface ItemTypeBadgeProps {
  type: ItemTypeKey;
  withIcon?: boolean;
  short?: boolean;
  className?: string;
}

export function ItemTypeBadge({
  type,
  withIcon = true,
  short = false,
  className,
}: ItemTypeBadgeProps) {
  const meta = vocabTypeMeta(type);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-xs font-bold",
        meta.softClass,
        meta.colorClass,
        className,
      )}
    >
      {withIcon && <Icon className="size-3.5" />}
      {short ? meta.shortLabel : meta.label}
    </span>
  );
}
