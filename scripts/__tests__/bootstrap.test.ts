import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod/v4";

import { bootstrap } from "../bootstrap";

describe("bootstrap", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("should throw a zod error naming DATABASE_URL when it is unset", () => {
    delete process.env.DATABASE_URL;

    expect(() => bootstrap()).toThrow(ZodError);
    expect(() => bootstrap()).toThrow(/DATABASE_URL/);
  });
});
