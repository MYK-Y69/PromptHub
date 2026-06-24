import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourcePath = path.join(repoRoot, "data/v2/compiled/tags.json");
const targetDir = path.join(repoRoot, "public-app/public/data");
const targetPath = path.join(targetDir, "tags.json");

const raw = await readFile(sourcePath, "utf8");
const json = JSON.parse(raw);

if (!Array.isArray(json.categories) || json.categories.length === 0) {
  throw new Error("Compiled tags data is missing categories.");
}

await mkdir(targetDir, { recursive: true });
await copyFile(sourcePath, targetPath);

console.log(`Synced ${json.count ?? "unknown"} tags to public/data/tags.json`);
