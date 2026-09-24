import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createWorker } from "./worker/index.js";
import { createDevBindings } from "./worker/dev-adapter.js";

function apiDevPlugin() {
  return {
    name: "api-dev-server",
    async configureServer(server) {
      const devVarsPath = path.resolve(process.cwd(), ".dev.vars");
      const settings = {};
      if (fs.existsSync(devVarsPath)) {
        const content = fs.readFileSync(devVarsPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            if (["ADMIN_PASSWORD", "SESSION_SECRET", "ADMIN_EMAIL", "PUBLIC_SITE_URL", "EMAIL_FROM", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "RESEND_API_KEY"].includes(key)) {
              settings[key] = trimmed.slice(eqIdx + 1).trim();
            }
          }
        }
      }

      // Keep local bookings and uploads private. Configured mail providers send real email.
      const env = await createDevBindings(process.cwd(), settings);
      const worker = createWorker();
      server.httpServer?.once("close", () => env.DB.close());

      server.middlewares.use(async (req, res, next) => {
        if (req.url && (req.url === "/api" || req.url.startsWith("/api/"))) {
          try {
            const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
            const request = new Request(url, {
              method: req.method,
              headers: req.headers,
              body: ["GET", "HEAD"].includes(req.method) ? undefined : Readable.toWeb(req),
              duplex: "half",
            });
            const response = await worker.fetch(request, env, {
              waitUntil(task) { task.catch((error) => server.config.logger.error(`Background API task failed: ${error.message}`)); },
            });
            res.statusCode = response.status;
            response.headers.forEach((value, name) => res.setHeader(name, value));
            if (response.body) {
              for await (const chunk of Readable.fromWeb(response.body)) res.write(chunk);
            }
            res.end();
            return;
          } catch (err) {
            console.error("API dev middleware error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "The local API could not complete this request." }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), apiDevPlugin()],
});
