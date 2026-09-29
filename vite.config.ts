import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { THEME_INIT_SCRIPT } from "./shared/theme-init";

// Replit-specific dev tooling is only loaded when running inside a Repl.
const replitPlugins =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
    ? [
        await import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
        await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer()),
        await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
      ]
    : [];

export default defineConfig({
  plugins: [
    react(),
    {
      // Inline the tiny theme script so it doesn't cost a render-blocking request.
      name: "learnify-inline-theme-init",
      transformIndexHtml: (html) => html.replace('<script src="/theme-init.js"></script>', `<script>${THEME_INIT_SCRIPT}</script>`),
    },
    {
      // Preload the Latin UI font so text renders in its final face sooner (it's always needed).
      name: "learnify-preload-font",
      apply: "build",
      transformIndexHtml(html, ctx) {
        const font = Object.keys(ctx.bundle ?? {}).find((f) => /inter-latin-wght-normal-.*\.woff2$/.test(f));
        return font
          ? html.replace("</head>", `  <link rel="preload" href="/${font}" as="font" type="font/woff2" crossorigin />\n  </head>`)
          : html;
      },
    },
    ...replitPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
