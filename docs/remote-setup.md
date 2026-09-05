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

### The study-progress reshape, deployed by discarding progress

`user_vocab_items` used to carry four `<type>_level` / `<type>_next_at` column
pairs. They are gone, replaced by `user_study_progress`, one row per learner,
item and study type.

**On this database the reshape was deployed by throwing the progress away.**
Production held one test account, 398 item rows, 30 of them with a non-default
level, and one saved deck. The operator judged those 30 levels not worth
carrying, so the deploy was a plain `pnpm db:push --force` — the eight columns
dropped, `user_study_progress` created empty, and the learner started again from
zero. No data was carried across, and nothing went wrong; if the levels look
like they reset around this change, that is why.

**The copy path exists and is proven, and a future deployment with data worth
keeping should use it.** `scripts/backfill-study-progress.ts` moves the levels
into the new table before push drops the columns, commits only a copy whose
verification passes in the same transaction, and reverses with `--down`. Its
header documents the order; the short version is snapshot, `--dry-run`, copy,
`--verify`, deploy, then push.

Two things worth knowing before running a hard push like this one again:

- **`--force` is required and is not gentle.** Dropping columns is destructive,
  so drizzle-kit prompts, and the prompt hangs in a non-tty shell. `--force`
  answers it. Never read its exit code as success: it exits 0 when a statement
  fails and 0 when the database is unreachable. Read the schema back instead —
  `select count(*) from information_schema.columns where table_name =
'user_vocab_items' and column_name like '%\_level'` should return 0, and a
  second `pnpm db:push` should report "No changes detected".
- **Nothing refuses to start afterwards.** The migration script guards against
  exactly this ordering and will refuse if you run it on a database whose
  columns went without a copy — but the app never consults that guard, and the
  seed declines to claim its marker and completes normally. A deliberate hard
  push does not need an override to deploy. If you ever do need to silence the
  script on a database you have checked by hand, that is
  `--accept-missing-marker`.

## 5. Repointing existing audio URLs

Moving audio to a new public domain means rewriting the `endpoint/bucketName`
prefix in `vocab_items.audio_url`. There is no script for this. The one that
used to do it, `src/server/database/migrations/migrate-audio-urls.ts`, was
deleted as dead code in `a06d851` and this page kept naming it. It was a
prefix rewrite and nothing more, so here it is as SQL, which cannot rot the
same way:

```sql
update vocab_items
   set audio_url = replace(audio_url, 'https://OLD-ENDPOINT/BUCKET', 'https://NEW-PUBLIC-DOMAIN')
 where audio_url like 'https://OLD-ENDPOINT/BUCKET%';
```

The object keys are unchanged, so this is only right when the same files are
already reachable at the new domain. Moving from the local s3mock to R2 is not
that case — the audio does not exist in R2 yet — so re-seed instead of
rewriting the prefix. Note that `pnpm db:seed` skips every character already in
`vocab_items`, so emptying `audio_url` alone changes nothing: the rows have to
go too, or the seed has to run against a fresh database.

## 6. Verify

```bash
pnpm typecheck
pnpm test
```

Then check that a character page loads and its audio plays from the public
domain — the URL in `vocab_items.audio_url` should not contain `localhost`.
