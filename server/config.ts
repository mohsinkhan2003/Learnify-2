import { z } from "zod";

// Centralised, validated environment configuration. Importing this module
// fails fast with a readable message if required variables are missing.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // OpenAI (or an OpenAI-compatible gateway such as Replit AI Integrations)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  AI_INTEGRATIONS_OPENAI_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // Comma-separated list of origins allowed to call the API cross-origin.
  // Leave empty to only allow same-origin requests.
  CORS_ORIGINS: z.string().default(""),

  // Number of reverse proxies in front of the app (for correct client IPs in rate limiting).
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@learnify.app"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  openai: {
    apiKey: env.OPENAI_API_KEY ?? env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL ?? env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
  },
  corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY,
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY?.trim(),
    privateKey: env.VAPID_PRIVATE_KEY?.trim(),
    subject: env.VAPID_SUBJECT,
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI ?? `http://localhost:${env.PORT}/api/auth/google/callback`,
  },
};
