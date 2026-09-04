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

## 4. Create the schema on a new database

With Doppler configured:

```bash
pnpm db:migrate  # apply drizzle/*.sql
pnpm db:seed     # ~9.5k dictionary entries + audio
```

`db:migrate` applies every migration in `drizzle/` that the journal does not
already record, inside one transaction, and records what it applied in
`drizzle.__drizzle_migrations`. Running it twice is a no-op: the second run
prints `Already up to date, applied 0 migrations`. It needs only `DATABASE_URL`,
so it can be pointed at a database Doppler knows nothing about:

```bash
DATABASE_URL=postgres://… pnpm exec tsx src/server/database/migrate.ts
```

`pnpm db:generate` writes a new migration after `schema.ts` changes. Commit the
`.sql` file and the `meta/` files together — `migrate.test.ts` fails when the
schema file and the migrations disagree, or when a journal entry has no file.

`pnpm db:push:scratch` still exists and still shoves `schema.ts` straight into a
database without writing a migration. It is for a throwaway database you are
willing to drop. Never point it at anything shared: it leaves no record of what
it did, so the next `db:migrate` has no way to know.

The seed is **idempotent and resumable**: it loads existing characters once,
inserts in batches with `onConflictDoNothing`, and skips anything already
present. A failed or interrupted run can simply be re-run.

Runtime is dominated by TTS (~325 ms per character). `SEED_BATCH_SIZE` in
`src/server/database/seed/seed-dictionary.ts` controls concurrency — 12 takes
roughly 5 minutes; raise it if the TTS endpoint tolerates more.

## 5. Cutting an existing database over to migrations

A database created before migrations existed — production, or any database built
by the old `db:push` — has all the tables and no journal. A plain `db:migrate`
there would try to `CREATE TABLE "accounts"` again and fail. It fails cleanly,
because drizzle runs the whole thing in one transaction and Postgres rolls back
DDL, but it fails.

The cutover is one command. Do the drift check below first.

### 5a. Check for drift, read-only

The baseline was generated from `schema.ts`, not read out of any database, so it
describes what the schema file says. If the schema was ever pushed straight
into production from a working copy that differed, the two can disagree — and the
whole cutover assumes they do not. Build a reference database from the migration
and compare the two catalogs. `$DATABASE_URL` below is the remote database,
as Doppler sets it; the reference one is passed inline. Nothing here writes to
the remote database.

```bash
# 1. A local reference database with nothing in it but the migration.
docker compose -f development/docker-compose.yaml up -d postgres
docker compose -f development/docker-compose.yaml exec -T postgres \
  psql -U postgres -c 'create database migrate_reference'
DATABASE_URL=postgres://postgres:postgres@localhost:5432/migrate_reference \
  pnpm exec tsx src/server/database/migrate.ts

# 2. The same catalog dump from each. Save them side by side.
docker compose -f development/docker-compose.yaml exec -T postgres \
  psql -X -U postgres -d migrate_reference -f - \
  < scripts/schema-catalog.sql > /tmp/expected.txt

docker run --rm -i postgres:17-alpine \
  psql -X "$DATABASE_URL" -f - \
  < scripts/schema-catalog.sql > /tmp/actual.txt

diff -u /tmp/expected.txt /tmp/actual.txt
```

Both halves go through a container on purpose: there is no `psql` on the
machines this program runs on, and the remote database is not reachable from
the compose network, so the local one is queried through `compose exec` and the
remote one through a throwaway `postgres:17-alpine` client that can reach the
internet. The image is already pulled — it is the one the compose file uses. If
you do have `psql` on your path, `psql -X "$DATABASE_URL" -f
scripts/schema-catalog.sql` is the same command.

`scripts/schema-catalog.sql` asks for relations, columns, constraints, indexes,
types, sequences, triggers, functions, comments and extensions. Several of those
sections are empty against today's schema, which is deliberate: an earlier
version asked only about columns, constraints and indexes, and a control that
injected five deliberate differences let a new enum type through.

An empty diff means the baseline describes the remote database and the cutover
below is safe. **Anything else is a finding, not a formality**, and it is about
this particular database rather than about the tools. Read it before going on: a
column production has and `schema.ts` does not means the schema was pushed from
a branch that never merged, and marking the baseline applied would freeze that
difference in place forever, invisible to every later migration. Reconcile it
first — usually by correcting `schema.ts` and regenerating, so the
baseline describes what is really there.

Drop the reference database when done:

```bash
docker compose -f development/docker-compose.yaml exec -T postgres \
  psql -U postgres -c 'drop database migrate_reference'
```

CI runs this same file between a push-built database and a migrated one on
every commit, which is why the tools are not the suspect here.

### 5b. Mark the baseline applied

```bash
pnpm db:migrate --baseline
```

This writes one row into `drizzle.__drizzle_migrations` — the sha256 of
`drizzle/0000_baseline.sql` and its journal timestamp — saying the baseline has
already run. It does not touch a single table.

It decides what to do by looking, and is safe to run twice:

| What it finds                      | What it does                                    |
| ---------------------------------- | ----------------------------------------------- |
| The journal already has rows       | Nothing. Says how many are recorded.            |
| Every table in the baseline exists | Records the baseline.                           |
| None of them exist                 | Nothing. Tells you to run `db:migrate` instead. |
| Only some of them exist            | **Refuses**, names the missing tables, exits 1. |

That last row is the one to take seriously. A half-built database has no right
answer, and a journal row there would tell every later migration that the
missing tables are already there.

Confirm the row, then apply anything after the baseline:

```bash
docker run --rm postgres:17-alpine \
  psql "$DATABASE_URL" -c 'select * from drizzle.__drizzle_migrations'
pnpm db:migrate
```

On a database that was already current, the second command prints
`Already up to date, applied 0 migrations`. That is the whole cutover.

## 6. Repointing existing audio URLs

Moving audio to a new public domain means rewriting the `endpoint/bucketName`
prefix in `vocab_items.audio_url`. There is no script for this: the one that
used to do it (`src/server/database/migrations/migrate-audio-urls.ts`) was
deleted as dead code, and this page went on naming it. It was a prefix rewrite
and nothing more:

```sql
update vocab_items
   set audio_url = replace(audio_url, 'https://OLD-ENDPOINT/BUCKET', 'https://NEW-PUBLIC-DOMAIN')
 where audio_url like 'https://OLD-ENDPOINT/BUCKET%';
```

The object keys are unchanged, so this is only right when the same files are
already reachable at the new domain. Moving from the local s3mock to R2 is not
that case — the audio does not exist in R2 yet — so re-run `pnpm db:seed`
against an empty `audio_url` instead of rewriting the prefix.

## 7. Verify

```bash
pnpm typecheck
pnpm test
```

Then check that a character page loads and its audio plays from the public
domain — the URL in `vocab_items.audio_url` should not contain `localhost`.
