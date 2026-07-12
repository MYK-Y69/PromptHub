import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourcePath = path.join(repoRoot, "data/v2/compiled/tags.json");
const targetDir = path.join(repoRoot, "public-app/public/data");
const targetPath = path.join(targetDir, "tags.json");

const raw = await import("node:fs/promises").then(({ readFile }) => readFile(sourcePath, "utf8"));
const json = JSON.parse(raw);

if (!Array.isArray(json.categories) || json.categories.length === 0) {
  throw new Error("Compiled tags data is missing categories.");
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isAdminGeneratedSection(section) {
  return [section?.id, section?.label].some((value) => String(value ?? "").includes("admin_added_"));
}

const categories = json.categories.map((category) => ({
  id: text(category.id),
  label: text(category.label),
  subcategories: (category.subcategories || []).map((subcategory) => ({
    id: text(subcategory.id),
    label: text(subcategory.label),
    sections: (subcategory.sections || [])
      .filter((section) => !isAdminGeneratedSection(section))
      .map((section) => ({
        id: text(section.id),
        label: text(section.label),
        tags: (section.tags || []).map((tag) => ({
          en: text(tag.en),
          jp: text(tag.jp ?? tag.desc),
          target: text(tag.target),
          target_note: text(tag.target_note),
        })).filter((tag) => tag.en),
      })).filter((section) => section.id && section.label && section.tags.length > 0),
  })).filter((subcategory) => subcategory.id && subcategory.label && subcategory.sections.length > 0),
})).filter((category) => category.id && category.label && category.subcategories.length > 0);

const data = {
  schema_version: text(json.schema_version) || "viewer-sanitized",
  generated_at: text(json.generated_at),
  count: categories.reduce((sum, category) => (
    sum + category.subcategories.reduce((subSum, subcategory) => (
      subSum + subcategory.sections.reduce((sectionSum, section) => sectionSum + section.tags.length, 0)
    ), 0)
  ), 0),
  categories,
};

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Synced sanitized viewer data to public/data/tags.json: ${data.count} tags.`);
