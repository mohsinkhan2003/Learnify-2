// Google sign-up leaves the page, so an invite's class code is kept for the "finish setting up" step.
const KEY = "learnify-pending-class-code";

export function savePendingClassCode(code: string) {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export function readPendingClassCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
