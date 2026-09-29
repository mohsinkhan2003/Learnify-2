import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/common/logo";
import { cn } from "@/lib/utils";
import { useInstall } from "./install";

const DISMISS_KEY = "learnify-install-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Add Learnify to your home screen". Android/desktop Chrome get a one-tap install; iPhone
 * Safari gets the two Share-menu steps. Hidden once installed or dismissed.
 * `variant="row"` is the always-available version for the profile page (not dismissible).
 */
export function InstallCard({ variant = "card", className }: { variant?: "card" | "row"; className?: string }) {
  const install = useInstall();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);

  if (install.kind === "none") {
    return variant === "row" ? (
      <p className={cn("rounded-lg border bg-card p-4 text-helper", className)}>
        To install Learnify as an app, open it in Chrome (Android, computer) or Safari (iPhone).
      </p>
    ) : null;
  }
  if (install.kind === "installed") {
    return variant === "row" ? (
      <p className={cn("rounded-lg border bg-card p-4 text-helper", className)}>Learnify is installed on this device.</p>
    ) : null;
  }
  if (variant === "card" && dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      aria-labelledby="install-title"
      className={cn(variant === "card" ? "glass-card relative rounded-xl p-4 sm:p-5" : "rounded-lg border bg-card p-4", className)}
    >
      {variant === "card" && (
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-md p-2 text-muted-foreground hover:bg-muted"
          aria-label="Dismiss install suggestion"
        >
          <X className="size-4" />
        </button>
      )}
      <div className="flex items-start gap-3 pr-6">
        <span className="shrink-0" aria-hidden>
          <LogoMark className="h-10 w-10" />
        </span>
        <div className="min-w-0">
          <h2 id="install-title" className="text-card-title">
            Add Learnify to your home screen
          </h2>
          <p className="text-helper">Opens full screen like an app, and homework alerts work on iPhone too.</p>
        </div>
      </div>
      {install.kind === "prompt" ? (
        <Button
          className="mt-3 w-full sm:w-auto"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await install.install();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download aria-hidden /> Install app
        </Button>
      ) : (
        <ol className="mt-3 grid gap-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Share className="size-4" aria-hidden />
            </span>
            Tap <strong>Share</strong> in Safari's toolbar
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary">
              <SquarePlus className="size-4" aria-hidden />
            </span>
            Choose <strong>Add to Home Screen</strong>
          </li>
        </ol>
      )}
    </section>
  );
}
