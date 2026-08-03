import { BookOpen, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What a component teaches, said out loud rather than left to be inferred.
 *
 * The two states are additive, not opposites. Every bound form is quizzed on
 * its meaning — the generator refuses to emit one without a gloss — and the
 * phonetics are quizzed on their sound *as well*, because that sound is the
 * clue they carry into the characters they head (艮 gen behind 很, 跟, 根). A
 * component taught by sound alone does not exist, so this never says "sound".
 *
 * Driven by `phonetic`, the same flag `canStudy` gates on, so the label cannot
 * disagree with what the entry actually offers. Reading it off an empty pinyin
 * would be guessing: 97 rows still store a borrowed one, blanked on the way out
 * by `readingOf` and indistinguishable here from a row that never had one.
 *
 * Colours match the SOUND / MEANING captions on the decomposition tiles, which
 * name the same two jobs one level down.
 */
export function ComponentRoleBadge({
  phonetic,
  className,
}: {
  phonetic: boolean;
  className?: string;
}) {
  const Icon = phonetic ? Volume2 : BookOpen;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-xs font-bold",
        phonetic ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {phonetic ? "Meaning + sound" : "Meaning only"}
    </span>
  );
}
