import { z } from "zod";
import { loadDotEnv } from "./dotenv";

loadDotEnv();

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    /** Public origin of the app, e.g. https://learnify.example.com. Required in production. */
    APP_URL: z.string().url().optional(),
    /** Extra origins allowed to call the API with credentials (comma-separated). */
    CORS_ORIGINS: z.string().default(""),
    // Origins allowed to embed the app in a frame (comma-separated). Empty = no framing.
    FRAME_ANCESTORS: z.string().default(""),
    // "memory" (single long-running process) or "postgres" (shared across serverless instances).
    RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).optional(),
    // Bearer token Vercel Cron (or any scheduler) sends to /api/internal/cron. Unset = route disabled.
    CRON_SECRET: z.string().min(16).optional(),
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),
    /** Secure cookies. Defaults to true in production. */
    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
    /** HMAC secret for short-lived signed cookies (OAuth sign-up). Required when Google is enabled. */
    SESSION_SECRET: z.string().min(32).optional(),

    // AI
    AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    AI_INTEGRATIONS_OPENAI_API_KEY: z.string().optional(),
    AI_INTEGRATIONS_OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
    OPENAI_MODERATION: bool.default("true"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(2000).default(450),
    AI_CONTEXT_MESSAGES: z.coerce.number().int().min(2).max(50).default(12),
    AI_MAX_TURNS_PER_ASSIGNMENT: z.coerce.number().int().positive().default(40),
    AI_DAILY_TURNS_PER_USER: z.coerce.number().int().positive().default(150),
    AI_DAILY_AUDIO_SECONDS_PER_USER: z.coerce.number().int().positive().default(1800),
    TRANSCRIPTION_ENABLED: bool.default("true"),
    MAX_AUDIO_SECONDS: z.coerce.number().int().positive().max(300).default(60),
    MAX_AUDIO_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(3 * 1024 * 1024),

    // Push
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:support@learnify.app"),

    // Email (optional; password-reset emails). Resend has a free tier: https://resend.com
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    // SMTP (e.g. Gmail with an app password: smtp.gmail.com, port 465). Used when RESEND_API_KEY is unset.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    // "required" (default when email can be sent) or "off".
    EMAIL_VERIFICATION: z.enum(["required", "off"]).default("required"),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === "production";
    const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    if (isProd && !env.APP_URL) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL is required in production" });
    }
    if (isProd && env.AI_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["AI_PROVIDER"], message: "the mock AI provider cannot be used in production" });
    }
    if (env.AI_PROVIDER === "openai" && isProd && !(env.OPENAI_API_KEY || env.AI_INTEGRATIONS_OPENAI_API_KEY)) {
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "OPENAI_API_KEY is required in production" });
    }
    if (googleEnabled && !env.SESSION_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET (32+ chars) is required when Google sign-in is enabled",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  // On Render / Vercel / Hugging Face Spaces, fall back to the platform's public URL so APP_URL
  // needn't be set by hand.
  const https = (host?: string) => (host ? `https://${host}` : undefined);
  const serverless = !!source.VERCEL;
  const platformUrl = source.RENDER_EXTERNAL_URL || https(source.VERCEL_PROJECT_PRODUCTION_URL) || https(source.SPACE_HOST);
  const parsed = envSchema.safeParse({
    ...source,
    APP_URL: source.APP_URL || platformUrl || undefined,
    // Many small instances: keep each pool small and share rate-limit state through the database.
    DATABASE_POOL_MAX: source.DATABASE_POOL_MAX || (serverless ? "3" : undefined),
    RATE_LIMIT_STORE: source.RATE_LIMIT_STORE || (serverless ? "postgres" : undefined),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  const appOrigin = env.APP_URL ? new URL(env.APP_URL).origin : undefined;

  return {
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === "test",
    port: env.PORT,
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : isProduction ? "info" : "debug"),
    database: { url: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX },
    appOrigin,
    allowedOrigins: [
      appOrigin,
      // A Vercel deployment's own URLs (preview / branch) are same-app origins.
      https(source.VERCEL_URL),
      https(source.VERCEL_BRANCH_URL),
      ...env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    ].filter((o): o is string => !!o),
    rateLimitStore: env.RATE_LIMIT_STORE ?? "memory",
    cronSecret: env.CRON_SECRET,
    trustProxy: env.TRUST_PROXY,
    frameAncestors: env.FRAME_ANCESTORS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    session: {
      ttlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      cookieSecure: env.COOKIE_SECURE ?? isProduction,
      secret: env.SESSION_SECRET,
    },
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: env.OPENAI_API_KEY ?? env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL ?? env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
      transcribeModel: env.OPENAI_TRANSCRIBE_MODEL,
      moderation: env.OPENAI_MODERATION,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      contextMessages: env.AI_CONTEXT_MESSAGES,
      maxTurnsPerAssignment: env.AI_MAX_TURNS_PER_ASSIGNMENT,
      dailyTurnsPerUser: env.AI_DAILY_TURNS_PER_USER,
      dailyAudioSecondsPerUser: env.AI_DAILY_AUDIO_SECONDS_PER_USER,
      transcriptionEnabled: env.TRANSCRIPTION_ENABLED,
      maxAudioSeconds: env.MAX_AUDIO_SECONDS,
      maxAudioBytes: env.MAX_AUDIO_BYTES,
    },
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY?.trim(),
      privateKey: env.VAPID_PRIVATE_KEY?.trim(),
      subject: env.VAPID_SUBJECT,
    },
    email: {
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM ?? (env.SMTP_USER ? `Learnify <${env.SMTP_USER}>` : undefined),
      smtp:
        env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
          ? { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS }
          : null,
      verification: env.EMAIL_VERIFICATION,
    },
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Defaults to APP_URL's callback, which must be listed exactly in the Google Cloud console.
            redirectUri: env.GOOGLE_REDIRECT_URI ?? `${appOrigin ?? `http://localhost:${env.PORT}`}/api/auth/google/callback`,
          }
        : null,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

export const config: AppConfig = loadConfig();
