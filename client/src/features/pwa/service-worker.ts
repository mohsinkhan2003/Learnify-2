import { useEffect, useState } from "react";

/**
 * Registers the service worker and reports when a new version is waiting, so the app can
 * offer a one-click update instead of leaving users on a stale build.
 */
// Set only when the user accepts an update; the first install also fires controllerchange
// (clients.claim) and must not reload the page mid-request.
let updateRequested = false;

export function useServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!updateRequested) return;
      updateRequested = false;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
        // Check for updates when the app regains focus (long-lived installed PWAs).
        const check = () => document.visibilityState === "visible" && reg.update().catch(() => {});
        document.addEventListener("visibilitychange", check);
      })
      .catch(() => {
        // The app works without a service worker (no offline shell / push).
      });
  }, []);

  return {
    updateReady: !!waiting,
    applyUpdate: () => {
      updateRequested = true;
      waiting?.postMessage({ type: "SKIP_WAITING" });
    },
  };
}
