import { describe, expect, it } from "vitest";
import { client, signUp, ORIGIN, getApp } from "../helpers";
import request from "supertest";

describe("authentication", () => {
  it("signs up, sets an httpOnly session cookie and never returns the password", async () => {
    const c = client();
    const res = await c.post("/api/auth/signup", {
      email: `New.User.${Date.now()}@Example.com`,
      password: "long enough password",
      name: "New User",
      role: "student",
      school: "Oak High",
    });
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
    expect(res.body.email).toMatch(/^new\.user\.\d+@example\.com$/); // normalised
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/learnify_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await c.get("/api/auth/me")).status).toBe(200);
  });

  it("validates signup input", async () => {
    const c = client();
    const weak = await c.post("/api/auth/signup", { email: "a@b.co", password: "short", name: "A", role: "student", school: "Oak" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");
    const noSubject = await c.post("/api/auth/signup", {
      email: "t@b.co",
      password: "long enough pw",
      name: "T",
      role: "teacher",
      school: "Oak",
    });
    expect(noSubject.status).toBe(400);
    const badRole = await c.post("/api/auth/signup", {
      email: "x@b.co",
      password: "long enough pw",
      name: "X",
      role: "admin",
      school: "Oak",
    });
    expect(badRole.status).toBe(400);
  });

  it("rejects duplicate emails case-insensitively", async () => {
    const { email } = await signUp("student");
    const res = await client().post("/api/auth/signup", {
      email: email.toUpperCase(),
      password: "long enough pw",
      name: "Dup",
      role: "student",
      school: "Oak High",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("logs in case-insensitively and rejects wrong passwords with a generic error", async () => {
    const { email } = await signUp("teacher");
    const ok = await client().post("/api/auth/login", { email: email.toUpperCase(), password: "correct horse battery" });
    expect(ok.status).toBe(200);
    const bad = await client().post("/api/auth/login", { email, password: "wrong password!" });
    const unknown = await client().post("/api/auth/login", { email: "nobody@example.com", password: "wrong password!" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message); // no account enumeration
  });

  it("logout invalidates the session server-side", async () => {
    const { c } = await signUp("student");
    const cookie = (await c.get("/api/auth/me")).request.cookies;
    expect(cookie).toBeTruthy();
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects forged or garbage session cookies", async () => {
    const res = await request(getApp()).get("/api/auth/me").set("Cookie", "learnify_session=forged-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("blocks state-changing requests without a trusted Origin (CSRF)", async () => {
    const { c } = await signUp("teacher");
    const noOrigin = await c.raw.post("/api/auth/logout");
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error.code).toBe("CSRF_REJECTED");
    const evil = await c.raw.post("/api/auth/logout").set("Origin", "https://evil.example");
    expect(evil.status).toBe(403);
    const good = await c.raw.post("/api/auth/logout").set("Origin", ORIGIN);
    expect(good.status).toBe(204);
  });

  it("returns a consistent error envelope with a request id and no internals", async () => {
    const res = await request(getApp())
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "MALFORMED_JSON" });
    expect(res.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|SELECT/);
  });

  it("exposes a non-erroring session probe for the SPA", async () => {
    expect((await client().get("/api/auth/session")).body).toEqual({ user: null });
    const { c } = await signUp("student");
    expect((await c.get("/api/auth/session")).body.user.role).toBe("student");
  });

  it("reports providers and hides Google routes when not configured", async () => {
    const c = client();
    expect((await c.get("/api/auth/providers")).body).toEqual({ google: false });
    expect((await c.get("/api/auth/google/start")).status).toBe(404);
  });

  it("serves health and readiness without internal details", async () => {
    const app = getApp();
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
    expect((await request(app).get("/ready")).body).toEqual({ status: "ready" });
  });
});
