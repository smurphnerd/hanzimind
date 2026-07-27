import "server-only";
import { envSchema } from "./env-utils";

export const env = envSchema.parse({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV,
  // GIT_SHA is required but only ever tags log lines with the running build.
  // Vercel publishes the deploy's commit as VERCEL_GIT_COMMIT_SHA and never
  // sets GIT_SHA, so without this fallback every server module throws on
  // import — and setting GIT_SHA by hand would pin one value across all
  // future deploys, which is worse than not having it.
  GIT_SHA: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
});
