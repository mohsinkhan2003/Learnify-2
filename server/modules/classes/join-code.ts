import crypto from "crypto";

// No 0/O, 1/I/L — codes are read aloud and typed by children.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

/** 8 characters from a 31-symbol alphabet ≈ 8.5 × 10¹¹ codes; joining is rate limited. */
export function generateJoinCode(): string {
  const bytes = crypto.randomBytes(JOIN_CODE_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < JOIN_CODE_LENGTH && i < bytes.length; i++) {
    // Rejection sampling keeps the distribution uniform.
    if (bytes[i] < 248) out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out.length === JOIN_CODE_LENGTH ? out : generateJoinCode();
}

/** Accepts "k7m4-qxpb", " K7M4 QXPB " etc. Returns null if it cannot be a valid code. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
