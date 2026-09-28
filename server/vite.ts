import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";

// Development only. `vite` is a devDependency, so it is imported lazily and this
// module must never be loaded in production.
export async function setupVite(app: Express, server: Server) {
  const { createServer, createLogger } = await import("vite");
  const viteLogger = createLogger();
  const root = path.resolve(import.meta.dirname, "..");

  const vite = await createServer({
    configFile: path.resolve(root, "vite.config.ts"),
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const templatePath = path.resolve(root, "client", "index.html");
      // Always reload index.html from disk in case it changes.
      let template = await fs.promises.readFile(templatePath, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${Date.now()}"`);
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
