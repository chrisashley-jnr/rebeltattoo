import { chmodSync, createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";

function databaseBinding(filename) {
  const database = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  database.exec("PRAGMA foreign_keys = ON");

  const prepare = (sql) => {
    let values = [];
    return {
      bind(...parameters) {
        values = parameters;
        return this;
      },
      async first() { return database.prepare(sql).get(...values) ?? null; },
      async all() { return { results: database.prepare(sql).all(...values) }; },
      async run() { return database.prepare(sql).run(...values); },
    };
  };

  return {
    prepare,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() { database.close(); },
  };
}

function uploadBinding(directory) {
  const filePath = (key) => {
    const absolute = path.resolve(directory, key);
    if (!absolute.startsWith(`${directory}${path.sep}`)) throw new Error("Invalid upload path.");
    return absolute;
  };

  return {
    async put(key, body, options = {}) {
      const target = filePath(key);
      await mkdir(path.dirname(target), { recursive: true });
      const content = Buffer.from(await new Response(body).arrayBuffer());
      await writeFile(target, content, { flag: "wx", mode: 0o600 });
      await writeFile(`${target}.json`, JSON.stringify(options.httpMetadata || {}), { flag: "wx", mode: 0o600 });
    },
    async get(key) {
      const target = filePath(key);
      try {
        await stat(target);
        const metadata = JSON.parse(await readFile(`${target}.json`, "utf8"));
        return {
          body: Readable.toWeb(createReadStream(target)),
          writeHttpMetadata(headers) {
            if (metadata.contentType) headers.set("Content-Type", metadata.contentType);
          },
        };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      const target = filePath(key);
      await Promise.all([target, `${target}.json`].map((file) => unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      })));
    },
  };
}

export async function createDevBindings(root, settings = {}) {
  const directory = path.resolve(root, ".local-data");
  const uploadDirectory = path.join(directory, "uploads");
  await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  return {
    ...settings,
    DB: databaseBinding(path.join(directory, "bookings.sqlite")),
    UPLOADS: uploadBinding(uploadDirectory),
  };
}
