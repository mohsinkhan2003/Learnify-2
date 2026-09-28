import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../server/config/env";
import { client, signUp } from "../helpers";

/**
 * Verification is enforced only when email can be sent. Here email goes to a fake Resend
 * endpoint (global fetch is intercepted) so the tests can read the links.
 */
const sent: { to: string; subject: string; text: string }[] = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  config.email.resendApiKey = "re_test";
  config.email.from = "Learnify <no-reply@test.local>";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).startsWith("https://api.resend.com/")) {
      const body = JSON.parse(String(init?.body));
      sent.push({ to: body.to[0], subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }
    return realFetch(input, init);
  });
});
afterAll(() => {
  config.email.resendApiKey = undefined;
  config.email.from = undefined;
  vi.restoreAllMocks();
});
beforeEach(() => {
  sent.length = 0;
});

const linkToken = (text: string, path: string) => {
  const m = text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  if (!m) throw new Error(`no ${path} link in: ${text}`);
  return m[1];
};

describe("email verification", () => {
  it("new accounts must confirm their email before using the app", async () => {
    const { c, email, user } = await signUp("student");
    expect((user as unknown as { emailVerified: boolean }).emailVerified).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);

    // Signed in, but app features are blocked.
    const session = await c.get("/api/auth/session");
    expect(session.body.user.emailVerified).toBe(false);
    const blocked = await c.get("/api/student/assignments");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("EMAIL_NOT_VERIFIED");

    const token = linkToken(sent[0].text, "/verify-email");
    const ok = await c.post("/api/auth/verify-email", { token });
    expect(ok.status).toBe(200);
    expect(ok.body.emailVerified).toBe(true);
    expect((await c.get("/api/student/assignments")).status).toBe(200);

    // Links are single use.
    const again = await c.post("/api/auth/verify-email", { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("VERIFY_LINK_INVALID");
  });

  it("the link signs the user in on another device", async () => {
    await signUp("teacher");
    const token = linkToken(sent[0].text, "/verify-email");
    const phone = client();
    expect((await phone.post("/api/auth/verify-email", { token })).status).toBe(200);
    expect((await phone.get("/api/teacher/classes")).status).toBe(200);
  });

  it("resending replaces the previous link", async () => {
    const { c } = await signUp("student");
    const first = linkToken(sent[0].text, "/verify-email");
    expect((await c.post("/api/auth/verify-email/resend")).status).toBe(200);
    expect(sent).toHaveLength(2);
    const second = linkToken(sent[1].text, "/verify-email");
    expect(second).not.toBe(first);
    expect((await client().post("/api/auth/verify-email", { token: first })).status).toBe(400);
    expect((await client().post("/api/auth/verify-email", { token: second })).status).toBe(200);
  });

  it("resend requires sign-in; bad tokens are rejected", async () => {
    expect((await client().post("/api/auth/verify-email/resend")).status).toBe(401);
    expect((await client().post("/api/auth/verify-email", { token: "x".repeat(43) })).status).toBe(400);
  });

  it("an emailed password reset also proves the address", async () => {
    const { email } = await signUp("student");
    sent.length = 0;
    await client().post("/api/auth/password/forgot", { email });
    const token = linkToken(sent[0].text, "/reset-password");
    const res = await client().post("/api/auth/password/reset", { token, password: "a whole new password" });
    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);
  });

  it("is not enforced when email can't be sent", async () => {
    const key = config.email.resendApiKey;
    config.email.resendApiKey = undefined;
    try {
      const { c } = await signUp("student");
      expect((await c.get("/api/student/assignments")).status).toBe(200);
    } finally {
      config.email.resendApiKey = key;
    }
  });
});
