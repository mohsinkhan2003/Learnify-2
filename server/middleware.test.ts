import { describe, expect, it } from "vitest";
import type { Request } from "express";

process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
const { assertUuid, getBearerToken, HttpError } = await import("./middleware");

const req = (authorization?: string) => ({ headers: { authorization } }) as Request;

describe("getBearerToken", () => {
  it("extracts a bearer token", () => {
    expect(getBearerToken(req("Bearer abc123"))).toBe("abc123");
  });

  it("returns null for missing or malformed headers", () => {
    expect(getBearerToken(req())).toBeNull();
    expect(getBearerToken(req("Basic abc"))).toBeNull();
    expect(getBearerToken(req("Bearer "))).toBeNull();
  });
});

describe("assertUuid", () => {
  it("accepts a UUID", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(assertUuid(id, "id")).toBe(id);
  });

  it("rejects anything else with a 400", () => {
    for (const bad of ["", "abc", "1; DROP TABLE users", undefined, 42]) {
      try {
        assertUuid(bad, "id");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(HttpError);
        expect((e as InstanceType<typeof HttpError>).status).toBe(400);
      }
    }
  });
});
