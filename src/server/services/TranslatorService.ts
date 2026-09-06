import * as deepl from "deepl-node";
import { pinyin } from "pinyin-pro";
import type { Logger } from "pino";

export class TranslatorService {
  private readonly deepl;
  private readonly segmenter = new Intl.Segmenter("zh-CN", {
    granularity: "word",
  });

  constructor(
    private deps: { logger: Logger },
    private config: { deeplApiKey: string },
  ) {
    this.deepl = new deepl.Translator(config.deeplApiKey);
  }

  async translateSentence(sentence: string): Promise<string> {
    if (!this.deepl) {
      this.deps.logger.error(
        "DeepL translator not initialized - cannot translate",
      );
      throw new Error("Translation service not configured");
    }

    const result = await this.deepl.translateText(
      sentence,
      "zh",
      "en-US" as deepl.TargetLanguageCode,
    );

    return result.text;
  }

  cutSentence(sentence: string): string[] {
    try {
      // Use Intl.Segmenter to segment the sentence into words
      const segments = this.segmenter.segment(sentence);
      const words = Array.from(segments, (s) => s.segment);

      // Filter out punctuation and whitespace
      const filtered = words.filter((word) => {
        return !/^[\p{P}\p{S}\s]+$/u.test(word);
      });

      return filtered;
    } catch (error) {
      this.deps.logger.error({ error, sentence }, "Error cutting sentence");
      return [sentence]; // Fallback to returning whole sentence
    }
  }

  getPinyin(hans: string): string {
    try {
      // Use pinyin-pro with tone marks (equivalent to pinyin.Tone in Go)
      const result = pinyin(hans, {
        toneType: "symbol", // Use tone marks (ā, á, ǎ, à)
        type: "string", // Return as string
      });

      return result;
    } catch (error) {
      this.deps.logger.error({ error, hans }, "Error getting pinyin");
      return "";
    }
  }
}
