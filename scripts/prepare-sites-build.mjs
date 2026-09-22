#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker");
const hosting = path.join(root, ".openai", "hosting.json");
const migrations = path.join(root, ".openai", "drizzle");

for (const file of [index, path.join(worker, "index.js"), hosting, migrations]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
cpSync(worker, path.join(dist, "server"), { recursive: true });
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));
cpSync(migrations, path.join(dist, ".openai", "drizzle"), { recursive: true });

console.log("Prepared Sites build: server modules, hosting config, and database migration");
