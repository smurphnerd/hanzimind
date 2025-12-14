import {
  integer,
  pgTable,
  text,
  primaryKey,
  boolean,
  pgEnum,
  jsonb,
  timestamp,
    bigint,
} from "drizzle-orm/pg-core";
import { timestampFields } from "./databaseUtils";
import { etymologyTypeValues, vocabTypeValues } from "@/lib/enums";

// Users table
export const users = pgTable("users", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestampFields,
});

export const verifications = pgTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  ...timestampFields,
});

export const rateLimits = pgTable("rateLimits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "bigint" }).notNull(),
});

// Session table
export const sessions = pgTable("sessions", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  ipAddress: text(),
  userAgent: text(),
  ...timestampFields,
});

// Account table
export const accounts = pgTable("accounts", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  idToken: text(),
  password: text(),
  ...timestampFields,
});

// Decks table
export const decks = pgTable("decks", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  deckName: text().notNull().unique(),
  description: text().notNull(),
  createdById: text()
    .notNull()
    .references(() => users.id),
  ...timestampFields,
});

// Vocabulary items table
export const vocabType = pgEnum("vocab_type", vocabTypeValues);
export const etymologyType = pgEnum("etymology_type", etymologyTypeValues);
export const vocabItems = pgTable("vocab_items", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  vocabItem: text().notNull().unique(),
  translation: text().notNull(),
  pinyin: text().notNull(),
  vocabType: vocabType("vocab_type").notNull(),
  audioUrl: text().notNull(),
  decomposition: text(), // Used for characters
  etymologyHint: text(), // Used for characters
  etymologyType: etymologyType("etymology_type"), // Used for characters
  radical: text(), // Used for characters
  strokes: jsonb(), // Used for characters - SVG path data for each stroke
  strokeMedians: jsonb(), // Used for characters - Median coordinates for animating strokes
  strokeMatches: jsonb(), // Used for characters
  ...timestampFields,
});

// User vocabulary items table (tracks user progress with vocab items)
export const userVocabItems = pgTable(
  "user_vocab_items",
  {
    userId: text()
      .notNull()
      .references(() => users.id),
    vocabItemId: text()
      .notNull()
      .references(() => vocabItems.id),
    level: integer().notNull().default(0),
    visualization: text(),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.userId, table.vocabItemId] })],
);

// Vocab translations table
export const vocabTranslations = pgTable(
  "vocab_translations",
  {
    vocabItemId: text()
      .notNull()
      .references(() => vocabItems.id),
    translation: text().notNull(),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.vocabItemId, table.translation] })],
);

// Deck vocabulary items table (vocab items in a deck)
export const deckVocabItems = pgTable("deck_vocab_items", {
  deckId: text()
    .notNull()
    .references(() => decks.id),
  vocabItemId: text()
    .notNull()
    .references(() => vocabItems.id),
  ...timestampFields,
});

// User decks table (decks a user is studying)
export const userDecks = pgTable("user_decks", {
  userId: text()
    .notNull()
    .references(() => users.id),
  deckId: text()
    .notNull()
    .references(() => decks.id),
  ...timestampFields,
});

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
  decks,
  vocabItems,
  userVocabItems,
  vocabTranslations,
  deckVocabItems,
  userDecks,
};
