import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Enable Google sign-in for this file only (each test file gets a fresh module registry).
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";
process.env.SESSION_SECRET = "x".repeat(40);

let app: Express;
beforeAll(async () => {
  app = (await import("../../server/app")).createApp();
});

describe("Google OAuth hardening", () => {
  it("advertises the provider", async () => {
    expect((await request(app).get("/api/auth/providers")).body).toEqual({ google: true, email: false });
  });

  it("starts the flow with state + PKCE and a fixed redirect URI", async () => {
    const res = await request(app).get("/api/auth/google/start");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.GOOGLE_REDIRECT_URI);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/learnify_oauth=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("rejects callbacks without the state cookie (login CSRF)", async () => {
    const res = await request(app).get("/api/auth/google/callback?code=abc&state=forged");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login?error=google");
  });

  it("rejects callbacks whose state does not match the cookie", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google/start");
    const state = new URL(start.headers.location).searchParams.get("state");
    const res = await agent.get(`/api/auth/google/callback?code=abc&state=${state}tampered`);
    expect(res.headers.location).toBe("/login?error=google");
  });

  it("refuses to complete a sign-up without a valid pending cookie", async () => {
    const res = await request(app)
      .post("/api/auth/google/complete")
      .set("Origin", "http://localhost:5000")
      .set("Host", "localhost:5000")
      .send({ role: "student", school: "Oak" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("GOOGLE_SIGNUP_EXPIRED");
  });
});
