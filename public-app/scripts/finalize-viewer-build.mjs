import { rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist-viewer");

await rename(path.join(distDir, "viewer.html"), path.join(distDir, "index.html"));

console.log("Finalized viewer build entry as index.html.");
