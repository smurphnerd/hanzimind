import { describe, expect, it } from "vitest";

import { shouldClaimMarker } from "../seed-data-migrations";

/**
 * The seed's half of the marker, and the more dangerous half: the copy only ever
 * claims a marker it earned, while the seed claims one on the strength of the
 * database looking new. Getting that wrong writes "this was migrated" over a
 * database that was not, and silences the guard for good.
 */
describe("shouldClaimMarker", () => {
  const fresh = {
    markerTableExists: true,
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
    expect(shouldClaimMarker({ ...fresh, studiedItems: 0 })).toBe(true);
  });

  it("should refuse once anyone has studied", () => {
    // The state a dropped database is in: the columns are gone, and the learners
    // who filled them are still here. Claiming here launders the loss.
    expect(shouldClaimMarker({ ...fresh, studiedItems: 1 })).toBe(false);
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
        studiedItems: 12,
        legacyColumnsRemaining: 8,
      }),
    ).toBe(false);
  });
});
