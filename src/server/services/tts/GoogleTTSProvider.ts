import gtts from "node-gtts";
import type { Logger } from "pino";
import type { ITTSProvider } from "./ITTSProvider";

export class GoogleTTSProvider implements ITTSProvider {
  readonly name = "Google TTS";

  constructor(private logger: Logger) {}

  async generateAudio(text: string): Promise<Buffer> {
    this.logger.info({ text, provider: this.name }, "Generating audio");

    return new Promise<Buffer>((resolve, reject) => {
      const tts = gtts("zh-CN"); // Chinese (Simplified)
      const chunks: Buffer[] = [];

      const stream = tts.stream(text);

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);

        if (fullBuffer.length === 0) {
          reject(new Error("Generated audio buffer is empty"));
          return;
        }

        this.logger.info(
          { text, provider: this.name, bufferSize: fullBuffer.length },
          "Audio generated successfully",
        );

        resolve(fullBuffer);
      });

      stream.on("error", (error: Error) => {
        this.logger.error(
          { error, text, provider: this.name },
          "Error generating audio",
        );
        reject(error);
      });
    });
  }
}
