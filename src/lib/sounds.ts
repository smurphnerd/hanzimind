/**
 * Answer feedback sounds, synthesised with the Web Audio API.
 *
 * Generating them beats shipping audio files: no binary assets, no network
 * fetch, no CSP considerations, and the timbre can be tuned precisely. The
 * tone is deliberately gentle — a wrong answer should feel like a nudge, not
 * a buzzer.
 */

let audioContext: AudioContext | null = null;

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const Ctor =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }

  // Browsers start the context suspended until a user gesture; answering a
  // card is one, so this resolves on the first play.
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

interface ToneOptions {
  /** Starting frequency in Hz. */
  frequency: number;
  /** Optional glide target — creates a pitch bend rather than a flat tone. */
  endFrequency?: number;
  /** Seconds from now that the tone starts. */
  delay?: number;
  /** Seconds the tone lasts. */
  duration: number;
  /** Peak volume, 0–1. */
  volume: number;
  type?: OscillatorType;
}

function playTone(ctx: AudioContext, options: ToneOptions) {
  const {
    frequency,
    endFrequency,
    delay = 0,
    duration,
    volume,
    type = "triangle",
  } = options;

  const startAt = ctx.currentTime + delay;
  const endAt = startAt + duration;

  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endAt);
  }

  // Exponential envelope — ramping from/to a true zero clicks audibly, so
  // start and end just above silence.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

/** A bright ascending E-major arpeggio — short and sparkly. */
export function playCorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [659.25, 830.61, 987.77]; // E5, G#5, B5
  notes.forEach((frequency, i) => {
    playTone(ctx, {
      frequency,
      delay: i * 0.075,
      duration: i === notes.length - 1 ? 0.32 : 0.16,
      volume: 0.16,
      type: "triangle",
    });
  });
}

/** A soft, low downward bend — an "ah, not quite", not an error buzzer. */
export function playIncorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, {
    frequency: 311.13, // E♭4
    endFrequency: 207.65, // A♭3
    duration: 0.34,
    volume: 0.12,
    type: "sine",
  });
}

export function playAnswerSound(correct: boolean) {
  if (correct) {
    playCorrectSound();
  } else {
    playIncorrectSound();
  }
}
