import crypto from "crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { config } from "../config/env";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar: string | null;
}

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!config.google) throw new Error("Google sign-in is not configured");
  client ??= new OAuth2Client(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
  return client;
}

export function isGoogleEnabled(): boolean {
  return !!config.google;
}

/** Builds the consent URL. `state` and the PKCE verifier are bound to the browser via a signed cookie. */
export async function createAuthRequest(): Promise<{ url: string; state: string; verifier: string }> {
  const oauth = getClient();
  const state = crypto.randomBytes(24).toString("base64url");
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
  const url = oauth.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, state, verifier: codeVerifier };
}

/** Exchanges the authorization code and returns a verified Google profile. */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
  const oauth = getClient();
  const { tokens } = await oauth.getToken({ code, codeVerifier: verifier });
  if (!tokens.id_token) throw new Error("Google did not return an ID token");

  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.google!.clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture ?? null,
  };
}
