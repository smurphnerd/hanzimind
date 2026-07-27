import { toast } from "sonner";

/**
 * Play a vocab item's audio, tolerating the rows that legitimately have none.
 *
 * `audioUrl` is NOT NULL in the database and uses `""` as its sentinel: every
 * component carries one by design (a bound form has no reading of its own), and
 * any item whose TTS generation failed carries one too. `new Audio("")` resolves
 * against the current page and makes `play()` reject with NotSupportedError, so
 * an unguarded call turns a silent-by-design row into an error toast.
 *
 * Returns false when there was nothing to play, so callers can also use it to
 * decide whether to render a control at all — prefer `canPlayAudio` for that.
 */
export function playAudio(audioUrl: string | null | undefined): boolean {
  if (!audioUrl) return false;

  const audio = new Audio(audioUrl);
  void audio.play().catch(() => toast.error("Couldn't play audio"));
  return true;
}

/** Whether this item has audio at all — use to disable or omit a play control. */
export function canPlayAudio(audioUrl: string | null | undefined): boolean {
  return Boolean(audioUrl);
}
