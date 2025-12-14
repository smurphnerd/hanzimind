import * as z from "zod/v4";

export const stringToJSONSchema = z.string().transform((str, ctx): unknown => {
  try {
    return JSON.parse(str);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid JSON" });
    return z.NEVER;
  }
});

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional(),
  GIT_SHA: z.string(),
  BASE_URL: z.string(),
  DATABASE_URL: z.string(),
  S3_OPTIONS: stringToJSONSchema.pipe(
    z.object({
      credentials: z
        .object({
          accessKeyId: z.string(),
          secretAccessKey: z.string(),
        })
        .optional(),
      endpoint: z.string(),
      region: z.string(),
      bucketName: z.string(),
      forcePathStyle: z.boolean().optional(),
    }),
  ),
  EMAIL_CONNECTION_URL: z.union([
    z.url({ protocol: /^smtp$/ }),
    z.literal("ses"),
  ]),
  AUTH_SECRET: z.string(),
  SYSTEM_EMAIL_FROM: z.string(),
  DEEPL_API_KEY: z.string(),
});
