import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { queryKeys } from "@/lib/query";

export type PushState =
  | "loading"
  | "unsupported" // browser has no Push API (e.g. iOS Safari outside an installed app)
  | "unavailable" // server has push disabled
  | "denied" // user blocked notifications in browser settings
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * Web push subscription management. Permission is only ever requested from a user gesture
 * (the "Turn on notifications" button) — never on page load.
 */
export function usePush() {
  const key = useQuery({
    queryKey: queryKeys.pushKey,
    queryFn: () => apiGet<{ publicKey: string | null }>("/api/push/public-key"),
    staleTime: Infinity,
    enabled: supported(),
  });
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported()) return setState("unsupported");
    if (key.isLoading) return;
    if (!key.data?.publicKey) return setState("unavailable");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, [key.isLoading, key.data]);

  useEffect(() => {
    refresh().catch(() => setState("off"));
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!key.data?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.data.publicKey) }));
      await apiPost("/api/push/subscriptions", sub.toJSON());
      setState("on");
    } finally {
      setBusy(false);
    }
  }, [key.data]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await apiDelete("/api/push/subscriptions", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}
