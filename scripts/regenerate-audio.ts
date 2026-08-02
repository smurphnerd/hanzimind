/**
 * Regenerates vocabulary audio into whatever bucket S3_OPTIONS points at, and
 * repoints `vocab_items.audio_url` at it.
 *
 * Handles both jobs with one code path:
 *   - moving to a new bucket (nothing exists yet, so everything is generated)
 *   - repairing gaps (objects already present are skipped)
 *
 * It lists the destination first and only generates what's actually absent, so
 * it is idempotent and safe to re-run after an interruption.
 *
 * Usage:
 *   doppler run --project hanzimind --config prod -- \
 *     ./node_modules/.bin/tsx scripts/regenerate-audio.ts [--dry-run] [--force]
 *
 *   --dry-run  report what would change, write nothing
 *   --force    regenerate even if the object already exists
 */
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { pino } from "pino";
import { and, eq, ne, or } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import { TTSService } from "@/server/services/TTSService";
import { GoogleTTSAPIProvider } from "@/server/services/tts/GoogleTTSAPIProvider";
import { envSchema } from "@/env-utils";

/** Concurrent TTS+upload operations. Audio generation is ~325ms each. */
const BATCH_SIZE = 12;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const env = envSchema
    .pick({ DATABASE_URL: true, S3_OPTIONS: true })
    .parse(process.env);

  const logger = pino({ level: "warn" });
  const database = getDatabase(logger, env.DATABASE_URL);
  const storage = new S3StorageAdapter(env.S3_OPTIONS);

  const publicUrl =
    env.S3_OPTIONS.cloudfrontDistributionUrl ??
    `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`;

  const tts = new TTSService(
    { logger, storage, ttsProvider: new GoogleTTSAPIProvider(logger) },
    { publicUrl },
  );

  console.log(`\nBucket:    ${env.S3_OPTIONS.bucketName}`);
  console.log(`Endpoint:  ${env.S3_OPTIONS.endpoint}`);
  console.log(`Public:    ${publicUrl}`);
  console.log(
    `Mode:      ${dryRun ? "DRY RUN" : force ? "force regenerate" : "fill gaps"}\n`,
  );

  // ---- What's already in the destination -------------------------------
  const s3 = new S3Client({
    endpoint: env.S3_OPTIONS.endpoint,
    region: env.S3_OPTIONS.region,
    forcePathStyle: env.S3_OPTIONS.forcePathStyle ?? false,
    ...(env.S3_OPTIONS.credentials
      ? { credentials: env.S3_OPTIONS.credentials }
      : {}),
  });

  const present = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_OPTIONS.bucketName,
        Prefix: "audio/",
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) present.add(object.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`Objects already in audio/: ${present.size}`);

  // ---- What the database expects ---------------------------------------
  // A row with nothing to pronounce gets no audio: no reading at all, or a
  // component whose reading is borrowed from the character it abbreviates and so
  // is never served (see readingOf). A *phonetic* component (艮, 隹, 虍) does
  // belong here — its sound is the clue to the series it heads. Disabled items
  // are hidden everywhere. Without this filter a run would put back exactly what
  // the classification keeps out.
  const items = await database
    .select({
      id: schema.vocabItems.id,
      vocabItem: schema.vocabItems.vocabItem,
      audioUrl: schema.vocabItems.audioUrl,
    })
    .from(schema.vocabItems)
    .where(
      and(
        ne(schema.vocabItems.pinyin, ""),
        eq(schema.vocabItems.disabled, false),
        or(
          ne(schema.vocabItems.vocabType, "component"),
          eq(schema.vocabItems.phonetic, true),
        ),
      ),
    );

  const work = items.map((item) => {
    const key = tts.getVocabAudioFP(item.vocabItem);
    return {
      ...item,
      key,
      expectedUrl: `${publicUrl}/${key}`,
      hasObject: present.has(key),
    };
  });

  const needsAudio = work.filter((w) => force || !w.hasObject);
  const needsUrlOnly = work.filter(
    (w) => !force && w.hasObject && w.audioUrl !== w.expectedUrl,
  );

  console.log(`Vocab items:               ${work.length}`);
  console.log(`Need audio generated:      ${needsAudio.length}`);
  console.log(`Need only a URL update:    ${needsUrlOnly.length}\n`);

  if (dryRun) {
    console.log("Dry run — nothing written.\n");
    process.exit(0);
  }

  // ---- Rows whose object exists but whose URL is stale ------------------
  for (const item of needsUrlOnly) {
    await database
      .update(schema.vocabItems)
      .set({ audioUrl: item.expectedUrl })
      .where(eq(schema.vocabItems.id, item.id));
  }
  if (needsUrlOnly.length > 0) {
    console.log(`Repointed ${needsUrlOnly.length} existing objects.`);
  }

  // ---- Generate what's missing -----------------------------------------
  let generated = 0;
  let failed = 0;

  for (let i = 0; i < needsAudio.length; i += BATCH_SIZE) {
    const batch = needsAudio.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (item) => {
        try {
          const url = await tts.getVocabAudio(item.vocabItem);
          await database
            .update(schema.vocabItems)
            .set({ audioUrl: url })
            .where(eq(schema.vocabItems.id, item.id));
          generated++;
        } catch (error) {
          failed++;
          // Record the absence honestly: an empty audioUrl makes the study
          // scheduler skip listening cards, whereas a dead URL would be
          // served and then fail silently in the browser.
          await database
            .update(schema.vocabItems)
            .set({ audioUrl: "" })
            .where(eq(schema.vocabItems.id, item.id));
          console.warn(
            `  failed: ${item.vocabItem} (${(error as Error).message.slice(0, 60)})`,
          );
        }
      }),
    );

    const done = Math.min(i + BATCH_SIZE, needsAudio.length);
    if (done % 240 === 0 || done === needsAudio.length) {
      console.log(`  ${done}/${needsAudio.length}`);
    }
  }

  console.log(`\nGenerated ${generated}, failed ${failed}.`);
  console.log("Re-run to retry failures — existing objects are skipped.\n");
  process.exit(0);
}

await main();
