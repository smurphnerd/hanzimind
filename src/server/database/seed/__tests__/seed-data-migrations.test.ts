import { describe, expect, it } from "vitest";

import type { Drizzle } from "../../database";
import { seedDataMigrations, shouldClaimMarker } from "../seed-data-migrations";

/**
 * The seed's half of the marker, and the more dangerous half: the copy only ever
 * claims a marker it earned, while the seed claims one on the strength of the
 * database looking new. Getting that wrong writes "this was migrated" over a
 * database that was not, and silences the guard for good.
 */
describe("shouldClaimMarker", () => {
  const fresh = {
    markerTableExists: true,
    learnerRows: 0,
    studiedItems: 0,
    legacyColumnsRemaining: 0,
  };

  it("should claim for a database born on the new shape", () => {
    expect(shouldClaimMarker(fresh)).toBe(true);
  });

  it("should still claim once a deck is saved but nothing studied", () => {
    // `study/addDeck` writes a user_vocab_items row per deck item, so an earlier
    // gate that asked for an empty table closed the window at the first deck
    // anyone saved, and a healthy never-migrated database seeded after that was
    // told to restore a snapshot of a migration it never ran.
    //
    // 398 learner rows and nothing studied is that exact state, and it is the
    // case that kills the old rule: a gate reading `learnerRows` answers false
    // here. The previous version of this test passed `studiedItems: 0` onto a
    // fixture that already had it, so it was deep-equal to the case above and
    // stayed green against the bug it named.
    expect(shouldClaimMarker({ ...fresh, learnerRows: 398 })).toBe(true);
  });

  it("should refuse once anyone has studied", () => {
    // The state a dropped database is in: the columns are gone, and the learners
    // who filled them are still here. Claiming here launders the loss.
    expect(
      shouldClaimMarker({ ...fresh, learnerRows: 398, studiedItems: 1 }),
    ).toBe(false);
  });

  it("should refuse while the old shape is still present", () => {
    // The move is still owed. Claiming it done would be a lie, and the copy
    // would then skip a database that genuinely needs it.
    expect(shouldClaimMarker({ ...fresh, legacyColumnsRemaining: 8 })).toBe(
      false,
    );
  });

  it("should refuse on a partly dropped legacy schema", () => {
    expect(shouldClaimMarker({ ...fresh, legacyColumnsRemaining: 4 })).toBe(
      false,
    );
  });

  it("should refuse when the marker table has not been pushed yet", () => {
    // Writing here does not record anything, it kills the seed on a Postgres
    // parser error and takes the dictionary down with it.
    expect(shouldClaimMarker({ ...fresh, markerTableExists: false })).toBe(
      false,
    );
  });

  it("should refuse when nothing at all is in place", () => {
    expect(
      shouldClaimMarker({
        markerTableExists: false,
        learnerRows: 398,
        studiedItems: 12,
        legacyColumnsRemaining: 8,
      }),
    ).toBe(false);
  });
});

/**
 * The gate as it actually runs, over a stubbed executor.
 *
 * `shouldClaimMarker` is pure and settles the rule; none of that reaches the
 * database. What is only visible here is the wiring: which questions get asked,
 * in what order, and whether an insert is issued at all. The two defects this
 * function shipped both lived in exactly that gap — it queried a table before
 * checking the table existed, and it wrote where it should have skipped.
 */
describe("seedDataMigrations", () => {
  type Reply = { rows: Record<string, unknown>[] };

  /**
   * Answers by looking at the SQL, so the test does not depend on the number or
   * order of the reads the way a queue of canned replies would.
   */
  function stub(options: {
    markerTable?: boolean;
    learnerRows?: number;
    studied?: number;
    legacyColumns?: number;
    insertWrites?: boolean;
  }) {
    const sent: string[] = [];
    const database = {
      execute: async (query: { toString?: () => string } | unknown) => {
        // `sql.raw` keeps the text on the chunk it was built from.
        const text = JSON.stringify(query);
        sent.push(text);
        const reply = (rows: Record<string, unknown>[]): Reply => ({ rows });
        if (text.includes("to_regclass")) {
          return reply([
            { name: options.markerTable === false ? null : "data_migrations" },
          ]);
        }
        if (text.includes("from user_vocab_items")) {
          return reply([
            {
              rows: options.learnerRows ?? 0,
              studied: options.studied ?? 0,
            },
          ]);
        }
        if (text.includes("information_schema.columns")) {
          return reply([{ count: options.legacyColumns ?? 0 }]);
        }
        if (text.includes("insert into data_migrations")) {
          return reply(
            options.insertWrites === false
              ? []
              : [{ name: "study-progress-rows" }],
          );
        }
        throw new Error(`unexpected query: ${text}`);
      },
    } as unknown as Drizzle;
    return { database, sent };
  }

  const inserted = (sent: string[]) =>
    sent.some((text) => text.includes("insert into data_migrations"));

  it("should claim the marker on a database born on the new shape", async () => {
    const { database, sent } = stub({});
    expect(await seedDataMigrations(database)).toEqual(["study-progress-rows"]);
    expect(inserted(sent)).toBe(true);
  });

  it("should write nothing when the marker table is not there yet", async () => {
    // And crucially, ask nothing else either: querying on is what killed the
    // whole seed with a Postgres parser error and took the dictionary with it.
    const { database, sent } = stub({ markerTable: false });
    expect(await seedDataMigrations(database)).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(inserted(sent)).toBe(false);
  });

  it("should write nothing once anyone has studied", async () => {
    const { database, sent } = stub({ learnerRows: 398, studied: 1 });
    expect(await seedDataMigrations(database)).toEqual([]);
    expect(inserted(sent)).toBe(false);
  });

  it("should still claim with a deck saved and nothing studied", async () => {
    const { database, sent } = stub({ learnerRows: 398, studied: 0 });
    expect(await seedDataMigrations(database)).toEqual(["study-progress-rows"]);
    expect(inserted(sent)).toBe(true);
  });

  it("should write nothing while the legacy columns are still there", async () => {
    const { database, sent } = stub({ legacyColumns: 8 });
    expect(await seedDataMigrations(database)).toEqual([]);
    expect(inserted(sent)).toBe(false);
  });

  it("should not claim a marker another run had already written", async () => {
    // ON CONFLICT DO NOTHING returns no row, and the return value is what the
    // seed logs, so reporting a claim here would misdescribe what happened.
    const { database } = stub({ insertWrites: false });
    expect(await seedDataMigrations(database)).toEqual([]);
  });

  it("should leave the conflict clause on the insert", async () => {
    const { database, sent } = stub({});
    await seedDataMigrations(database);
    const insert = sent.find((text) =>
      text.includes("insert into data_migrations"),
    );
    expect(insert).toContain("on conflict (name) do nothing");
  });
});
