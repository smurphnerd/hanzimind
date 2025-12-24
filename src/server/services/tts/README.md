# TTS Providers

This directory contains Text-to-Speech provider implementations.

## Adding a New Provider

To add a new TTS provider:

1. Create a new file implementing the `ITTSProvider` interface:

```typescript
import type { Logger } from "pino";
import type { ITTSProvider } from "./ITTSProvider";

export class MyTTSProvider implements ITTSProvider {
  readonly name = "My TTS";

  constructor(private logger: Logger) {}

  async generateAudio(text: string): Promise<Buffer> {
    // Your implementation here
    // Should return a Buffer containing MP3 audio data
  }
}
```

2. Export it from `index.ts`:

```typescript
export { MyTTSProvider } from "./MyTTSProvider";
```

3. Register it in `src/server/initialization.ts`:

```typescript
import { MyTTSProvider } from "@/server/services/tts";

// In the container.register() call:
ttsProvider: asFunction(
  (deps: Cradle) => new MyTTSProvider(deps.logger),
).singleton(),
```

## Current Providers

- **GoogleTTSAPIProvider** - Uses google-tts-api package (free, reliable, no auth required) - **DEFAULT**
- **GoogleTTSProvider** - Uses node-gtts package (free, alternative Google TTS implementation)
- **MsEdgeTTSProvider** - Uses Microsoft Edge's TTS API (free, but can have connection issues)

## Future Provider Ideas

- Google Cloud TTS
- Azure Cognitive Services TTS
- ElevenLabs TTS
- OpenAI TTS
- Local TTS (Coqui, etc.)
