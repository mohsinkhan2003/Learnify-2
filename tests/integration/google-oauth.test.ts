import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import type { Express } from "express";

// Enable Google sign-in for this file only (each test file gets a fresh module registry).
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";
process.env.SESSION_SECRET = "x".repeat(40);

// Stand in for Google's token endpoint: the "code" is the email Google would return.
vi.mock("../../server/auth/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/auth/google")>();
  return {
    ...actual,
    exchangeCode: async (code: string) => ({ googleId: `g-${code}`, email: code, name: "Google User", avatar: null }),
  };
});

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

  describe("linking to an existing account by email", () => {
    const ORIGIN = "http://localhost:5000";
    async function signUpWithPassword(email: string) {
      const agent = request.agent(app);
      const res = await agent
        .post("/api/auth/signup")
        .set("Origin", ORIGIN)
        .set("Host", "localhost:5000")
        .send({ email, password: "attacker password", name: "Someone", role: "student", school: "Oak" });
      expect(res.status).toBe(201);
      return { agent, id: res.body.id as string };
    }
    async function googleSignIn(email: string) {
      const agent = request.agent(app);
      const start = await agent.get("/api/auth/google/start");
      const state = new URL(start.headers.location).searchParams.get("state");
      const res = await agent.get(`/api/auth/google/callback?code=${encodeURIComponent(email)}&state=${state}`);
      expect(res.headers.location).toBe("/");
      return agent;
    }
    const login = (email: string) =>
      request(app)
        .post("/api/auth/login")
        .set("Origin", ORIGIN)
        .set("Host", "localhost:5000")
        .send({ email, password: "attacker password" });

    it("takes over an unconfirmed account safely: its password and sessions stop working", async () => {
      const { db } = await import("../../server/db");
      const { users } = await import("@shared/schema");
      const email = `victim-${Date.now()}@example.com`;
      const squatter = await signUpWithPassword(email);
      await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, squatter.id));

      const owner = await googleSignIn(email);
      expect((await owner.get("/api/auth/session")).body.user).toMatchObject({ email, emailVerified: true });
      expect((await login(email)).status).toBe(401);
      expect((await squatter.agent.get("/api/auth/session")).body.user).toBeNull();
    });

    it("keeps the password of an account whose email was already confirmed", async () => {
      const { db } = await import("../../server/db");
      const { users } = await import("@shared/schema");
      const email = `owner-${Date.now()}@example.com`;
      const { id } = await signUpWithPassword(email);
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, id));
      await googleSignIn(email);
      expect((await login(email)).status).toBe(200);
    });
  });
});
