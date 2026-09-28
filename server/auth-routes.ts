import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import {
  hashPassword,
  verifyPassword,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleAccount,
  createSession,
  deleteSession,
  toPublicUser,
} from "./auth";
import { asyncHandler, currentUser, getBearerToken, HttpError, requireAuth } from "./middleware";
import { config } from "./config";

const router = Router();

// Throttle credential endpoints to slow down brute-force and account-enumeration attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const roleSchema = z.enum(["teacher", "student"]);

const signupSchema = z
  .object({
    email: z.string().trim().email("Invalid email address").max(255),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    name: z.string().trim().min(1, "Name is required").max(100),
    role: roleSchema,
    school: z.string().trim().min(1, "School is required").max(255),
    subject: z.string().trim().max(100).optional(),
  })
  .refine((d) => d.role !== "teacher" || !!d.subject, {
    message: "Subject is required for teachers",
    path: ["subject"],
  });

const loginSchema = z.object({
  email: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(128),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request", result.error.issues);
  }
  return result.data;
}

router.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(signupSchema, req.body);

    if (await findUserByEmail(data.email)) {
      throw new HttpError(409, "Email already registered");
    }

    let user;
    try {
      user = await createUser({
        email: data.email,
        password: await hashPassword(data.password),
        name: data.name,
        role: data.role,
        school: data.school,
        subject: data.role === "teacher" ? data.subject : undefined,
      });
    } catch (error: any) {
      // Unique violation from a concurrent signup with the same email
      if (error?.code === "23505") throw new HttpError(409, "Email already registered");
      throw error;
    }

    const token = await createSession(user.id);
    res.status(201).json({ user: toPublicUser(user), token });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);

    const user = await findUserByEmail(email);
    if (!user?.password || !(await verifyPassword(password, user.password))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = await createSession(user.id);
    res.json({ user: toPublicUser(user), token });
  }),
);

// Google OAuth is optional; these routes are only active when credentials are configured.
const googleClient =
  config.google.clientId && config.google.clientSecret
    ? new OAuth2Client(config.google.clientId, config.google.clientSecret, config.google.redirectUri)
    : null;

function requireGoogle(): OAuth2Client {
  if (!googleClient) throw new HttpError(501, "Google sign-in is not configured");
  return googleClient;
}

router.get("/google", (_req, res, next) => {
  try {
    const url = requireGoogle().generateAuthUrl({ access_type: "online", scope: ["profile", "email"] });
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

const googleCallbackSchema = z.object({
  code: z.string().min(1),
  role: roleSchema.optional(),
  school: z.string().trim().min(1).max(255).optional(),
  subject: z.string().trim().max(100).optional(),
});

router.post(
  "/google/callback",
  authLimiter,
  asyncHandler(async (req, res) => {
    const client = requireGoogle();
    const { code, role, school, subject } = parseBody(googleCallbackSchema, req.body);

    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new HttpError(400, "Invalid Google response");

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new HttpError(400, "Google account email is not verified");
    }

    let user = await findUserByGoogleId(payload.sub);

    if (!user) {
      const existing = await findUserByEmail(payload.email);
      if (existing) {
        // Same verified email: link the Google identity to the existing account.
        user = await linkGoogleAccount(existing.id, payload.sub, payload.picture);
      } else {
        if (!role || !school) throw new HttpError(400, "Role and school are required for new users");
        if (role === "teacher" && !subject) throw new HttpError(400, "Subject is required for teachers");
        user = await createUser({
          email: payload.email,
          name: payload.name || payload.email,
          googleId: payload.sub,
          role,
          school,
          subject: role === "teacher" ? subject : undefined,
          avatar: payload.picture,
        });
      }
    }

    const token = await createSession(user.id);
    res.json({ user: toPublicUser(user), token });
  }),
);

router.get("/me", requireAuth, (req, res) => {
  res.json(toPublicUser(currentUser(req)));
});

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = getBearerToken(req);
    if (token) await deleteSession(token);
    res.json({ message: "Logged out successfully" });
  }),
);

export default router;
