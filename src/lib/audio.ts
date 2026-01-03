/**
 * Play audio from a URL with error handling
 * @param audioUrl - The URL of the audio file to play
 */
export function playAudio(audioUrl: string): void {
  console.log("Playing audio from URL:", audioUrl);
  const audio = new Audio(audioUrl);

  audio.addEventListener("error", (e) => {
    console.error("Audio load error:", e);
  });

  audio.play().catch((error) => {
    console.error("Audio playback failed:", error);
  });
}
