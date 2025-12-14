import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Logger } from "pino";
import { createHash } from "crypto";

import type { S3StorageAdapter } from "@/server/services/S3StorageAdapter";

export class TTSService {
  constructor(
    private deps: {
      logger: Logger;
      storage: S3StorageAdapter;
    },
    private config: {
      publicUrl: string;
    },
  ) {}

  /**
   * Generates audio for the given text using MS Edge TTS and uploads to S3.
   * @param text - The Chinese text to convert to speech
   * @returns The full public URL to access the audio file
   */
  async getVocabAudio(text: string): Promise<string> {
    try {
      this.deps.logger.info({ text }, "Generating audio with MS Edge TTS");

      const tts = new MsEdgeTTS();
      await tts.setMetadata(
        "zh-CN-XiaoxiaoNeural", // Chinese (Simplified, PRC) - Female voice
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );

      const { audioStream } = tts.toStream(text);
      const chunks: Buffer[] = [];

      for await (const chunk of audioStream) {
        if (chunk instanceof Buffer) {
          chunks.push(chunk);
        }
      }

      const fullBuffer = Buffer.concat(chunks);

      // Upload to S3
      const s3Key = this.getVocabAudioFP(text);
      await this.deps.storage.uploadFile(s3Key, fullBuffer);

      this.deps.logger.info(
        { text, s3Key },
        "Audio generated and uploaded to S3",
      );

      return `${this.config.publicUrl}/${s3Key}`;
    } catch (error) {
      this.deps.logger.error(
        {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          text,
        },
        "Error generating audio with MS Edge TTS",
      );
      throw error;
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
