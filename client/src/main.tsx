import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./app/App";
import "./index.css";

/**
 * Some hosts (e.g. Hugging Face Spaces) show the app inside an iframe on another site, where
 * browsers block the session cookie. Never run the app framed: offer a link to open it directly.
 */
function OpenInNewTab() {
  return (
    <main className="app-backdrop flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border bg-card p-6 text-center shadow-md">
        <h1 className="text-card-title">Learnify</h1>
        <p className="mt-2 text-helper">Learnify opens in its own tab so signing in works.</p>
        <a
          href={window.location.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Learnify
        </a>
      </div>
    </main>
  );
}

let framed = true;
try {
  framed = window.self !== window.top;
} catch {
  // Cross-origin access to window.top throws: we are framed.
}

createRoot(document.getElementById("root")!).render(framed ? <OpenInNewTab /> : <App />);
