import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function apiDevPlugin() {
  return {
    name: "api-dev-server",
    configureServer(server) {
      // Load .dev.vars if present
      const devVarsPath = path.resolve(process.cwd(), ".dev.vars");
      if (fs.existsSync(devVarsPath)) {
        const content = fs.readFileSync(devVarsPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }

      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/bookings") && req.method === "POST") {
          try {
            const { default: handler } = await import("./api/bookings.js");
            // Add res helper methods if missing
            if (!res.status) {
              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
            }
            if (!res.json) {
              res.json = (data) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(data));
                return res;
              };
            }
            return await handler(req, res);
          } catch (err) {
            console.error("API dev middleware error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Internal server error" }));
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
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), apiDevPlugin()],
});

