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
    if (googleEnabled && isProd && !env.GOOGLE_REDIRECT_URI) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_REDIRECT_URI"],
        message: "GOOGLE_REDIRECT_URI is required when Google sign-in is enabled",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(source);
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
    allowedOrigins: [appOrigin, ...env.CORS_ORIGINS.split(",").map((o) => o.trim())].filter((o): o is string => !!o),
    trustProxy: env.TRUST_PROXY,
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
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: env.GOOGLE_REDIRECT_URI ?? `http://localhost:${env.PORT}/api/auth/google/callback`,
          }
        : null,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

export const config: AppConfig = loadConfig();
