import "server-only";

import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
} from "awilix";
import { type Logger } from "pino";

import { type Auth, getAuth } from "@/server/auth";
import { createLogger } from "@/server/logger";
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
import { AdminService } from "@/server/services/AdminService";
import { StudyService } from "@/server/services/StudyService";
import { SuggestionService } from "@/server/services/SuggestionService";
import type { ITTSProvider } from "@/server/services/tts/ITTSProvider";
import { GoogleTTSAPIProvider } from "@/server/services/tts/GoogleTTSAPIProvider";
import {
  type ITranslationChecker,
  JaccardTranslationChecker,
} from "@/server/services/TranslationChecker";
import {
  CompositeTranslationChecker,
  SemanticTranslationChecker,
} from "@/server/services/SemanticTranslationChecker";

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
  adminService: AdminService;
  suggestionService: SuggestionService;
};

export const container = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

if (process.env.NODE_ENV !== "test") {
  const env = await import("@/env").then((mod) => mod.env);
  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === "development",
    gitSha: env.GIT_SHA,
  });

  container.register({
    logger: asValue(logger),
    // Must be a singleton: passing a connection string makes node-postgres
    // create a new Pool per instance, so a transient registration opens a fresh
    // pool on every resolution and exhausts Postgres connections under load.
    database: asFunction((deps: Cradle) =>
      getDatabase(deps.logger, env.DATABASE_URL),
    ).singleton(),
    // Must be a singleton: a fresh better-auth instance per resolution rebuilds
    // its adapter and plugin chain on every request that reads a session.
    auth: asFunction((deps: Cradle) =>
      getAuth(deps, {
        authSecret: env.AUTH_SECRET,
        baseUrl: env.BASE_URL,
        systemEmailFrom: env.SYSTEM_EMAIL_FROM,
      }),
    ).singleton(),
    storage: asFunction(() => new S3StorageAdapter(env.S3_OPTIONS)).singleton(),
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
            publicUrl:
              env.S3_OPTIONS.cloudfrontDistributionUrl ??
              `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`,
          },
        ),
    ).singleton(),
    translationChecker: asFunction(
      (deps: Cradle) =>
        new CompositeTranslationChecker(
          // Fast, deterministic, handles the vast majority of answers.
          // Ignores articles/"to" so "sell" is accepted for "to sell".
          new JaccardTranslationChecker({ filterFillerWords: true }),
          // Only consulted when the above rejects an answer.
          new SemanticTranslationChecker({ logger: deps.logger }),
        ),
    ).singleton(),
    vocabService: asClass(VocabService).singleton(),
    deckService: asClass(DeckService).singleton(),
    studyService: asClass(StudyService).singleton(),
    adminService: asClass(AdminService).singleton(),
    suggestionService: asClass(SuggestionService).singleton(),
  });
}
