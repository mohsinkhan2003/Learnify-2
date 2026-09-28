import { Router, type Response } from "express";
import { z } from "zod";
import type { AuthProviders } from "@shared/api";
import { config } from "../config/env";
import { asyncHandler, parse } from "../lib/http";
import { conflict, notFound, unauthorized, isUniqueViolation } from "../lib/errors";
import { sign, verify } from "../lib/signed-cookie";
import { rateLimits } from "../middleware/rate-limit";
import { currentUser, requireAuth } from "../middleware/auth";
import { hashPassword, verifyPassword } from "./password";
import { clearSessionCookie, createSession, deleteSession, setSessionCookie } from "./sessions";
import { toPublicUser, usersRepository } from "./users.repository";
import { createAuthRequest, exchangeCode, isGoogleEnabled, type GoogleProfile } from "./google";

const router = Router();

const OAUTH_COOKIE = "learnify_oauth";
const PENDING_COOKIE = "learnify_google_signup";
const shortCookie = { httpOnly: true, secure: config.session.cookieSecure, sameSite: "lax" as const, path: "/api/auth" };

const name = z.string().trim().min(1, "Please enter your name").max(100, "Name is too long");
const school = z.string().trim().min(2, "Please enter your school").max(255, "School name is too long");
const subject = z.string().trim().min(2, "Please enter the subject you teach").max(100, "Subject is too long");
const email = z.string().trim().email("Please enter a valid email address").max(255);
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const profileSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("teacher"), school, subject }),
  z.object({ role: z.literal("student"), school }),
]);

const signupSchema = z.intersection(z.object({ email, password, name }), profileSchema);
const loginSchema = z.object({ email: z.string().trim().min(1).max(255), password: z.string().min(1).max(128) });

async function startSession(res: Response, userId: string) {
  const { token, expiresAt } = await createSession(userId);
  setSessionCookie(res, token, expiresAt);
}

router.get("/providers", (_req, res) => {
  const providers: AuthProviders = { google: isGoogleEnabled() };
  res.json(providers);
});

router.post(
  "/signup",
  rateLimits.signup,
  asyncHandler(async (req, res) => {
    const data = parse(signupSchema, req.body);

    if (await usersRepository.findByEmail(data.email)) {
      throw conflict("An account with this email already exists. Try signing in instead.", "EMAIL_TAKEN");
    }

    let user;
    try {
      user = await usersRepository.create({
        email: data.email,
        password: await hashPassword(data.password),
        name: data.name,
        role: data.role,
        school: data.school,
        subject: data.role === "teacher" ? data.subject : null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("An account with this email already exists.", "EMAIL_TAKEN");
      throw error;
    }

    await startSession(res, user.id);
    req.log.info({ userId: user.id, role: user.role }, "User signed up");
    res.status(201).json(toPublicUser(user));
  }),
);

router.post(
  "/login",
  rateLimits.loginPerIp,
  rateLimits.loginPerAccount,
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await usersRepository.findByEmail(email);
    // verifyPassword runs a dummy comparison when the user is missing (timing-safe).
    if (!(await verifyPassword(password, user?.password)) || !user) {
      throw unauthorized("That email and password don't match an account.", "INVALID_CREDENTIALS");
    }
    await startSession(res, user.id);
    res.json(toPublicUser(user));
  }),
);

router.get("/me", requireAuth, (req, res) => {
  res.json(toPublicUser(currentUser(req)));
});

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.sessionToken) await deleteSession(req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Google OAuth (authorization code + PKCE, state bound to a signed cookie)
// ---------------------------------------------------------------------------

function requireGoogle() {
  if (!isGoogleEnabled() || !config.session.secret) throw notFound("Google sign-in is not enabled");
  return config.session.secret;
}

router.get(
  "/google/start",
  rateLimits.oauth,
  asyncHandler(async (_req, res) => {
    const secret = requireGoogle();
    const { url, state, verifier } = await createAuthRequest();
    res.cookie(OAUTH_COOKIE, sign({ state, verifier }, secret, 10 * 60 * 1000), { ...shortCookie, maxAge: 10 * 60 * 1000 });
    res.redirect(url);
  }),
);

router.get(
  "/google/callback",
  rateLimits.oauth,
  asyncHandler(async (req, res) => {
    const secret = requireGoogle();
    const stored = verify<{ state: string; verifier: string }>(req.cookies?.[OAUTH_COOKIE], secret);
    res.clearCookie(OAUTH_COOKIE, shortCookie);

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    // Only fixed, relative redirects are used, so there is no open-redirect surface.
    if (!stored || !code || !state || state !== stored.state) {
      req.log.warn("Google callback rejected: missing or mismatched state");
      return res.redirect("/login?error=google");
    }

    let profile: GoogleProfile;
    try {
      profile = await exchangeCode(code, stored.verifier);
    } catch (error) {
      req.log.warn({ err: error }, "Google code exchange failed");
      return res.redirect("/login?error=google");
    }

    let user = await usersRepository.findByGoogleId(profile.googleId);
    if (!user) {
      const existing = await usersRepository.findByEmail(profile.email);
      // Google has verified this email address, so linking to the matching account is safe.
      if (existing) user = await usersRepository.linkGoogle(existing.id, profile.googleId, profile.avatar);
    }

    if (user) {
      await startSession(res, user.id);
      return res.redirect("/");
    }

    // New user: they still need to choose a role and school.
    res.cookie(PENDING_COOKIE, sign(profile, secret, 15 * 60 * 1000), { ...shortCookie, maxAge: 15 * 60 * 1000 });
    res.redirect("/signup/complete");
  }),
);

router.get("/google/pending", (req, res, next) => {
  try {
    const profile = verify<GoogleProfile>(req.cookies?.[PENDING_COOKIE], requireGoogle());
    if (!profile) throw notFound("No pending Google sign-up");
    res.json({ email: profile.email, name: profile.name });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/google/complete",
  rateLimits.signup,
  asyncHandler(async (req, res) => {
    const profile = verify<GoogleProfile>(req.cookies?.[PENDING_COOKIE], requireGoogle());
    if (!profile) throw unauthorized("Your Google sign-in expired. Please try again.", "GOOGLE_SIGNUP_EXPIRED");
    const data = parse(z.intersection(z.object({ name: name.optional() }), profileSchema), req.body);

    let user;
    try {
      user = await usersRepository.create({
        email: profile.email,
        name: data.name ?? profile.name,
        googleId: profile.googleId,
        avatar: profile.avatar,
        role: data.role,
        school: data.school,
        subject: data.role === "teacher" ? data.subject : null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("An account with this email already exists.", "EMAIL_TAKEN");
      throw error;
    }
    res.clearCookie(PENDING_COOKIE, shortCookie);
    await startSession(res, user.id);
    res.status(201).json(toPublicUser(user));
  }),
);

export default router;
