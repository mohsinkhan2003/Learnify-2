// Local stand-in for Vercel's router, for testing .vercel/output (used by the E2E suite).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../.vercel/output");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const { default: handler } = await import(path.join(root, "functions/api.func/index.mjs"));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x").pathname;
    let dest = null;
    let filesystemDone = false;
    for (const route of config.routes) {
      if (route.handle === "filesystem") {
        const file = path.join(root, "static", decodeURIComponent(url));
        if (url !== "/" && file.startsWith(path.join(root, "static")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          dest = url;
          break;
        }
        filesystemDone = true;
        continue;
      }
      if (!new RegExp(route.src).test(url)) continue;
      for (const [k, v] of Object.entries(route.headers ?? {})) res.setHeader(k, v);
      if (route.continue) continue;
      dest = route.dest;
      break;
    }
    void filesystemDone;
    if (dest === "/api") {
      for (const k of res.getHeaderNames()) res.removeHeader(k);
      return handler(req, res);
    }
    const file = path.join(root, "static", dest ?? "/index.html");
    res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(process.env.PORT ?? 3000), () => console.log("serving .vercel/output"));
