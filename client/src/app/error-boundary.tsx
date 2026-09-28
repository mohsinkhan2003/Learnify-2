import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Last-resort boundary: never leave the user on a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook for an optional error reporter (e.g. Sentry) — kept dependency-free by default.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(this.state.error.message);
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div role="alert" className="max-w-md rounded-lg border bg-card p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
            <AlertTriangle className="size-6" aria-hidden />
          </div>
          <h1 className="text-section-title">{chunkError ? "Learnify has been updated" : "Something went wrong"}</h1>
          <p className="mt-2 text-body text-muted-foreground">
            {chunkError
              ? "Please reload to get the latest version."
              : "Sorry about that. Reloading usually fixes it — your work is saved on our servers."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
