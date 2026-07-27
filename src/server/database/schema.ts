import {
  integer,
  pgTable,
  text,
  primaryKey,
  boolean,
  jsonb,
  timestamp,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { timestampFields } from "./databaseUtils";
import {
  EtymologyType,
  SuggestionKind,
  SuggestionStatus,
  VocabType,
} from "@/definitions/definitions";
import { relations } from "drizzle-orm";

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
  deckName: text().notNull(),
  description: text().notNull(),
  createdById: text()
    .notNull()
    .references(() => users.id),
  ...timestampFields,
});

// Vocabulary items table
export const vocabItems = pgTable("vocab_items", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  vocabItem: text().notNull().unique(),
  translation: text(),
  pinyin: text().notNull(),
  vocabType: text().notNull().$type<VocabType>(),
  audioUrl: text().notNull(),
  decomposition: text(), // Used for characters
  etymologyHint: text(), // Used for characters
  etymologyType: text().$type<EtymologyType>(), // Used for characters
  radical: text(), // Used for characters
  strokes: jsonb().$type<string[] | null>(), // Used for characters - SVG path data for each stroke
  strokeMedians: jsonb().$type<[number, number][][] | null>(), // Used for characters - Median coordinates for animating strokes
  strokeMatches: jsonb().$type<(number[] | null)[] | null>(), // Used for characters
  // Too basic to teach (a sub-radical fragment) or unstudiable (no gloss to quiz
  // against). Disabled items are filtered out of every read path — decompositions,
  // dictionary, search, and study selection — so they behave as if deleted.
  // Driven by seed/vocab-classification.tsv; see scripts/classify-vocab.ts.
  disabled: boolean().notNull().default(false),
  // The curated memory aid an admin has starred for this glyph. Shown first on
  // the dictionary and used on a learner's study card until they pin their own.
  // Nullable, and the reference is a thunk because memoryAids is declared below
  // and points back here — a deliberate cycle Postgres allows.
  defaultMemoryAidId: text().references((): AnyPgColumn => memoryAids.id),
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
    seen: boolean().notNull().default(false),
    readingLevel: integer().notNull().default(0),
    listeningLevel: integer().notNull().default(0),
    understandingLevel: integer().notNull().default(0),
    writingLevel: integer().notNull().default(0),
    memoryAidId: text().references(() => memoryAids.id),
    readingNextAt: timestamp(),
    listeningNextAt: timestamp(),
    understandingNextAt: timestamp(),
    writingNextAt: timestamp(),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.userId, table.vocabItemId] })],
);

// Deck vocabulary items table (vocab items in a deck)
export const deckVocabItems = pgTable(
  "deck_vocab_items",
  {
    deckId: text()
      .notNull()
      .references(() => decks.id),
    vocabItemId: text()
      .notNull()
      .references(() => vocabItems.id),
    isConstituent: boolean().notNull().default(false),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.deckId, table.vocabItemId] })],
);

// User decks table (decks a user is studying)
export const userDecks = pgTable(
  "user_decks",
  {
    userId: text()
      .notNull()
      .references(() => users.id),
    deckId: text()
      .notNull()
      .references(() => decks.id),
    includeConstituents: boolean().notNull().default(false),
    readingEnabled: boolean().notNull().default(true),
    listeningEnabled: boolean().notNull().default(true),
    understandingEnabled: boolean().notNull().default(true),
    writingEnabled: boolean().notNull().default(true),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.userId, table.deckId] })],
);

export const memoryAids = pgTable("memory_aids", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  memoryAid: text().notNull(),
  vocabItemId: text()
    .notNull()
    .references(() => vocabItems.id),
  createdById: text()
    .notNull()
    .references(() => users.id),
  public: boolean().notNull().default(false),
  ...timestampFields,
});

