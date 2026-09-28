import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm font-medium text-warning", className)}>
      <WifiOff className="size-4" aria-hidden />
      You're offline. We'll reconnect automatically — nothing you've done is lost.
    </div>
  );
}
