// Download the semantic similarity model the app grades understanding answers
// with, into the same cache the app reads, so the first graded answer on a lane
// does not pay a 90 MB download.
import { pipeline } from "@huggingface/transformers";

const modelId = "Xenova/all-MiniLM-L6-v2";
const lastPercent = new Map<string, number>();
await pipeline("feature-extraction", modelId, {
  progress_callback: (event: { status: string; file?: string; progress?: number }) => {
    if (event.status !== "progress" || event.progress === undefined) return;
    const file = event.file ?? modelId;
    const percent = Math.floor(event.progress / 10) * 10;
    if (percent > (lastPercent.get(file) ?? -1)) {
      lastPercent.set(file, percent);
      console.log(`${file}: ${percent}%`);
    }
  },
});
console.log(`${modelId} ready`);
process.exit(0);
