import type { VocabType } from "@/definitions/definitions";
import { cn } from "@/lib/utils";
import { vocabTypeMeta } from "@/lib/vocab-type";

/**
 * A glyph on the tinted ground its vocab type owns, sized by the caller.
 *
 * Size is a prop rather than a variant because the three callers want three
 * different ones — the question panel on a reading card, the smaller one on an
 * understanding card, the thumbnail beside the answer on a result — and the
 * type-to-colour mapping is the only thing they actually share.
 */
export function HanziPanel({
  char,
  type,
  className,
  textClassName,
}: {
  char: string;
  type: VocabType;
  className?: string;
  textClassName?: string;
}) {
  const meta = vocabTypeMeta(type);
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl",
        meta.softClass,
        className,
      )}
    >
      <span className={cn("hanzi text-foreground", textClassName)}>{char}</span>
    </div>
  );
}
