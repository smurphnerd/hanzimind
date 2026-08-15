# Remote database & object storage

Local development runs against the Docker containers in
`development/docker-compose.yaml` (Postgres + `adobe/s3mock` + Mailpit).
This describes moving the database to **Neon** and audio to **Cloudflare R2**.

The application code already supports both — the only things needed are the
two accounts and the environment variables below.

## Why audio has to move too

Audio URLs are stored **absolute** in `vocab_items.audio_url`. Seeding against
the local s3mock writes rows like `http://localhost:9090/default-bucket/audio/…`,
which resolve only on the machine that created them. A shared database with
localhost audio URLs is broken for every other client, so object storage has to
move at the same time as the database.

## 1. Neon (Postgres)

1. Create a project at <https://neon.tech> — pick the region closest to where
   the app runs.
2. Copy the **pooled** connection string (the host contains `-pooler`). It looks
   like:

   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   ```

   Use the pooled endpoint for the app. If a task opens a long transaction or
   uses `LISTEN/NOTIFY`, use the direct (non-pooler) string for that task.

3. Set it in Doppler as `DATABASE_URL`.

Notes:

- Keep `?sslmode=require`. `getDatabase` (`src/server/database/database.ts`)
  only forces TLS when the URL doesn't already say what to do, so an explicit
  `sslmode` always wins.
- The pool is a DI singleton with an `error` listener, so an idle connection
  being recycled by Neon is logged, not fatal.
- Neon **branches** are useful here: branch `main` for production and a
  throwaway branch for development, both seeded from the same script.

## 2. Cloudflare R2 (audio)

1. Create a bucket (for example `hanzimind-audio`).
2. Create an **R2 API token** with object read/write on that bucket; note the
   Access Key ID and Secret Access Key.
3. Give the bucket a public read URL — either the r2.dev development domain or
   a custom domain — because the browser fetches audio directly.
4. Set `S3_OPTIONS` in Doppler (single-line JSON):

   ```json
   {
     "endpoint": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
     "region": "auto",
     "bucketName": "hanzimind-audio",
     "forcePathStyle": true,
     "credentials": {
       "accessKeyId": "<R2_ACCESS_KEY_ID>",
       "secretAccessKey": "<R2_SECRET_ACCESS_KEY>"
     },
     "cloudfrontDistributionUrl": "https://<public-bucket-domain>"
   }
   ```

`cloudfrontDistributionUrl` is what gets baked into `audio_url`, so it must be
the **public** domain, not the S3 API endpoint. Without it the code falls back
to `endpoint/bucketName`, which is not publicly readable on R2.

## 3. Content Security Policy

`src/proxy.ts` builds `media-src` and `connect-src` from the S3 endpoint. When
audio is served from a different host than the API endpoint (the usual R2
setup), the public domain must also be allowed, or the browser blocks playback.

## 4. Apply schema and seed

With Doppler configured:

```bash
pnpm db:push     # create the tables
pnpm db:seed     # ~9.5k dictionary entries + audio
```

The seed is **idempotent and resumable**: it loads existing characters once,
inserts in batches with `onConflictDoNothing`, and skips anything already
present. A failed or interrupted run can simply be re-run.

Runtime is dominated by TTS (~325 ms per character). `SEED_BATCH_SIZE` in
`src/server/database/seed/seed-dictionary.ts` controls concurrency — 12 takes
roughly 5 minutes; raise it if the TTS endpoint tolerates more.

## 5. Repointing existing audio URLs

`pnpm db:migrate-audio-urls` rewrites rows whose `audio_url` starts with
`endpoint/bucketName` to use `cloudfrontDistributionUrl` instead. It only
rewrites the **prefix** — the object keys are unchanged — so it is the right
tool when the same files are reachable at a new public domain.

It does **not** copy objects between buckets. Moving from the local s3mock to
R2 means the audio files themselves don't exist in R2 yet, so re-run
`pnpm db:seed` after clearing `audio_url` (or against an empty database)
rather than migrating the URLs.

## 6. Verify

```bash
pnpm typecheck
pnpm test
```

Then check that a character page loads and its audio plays from the public
domain — the URL in `vocab_items.audio_url` should not contain `localhost`.
