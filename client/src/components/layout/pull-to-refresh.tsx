import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isStandalone } from "@/features/pwa/install";
import { queryClient } from "@/lib/query";
import { cn } from "@/lib/utils";

const TRIGGER = 64;
const MAX = 96;

/**
 * Pull down at the top of the page to refresh the data on screen. Only in the installed app:
 * browsers already have their own pull-to-refresh, and two would fight.
 */
export function PullToRefresh() {
  const [enabled] = useState(() => typeof window !== "undefined" && "ontouchstart" in window && isStandalone());
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let startY: number | null = null;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const d = e.touches[0].clientY - startY;
      set(d > 0 ? Math.min(d * 0.5, MAX) : 0);
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      if (pullRef.current < TRIGGER) return set(0);
      set(TRIGGER);
      setRefreshing(true);
      navigator.vibrate?.(10);
      try {
        await queryClient.refetchQueries({ type: "active" });
      } finally {
        setRefreshing(false);
        set(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-10 flex justify-center"
      style={{ transform: `translateY(${pull - 40}px)`, opacity: pull / TRIGGER }}
      aria-hidden={!refreshing}
    >
      <span className="glass flex h-9 w-9 items-center justify-center rounded-full shadow-md">
        <RefreshCw
          className={cn("size-4 text-primary", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </span>
      <span className="sr-only" role="status">
        {refreshing ? "Refreshing" : ""}
      </span>
    </div>
  );
}
