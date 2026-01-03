import "server-only";

import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
} from "awilix";
import { type Logger, pino } from "pino";
import pinoPretty from "pino-pretty";

import { type Auth, getAuth } from "@/server/auth";
import { type Drizzle, getDatabase } from "@/server/database/database";
import {
  type EmailAdapter,
  SESEmailAdapter,
  SmtpEmailAdapter,
} from "@/server/services/EmailAdapter";
import { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import { TranslatorService } from "@/server/services/TranslatorService";
import { VocabService } from "@/server/services/VocabService";
import { TTSService } from "@/server/services/TTSService";
import { DeckService } from "@/server/services/DeckService";
import { StudyService } from "@/server/services/StudyService";
import type { ITTSProvider } from "@/server/services/tts/ITTSProvider";
import { GoogleTTSAPIProvider } from "@/server/services/tts/GoogleTTSAPIProvider";
import {
  type ITranslationChecker,
  JaccardTranslationChecker,
} from "@/server/services/TranslationChecker";

export type Cradle = {
  logger: Logger;
  database: Drizzle;
  storage: S3StorageAdapter;
  email: EmailAdapter;
  auth: Auth;
  translator: TranslatorService;
  ttsProvider: ITTSProvider;
  tts: TTSService;
  translationChecker: ITranslationChecker;
  vocabService: VocabService;
  deckService: DeckService;
  studyService: StudyService;
};

export const container = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

if (process.env.NODE_ENV !== "test") {
  const env = await import("@/env").then((mod) => mod.env);
  const logger = pino(
    {
      level: env.LOG_LEVEL ?? "info",
    },
    env.NODE_ENV === "development" ? pinoPretty() : undefined,
  ).child({
    GIT_SHA: env.GIT_SHA,
  });

  container.register({
    logger: asValue(logger),
    database: asFunction((deps: Cradle) =>
      getDatabase(deps.logger, env.DATABASE_URL),
    ).singleton(),
    auth: asFunction((deps: Cradle) =>
      getAuth(deps, {
        authSecret: env.AUTH_SECRET,
        baseUrl: env.BASE_URL,
        systemEmailFrom: env.SYSTEM_EMAIL_FROM,
      }),
    ),
    storage: asFunction(
      () => new S3StorageAdapter(env.S3_OPTIONS),
    ).singleton(),
    email:
      env.EMAIL_CONNECTION_URL === "ses"
        ? asClass(SESEmailAdapter).singleton()
        : asFunction(
            (deps: Cradle) =>
              new SmtpEmailAdapter(deps, {
                smtpConnectionUrl: env.EMAIL_CONNECTION_URL,
              }),
          ).singleton(),
    translator: asFunction(
      (deps: Cradle) =>
        new TranslatorService(deps, {
          deeplApiKey: env.DEEPL_API_KEY,
        }),
    ).singleton(),
    ttsProvider: asFunction(
      (deps: Cradle) => new GoogleTTSAPIProvider(deps.logger),
    ).singleton(),
    tts: asFunction(
      (deps: Cradle) =>
        new TTSService(
          {
            logger: deps.logger,
            storage: deps.storage,
            ttsProvider: deps.ttsProvider,
          },
          {
            publicUrl: `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`,
          },
        ),
    ).singleton(),
    translationChecker: asFunction(
      () => new JaccardTranslationChecker(),
    ).singleton(),
    vocabService: asClass(VocabService).singleton(),
    deckService: asClass(DeckService).singleton(),
    studyService: asClass(StudyService).singleton(),
  });
}
