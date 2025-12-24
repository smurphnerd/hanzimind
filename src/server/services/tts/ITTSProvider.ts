/**
 * Interface for TTS (Text-to-Speech) providers
 */
export interface ITTSProvider {
  /**
   * Generate audio for the given text
   * @param text - The Chinese text to convert to speech
   * @returns Buffer containing the audio data
   */
  generateAudio(text: string): Promise<Buffer>;

  /**
   * Name of the provider for logging purposes
   */
  readonly name: string;
}
