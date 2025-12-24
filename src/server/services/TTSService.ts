import type { Logger } from "pino";
import { createHash } from "crypto";

import type { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import type { ITTSProvider } from "@/server/services/tts/ITTSProvider";

export class TTSService {
  constructor(
    private deps: {
      logger: Logger;
      storage: S3StorageAdapter;
      ttsProvider: ITTSProvider;
    },
    private config: {
      publicUrl: string;
    },
  ) {}

  /**
   * Generates audio for the given text using the configured TTS provider and uploads to S3.
   * @param text - The Chinese text to convert to speech
   * @returns The full public URL to access the audio file
   */
  async getVocabAudio(text: string): Promise<string> {
    try {
      this.deps.logger.info(
        { text, provider: this.deps.ttsProvider.name },
        "Generating audio with TTS provider",
      );

      // Generate audio using the provider
      const audioBuffer = await this.deps.ttsProvider.generateAudio(text);

      // Upload to S3
      const s3Key = this.getVocabAudioFP(text);
      await this.deps.storage.uploadFile(s3Key, audioBuffer);

      this.deps.logger.info(
        { text, s3Key, provider: this.deps.ttsProvider.name },
        "Audio generated and uploaded to S3",
      );

      return `${this.config.publicUrl}/${s3Key}`;
    } catch (error) {
      this.deps.logger.error(
        { error, text, provider: this.deps.ttsProvider.name },
        "Error generating audio with TTS provider",
      );
      throw error instanceof Error
        ? error
        : new Error("Failed to generate audio");
    }
  }

  private getVocabAudioFP(vocabItem: string): string {
    // Use Array.from to properly count Unicode characters (handles multi-byte chars)
    const characters = Array.from(vocabItem);

    if (characters.length === 1) {
      // Single character: use Unicode code point
      const codePoint = vocabItem.codePointAt(0);
      if (!codePoint) {
        throw new Error(`Invalid character: ${vocabItem}`);
      }
      return `audio/${codePoint}.mp3`;
    } else {
      // Multi-character (word/sentence): use hash for unique filename
      const hash = createHash("md5").update(vocabItem).digest("hex");
      return `audio/${hash}.mp3`;
    }
  }
}
