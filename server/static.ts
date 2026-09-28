import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}. Run "npm run build" first.`);
  }

  // Vite emits content-hashed files under /assets, so they can be cached forever.
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));

  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        // The service worker and HTML must always be revalidated so updates roll out.
        if (filePath.endsWith("service-worker.js") || filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // Browsers request /favicon.ico regardless of <link rel="icon">.
  app.get("/favicon.ico", (_req, res) => res.sendFile(path.resolve(distPath, "icon-192.png")));

  // SPA fallback
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
