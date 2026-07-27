import { describe, it, expect } from "vitest";

import { isAdminEmail, parseAdminEmails } from "../admin-access";

describe("parseAdminEmails", () => {
  it("should split a comma-separated list", () => {
    expect(parseAdminEmails("a@example.com,b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("should trim surrounding whitespace", () => {
    expect(parseAdminEmails(" a@example.com , b@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("should lowercase addresses", () => {
    expect(parseAdminEmails("Admin@Example.COM")).toEqual([
      "admin@example.com",
    ]);
  });

  it("should drop empty entries from a trailing comma", () => {
    expect(parseAdminEmails("a@example.com,,")).toEqual(["a@example.com"]);
  });

  it("should return nothing for an empty value", () => {
    expect(parseAdminEmails("")).toEqual([]);
  });

  it("should return nothing when unset", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  const admins = parseAdminEmails("admin@example.com,owner@example.com");

  it("should admit a listed address", () => {
    expect(isAdminEmail("admin@example.com", admins)).toBe(true);
  });

  it("should admit regardless of casing", () => {
    // Providers treat the local part inconsistently, and a user can sign up
    // with any casing they like.
    expect(isAdminEmail("Admin@Example.com", admins)).toBe(true);
  });

  it("should ignore surrounding whitespace", () => {
    expect(isAdminEmail("  admin@example.com  ", admins)).toBe(true);
  });

  it("should reject an unlisted address", () => {
    expect(isAdminEmail("someone@example.com", admins)).toBe(false);
  });

  it("should reject null", () => {
    expect(isAdminEmail(null, admins)).toBe(false);
  });

  it("should reject undefined", () => {
    expect(isAdminEmail(undefined, admins)).toBe(false);
  });

  it("should reject an empty address", () => {
    expect(isAdminEmail("", admins)).toBe(false);
  });

  it("should reject a whitespace-only address", () => {
    expect(isAdminEmail("   ", admins)).toBe(false);
  });

  it("should admit nobody when the list is empty", () => {
    // An unconfigured ADMIN_EMAILS must close the door, not open it.
    expect(isAdminEmail("admin@example.com", [])).toBe(false);
  });

  it("should not match a partial address", () => {
    expect(isAdminEmail("dmin@example.com", admins)).toBe(false);
  });

  it("should not match a lookalike domain", () => {
    expect(isAdminEmail("admin@example.com.evil.test", admins)).toBe(false);
  });
});
