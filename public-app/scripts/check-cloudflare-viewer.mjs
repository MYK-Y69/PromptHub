import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distDir = join(root, "dist-viewer");

const forbiddenEverywhereText = [
  "127.0.0.1",
  "localhost",
  "ローカル環境",
  "/api/admin",
  "/api/generate",
  "/uploads",
  "/generated",
  "/converted",
  "/extracted",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "/Users/nil-origin",
  "PromptHub Admin",
  "AdminApp",
  "admin-apply",
  "adminMain",
  "apply_admin_prompt_batch",
  "Local apply server",
  "prompthub_admin_batch_v1",
  "prompthub_admin_intake_rows",
  "data/v2/admin",
  "imports/inbox",
  "data/inbox",
  "admin_added_",
];

const forbiddenDataText = [
  "source_url",
  "source_site",
  "imported_at",
  "csv_url",
  "sheets_config",
];

const forbiddenUiText = [
  "localStorage",
  "FileReader",
  "Import JSON",
  "Export JSON",
  "Add tag",
  "Edit tag",
  "Delete tag",
  "Rename",
  "Reset local data",
  "Builder",
  "Collections",
  "Settings",
  "Guide Blocks",
  "Recipe",
  "Admin",
  "prompthub:v1",
];

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".map",
  ".svg",
  ".txt",
  "",
]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    return stat.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail("dist-viewer is missing. Run npm run build:viewer first.");
}

const files = walk(distDir);
const relFiles = files.map((file) => relative(distDir, file));

for (const required of ["index.html", "data/tags.json"]) {
  if (!relFiles.includes(required)) {
    fail(`Viewer build is missing ${required}.`);
  }
}

for (const forbiddenFile of ["admin.html"]) {
  if (relFiles.includes(forbiddenFile)) {
    fail(`Viewer build must not publish ${forbiddenFile}.`);
  }
}

const sourceMaps = relFiles.filter((file) => file.endsWith(".map"));
if (sourceMaps.length > 0) {
  fail(`Viewer build must not publish source maps: ${sourceMaps.join(", ")}`);
}

const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
if (!indexHtml.includes("./assets/")) {
  fail("Viewer index.html must use relative asset paths.");
}

const data = JSON.parse(readFileSync(join(distDir, "data/tags.json"), "utf8"));
if (!Array.isArray(data.categories) || data.categories.length === 0) {
  fail("Viewer data/tags.json does not include categories.");
}

const allowedTopKeys = new Set(["schema_version", "generated_at", "count", "categories"]);
const allowedCategoryKeys = new Set(["id", "label", "subcategories"]);
const allowedSubcategoryKeys = new Set(["id", "label", "sections"]);
const allowedSectionKeys = new Set(["id", "label", "tags"]);
const allowedTagKeys = new Set(["en", "jp", "target", "target_note"]);

function assertAllowedKeys(object, allowed, path) {
  for (const key of Object.keys(object || {})) {
    if (!allowed.has(key)) {
      fail(`Viewer data contains disallowed key ${path}.${key}.`);
    }
  }
}

assertAllowedKeys(data, allowedTopKeys, "data");
for (const category of data.categories) {
  assertAllowedKeys(category, allowedCategoryKeys, `category:${category.id}`);
  for (const subcategory of category.subcategories || []) {
    assertAllowedKeys(subcategory, allowedSubcategoryKeys, `subcategory:${subcategory.id}`);
    for (const section of subcategory.sections || []) {
      assertAllowedKeys(section, allowedSectionKeys, `section:${section.id}`);
      for (const tag of section.tags || []) {
        assertAllowedKeys(tag, allowedTagKeys, `tag:${tag.en}`);
      }
    }
  }
}

for (const file of files) {
  const rel = relative(distDir, file);
  const text = readFileSync(file, "utf8");
  const hit = forbiddenEverywhereText.find((needle) => text.includes(needle));
  if (hit) {
    fail(`Viewer build contains forbidden text "${hit}" in ${rel}.`);
  }

  if (rel === "data/tags.json") {
    const dataHit = forbiddenDataText.find((needle) => text.includes(needle));
    if (dataHit) {
      fail(`Viewer data contains forbidden text "${dataHit}" in ${rel}.`);
    }
    continue;
  }

  if (!textExtensions.has(extname(file))) continue;
  const uiHit = forbiddenUiText.find((needle) => text.includes(needle));
  if (uiHit) {
    fail(`Viewer UI asset contains forbidden text "${uiHit}" in ${rel}.`);
  }
}

console.log(`Cloudflare viewer build check passed: ${relFiles.length} files, ${data.categories.length} categories.`);
