import * as googleTTS from "google-tts-api";
import type { Logger } from "pino";
import type { ITTSProvider } from "./ITTSProvider";

export class GoogleTTSAPIProvider implements ITTSProvider {
  readonly name = "Google TTS API";

  constructor(private logger: Logger) {}

  async generateAudio(text: string): Promise<Buffer> {
    this.logger.info({ text, provider: this.name }, "Generating audio");

    try {
      // Get the audio URL from Google TTS
      const url = googleTTS.getAudioUrl(text, {
        lang: "zh-CN", // Chinese (Simplified)
        slow: false,
        host: "https://translate.google.com",
      });

      this.logger.debug({ url, text }, "Fetching audio from Google TTS");

      // Fetch the audio data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new Error("Generated audio buffer is empty");
      }

      this.logger.info(
        { text, provider: this.name, bufferSize: buffer.length },
        "Audio generated successfully",
      );

      return buffer;
    } catch (error) {
      this.logger.error(
        { error, text, provider: this.name },
        "Error generating audio",
      );
      throw error;
    }
  }
}
