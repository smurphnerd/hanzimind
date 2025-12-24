import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Logger } from "pino";
import type { ITTSProvider } from "./ITTSProvider";

export class MsEdgeTTSProvider implements ITTSProvider {
  readonly name = "MS Edge TTS";

  constructor(private logger: Logger) {}

  async generateAudio(text: string): Promise<Buffer> {
    this.logger.info({ text, provider: this.name }, "Generating audio");

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

    if (fullBuffer.length === 0) {
      throw new Error("Generated audio buffer is empty");
    }

    this.logger.info(
      { text, provider: this.name, bufferSize: fullBuffer.length },
      "Audio generated successfully",
    );

    return fullBuffer;
  }
}
