// Measures the round trip from this server to MongoDB. Run by deploy/push.sh:  node deploy/db-check.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = new URL("..", import.meta.url).pathname;
const uri = readFileSync(`${root}.env`, "utf8")
  .split("\n")
  .map((l) => /^MONGODB_URI=(.*)$/.exec(l.trim()))
  .find(Boolean)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");
if (!uri) {
  console.log("MONGODB_URI is missing from .env");
  process.exit(1);
}

const mongoose = createRequire(`${root}apps/api/package.json`)("mongoose");
const started = Date.now();
await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
const connectMs = Date.now() - started;
const rounds = [];
for (let i = 0; i < 5; i++) {
  const t = performance.now();
  await mongoose.connection.db.admin().ping();
  rounds.push(performance.now() - t);
}
rounds.sort((a, b) => a - b);
const ms = Math.round(rounds[2]);
console.log(`MongoDB: connected in ${connectMs} ms, round trip ${ms} ms`);
console.log(
  ms < 60
    ? "✓ fast"
    : ms < 150
      ? "~ OK"
      : "! slow — every page waits on a few database round trips. A free Atlas cluster in a region close to this server would make it much faster.",
);
await mongoose.disconnect();
