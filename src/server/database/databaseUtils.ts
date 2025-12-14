import { timestamp } from "drizzle-orm/pg-core";

export const timestampFields = {
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

