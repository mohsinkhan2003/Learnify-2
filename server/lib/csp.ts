import crypto from "crypto";
import { THEME_INIT_SCRIPT } from "@shared/theme-init";

/** CSP source for the one inline script in index.html (see shared/theme-init.ts). */
export const THEME_INIT_CSP = `'sha256-${crypto.createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}'`;
