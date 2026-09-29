import { useEffect, useState } from "react";

/** Chrome's install event (not in the TS DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHANGED = "learnify:install-changed";
let deferred: BeforeInstallPromptEvent | null = null;

/**
 * Must run at startup: browsers fire `beforeinstallprompt` once, early, and the screens that
 * offer "Install" load later. We keep the event so the app can show its own install button.
 */
export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(CHANGED));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.dispatchEvent(new Event(CHANGED));
  });
}

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** iPhone/iPad Safari: no install prompt, but "Share → Add to Home Screen" works. */
const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
};

export type InstallState = { kind: "installed" } | { kind: "prompt"; install: () => Promise<boolean> } | { kind: "ios" } | { kind: "none" };

export function useInstall(): InstallState {
  const [, force] = useState(0);
  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, []);
  if (isStandalone()) return { kind: "installed" };
  if (deferred) {
    const event = deferred;
    return {
      kind: "prompt",
      install: async () => {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === "accepted") {
          deferred = null;
          window.dispatchEvent(new Event(CHANGED));
        }
        return outcome === "accepted";
      },
    };
  }
  return isIosSafari() ? { kind: "ios" } : { kind: "none" };
}
