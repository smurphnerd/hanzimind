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
  Script,
  StudyType,
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
  // Better Auth admin-plugin fields. `role` is the runtime source of truth for
  // admin access; the plugin also manages banning.
  role: text().default("user"),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp(),
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
  // Better Auth admin-plugin field: set while an admin impersonates this user.
  impersonatedBy: text(),
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
  // Whether this component's own reading is worth teaching, because it is the
  // SOUND part of the characters it appears in (艮 gěn -> 很 跟 根 恨). False for
  // every other component and for everything that is not a component.
  //
  // Deliberately a flag rather than "has a non-empty pinyin". A bound form's
  // dictionary reading is borrowed from the full character it abbreviates (亻
  // gets 人's "rén"), and 97 rows in production still carry one from before the
  // component work, so the presence of a reading says nothing about whether it
  // should be taught. Set from vocab-classification.tsv; readingOf hides the
  // reading of anything this is false for, so a stale value is inert.
  phonetic: boolean().notNull().default(false),
  // Which script this item is written in: `simplified`/`traditional` mean it has a
  // distinct counterpart in the other script (国 <-> 國) and so does not belong in
  // the other script's deck; `both` means the glyph is identical in both (人, 大),
  // which is over half the dictionary. Defaults to `both` because that is the
  // neutral answer — a row nobody has classified is hidden from no one — but the
  // seed and the backfill both set it explicitly from script-classification.tsv.
  script: text().notNull().$type<Script>().default("both"),
  audioUrl: text().notNull(),
  decomposition: text(), // Used for characters
  etymologyHint: text(), // Used for characters
  etymologyType: text().$type<EtymologyType>(), // Used for characters
  // For a pictophonetic character, which of its parts supplied the sound and
  // which supplied the meaning — 沐 is 氵 (meaning, water) + 木 (sound, mù). The
  // dictionary names them per character, because the role belongs to the pair,
  // not to the part: 山 is the meaning in 峰 and the sound in 仙 xiān. Null on
  // anything that is not a pictophonetic character.
  etymologyPhonetic: text(),
  etymologySemantic: text(),
  radical: text(), // Used for characters
  strokes: jsonb().$type<string[] | null>(), // Used for characters - SVG path data for each stroke
  strokeMedians: jsonb().$type<[number, number][][] | null>(), // Used for characters - Median coordinates for animating strokes
  strokeMatches: jsonb().$type<(number[] | null)[] | null>(), // Used for characters
  // Too basic to teach (a sub-radical fragment) or unstudiable (no gloss to quiz
  // against). Disabled items are filtered out of every read path — decompositions,
  // dictionary, search, and study selection — so they behave as if deleted.
  // Driven by seed/vocab-classification.tsv; see scripts/backfill-classification.ts.
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
    // Answered at least once, in any study type. Says nothing about the level:
    // a wrong answer leaves the item seen at 0.
    seen: boolean().notNull().default(false),
    memoryAidId: text().references(() => memoryAids.id),
    ...timestampFields,
  },
  (table) => [primaryKey({ columns: [table.userId, table.vocabItemId] })],
);

/**
 * Data moves that `pnpm db:push` cannot perform, and the record that they ran.
 *
 * Push reconciles the SHAPE of the schema. It knows nothing about carrying data
 * from an old shape into a new one, so a reshape needs a script run beside it —
 * and once push has dropped the old columns, nothing in the database says
 * whether that script ever ran. The two outcomes are indistinguishable
 * afterwards: a database that was migrated correctly and one whose columns were
 * dropped with the data still in them look exactly alike.
 *
 * They are only indistinguishable if nobody wrote it down. This is where it gets
 * written down. `backfill-study-progress.ts` inserts its row inside the same
 * transaction as the copy, so a copy that rolls back leaves no row, and the seed
 * inserts the same row for a database that never had the old shape to begin
 * with. A missing row where the old columns are also missing is then a fact
 * rather than an inference.
 *
 * It has to be declared here rather than created by the script alone: a table
 * `schema.ts` does not know about is dropped by the next `db:push` — measured,
 * not assumed, on lane 8.
 */
export const dataMigrations = pgTable("data_migrations", {
  /** Stable id of the move, e.g. `study-progress-rows`. */
  name: text().primaryKey(),
  /** What ran and what it moved. For a human reading the table, never parsed. */
  note: text().notNull(),
  ...timestampFields,
});

/**
 * How far one learner has got with one item in one study type.
 *
 * One row per type, replacing the four `<type>Level` / `<type>NextAt` column
 * pairs this table used to carry. The pairs forced every reader to build a
 * column name from a study type at runtime, which no type system checks and
 * which spread a four-way `switch` through the query layer, the rules and the
 * client.
 *
 * Sparse on purpose: a type that has never been answered has no row, and means
 * level 0 due immediately (`emptyStudyProgress`). A level of 0 WITH a `nextAt`
 * is a different thing — an answer got wrong — and does get a row.
 *
 * Locking. Writers take the `user_vocab_items` row for the pair first and only
 * then touch this table, because the row here does not exist before the first
 * answer of its type and a lock on a row that is not there serialises nothing.
 * See `StudyService.processAnswer`.
 */
export const userStudyProgress = pgTable(
  "user_study_progress",
  {
    userId: text()
      .notNull()
      .references(() => users.id),
    vocabItemId: text()
      .notNull()
      .references(() => vocabItems.id),
    studyType: text().notNull().$type<StudyType>(),
    level: integer().notNull().default(0),
    /** Null means never scheduled, which selection reads as due now. */
    nextAt: timestamp(),
    ...timestampFields,
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.vocabItemId, table.studyType],
    }),
  ],
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
  userStudyProgress,
  dataMigrations,
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