// Extra meanings a user has chosen to accept for a vocab item ("I meant
// 'lady' for 女 — count it next time"). Personal, deterministic, and it makes
// grading better the more the deck is used.
export const userVocabSynonyms = pgTable(
  "user_vocab_synonyms",
  {
    userId: text()
      .notNull()
      .references(() => users.id),
    vocabItemId: text()
      .notNull()
      .references(() => vocabItems.id),
    /** Stored lowercase/trimmed so lookups are a plain comparison. */
    synonym: text().notNull(),
    ...timestampFields,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.vocabItemId, table.synonym] }),
  ],
);

// Learner-reported corrections ("this translation is wrong", "the audio is for
// the wrong tone"), reviewed on the admin screen. Both targets are nullable so a
// suggestion can be about a vocab row, about a memory aid, or about neither.
//
// This table doubles as its own rate-limit ledger: the submit endpoint counts a
// user's rows inside a time window instead of keeping a separate counter, which
// needs no extra table, cleans itself up as rows age out, and survives a
// redeploy the way an in-memory Map would not.
export const suggestions = pgTable("suggestions", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdById: text()
    .notNull()
    .references(() => users.id),
  vocabItemId: text().references(() => vocabItems.id),
  memoryAidId: text().references(() => memoryAids.id),
  kind: text().notNull().$type<SuggestionKind>(),
  body: text().notNull(),
  status: text().notNull().$type<SuggestionStatus>().default("open"),
  /** Set by a reviewer when closing the suggestion out. */
  adminNote: text(),
  resolvedById: text().references(() => users.id),
  resolvedAt: timestamp(),
  ...timestampFields,
});

export const suggestionRelations = relations(suggestions, ({ one }) => ({
  vocabItem: one(vocabItems, {
    fields: [suggestions.vocabItemId],
    references: [vocabItems.id],
  }),
  memoryAid: one(memoryAids, {
    fields: [suggestions.memoryAidId],
    references: [memoryAids.id],
  }),
  createdBy: one(users, {
    fields: [suggestions.createdById],
    references: [users.id],
  }),
}));

export const vocabItemRelations = relations(vocabItems, ({ many }) => ({
  memoryAids: many(memoryAids),
  decks: many(deckVocabItems),
  users: many(userVocabItems),
}));

export const memoryAidRelations = relations(memoryAids, ({ one }) => ({
  vocabItem: one(vocabItems, {
    fields: [memoryAids.vocabItemId],
    references: [vocabItems.id],
  }),
  user: one(users, {
    fields: [memoryAids.createdById],
    references: [users.id],
  }),
}));

export const deckRelations = relations(decks, ({ many, one }) => ({
  vocabItems: many(deckVocabItems),
  user: one(users, {
    fields: [decks.createdById],
    references: [users.id],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  decks: many(userDecks),
  vocabItems: many(userVocabItems),
  memoryAids: many(memoryAids),
}));

export const vocabItemDeckRelations = relations(deckVocabItems, ({ one }) => ({
  deck: one(decks, {
    fields: [deckVocabItems.deckId],
    references: [decks.id],
  }),
  vocabItem: one(vocabItems, {
    fields: [deckVocabItems.vocabItemId],
    references: [vocabItems.id],
  }),
}));

export const userVocabItemRelations = relations(userVocabItems, ({ one }) => ({
  vocabItem: one(vocabItems, {
    fields: [userVocabItems.vocabItemId],
    references: [vocabItems.id],
  }),
  user: one(users, {
    fields: [userVocabItems.userId],
    references: [users.id],
  }),
  memoryAid: one(memoryAids, {
    fields: [userVocabItems.memoryAidId],
    references: [memoryAids.id],
  }),
}));

export const userDeckRelations = relations(userDecks, ({ one }) => ({
  deck: one(decks, {
    fields: [userDecks.deckId],
    references: [decks.id],
  }),
  user: one(users, {
    fields: [userDecks.userId],
    references: [users.id],
  }),
}));

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
  decks,
  vocabItems,
  userVocabItems,
  deckVocabItems,
  userDecks,
  memoryAids,
  userVocabSynonyms,
  suggestions,
  suggestionRelations,
  vocabItemRelations,
  memoryAidRelations,
  deckRelations,
  userRelations,
  vocabItemDeckRelations,
  userVocabItemRelations,
  userDeckRelations,
};
