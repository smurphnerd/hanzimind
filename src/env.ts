import "server-only";
import { envSchema } from "./env-utils";

export const env = envSchema.parse({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV,
});
