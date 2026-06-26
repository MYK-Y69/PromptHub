import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = readFileSync(join(root, "src/App.jsx"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");
const viteConfig = readFileSync(join(root, "vite.config.mjs"), "utf8");
const distHtml = existsSync(join(root, "dist/index.html")) ? readFileSync(join(root, "dist/index.html"), "utf8") : "";
const distDataPath = join(root, "dist/data/tags.json");
const distAssetsPath = join(root, "dist/assets");

const requiredSourceStrings = [
  "Explore",
  "Builder Workshop",
  "Collections",
  "Guide Blocks",
  "旧データ検出済み",
  "Import legacy data",
  "prompthub_user_tags",
  "prompthub_select_builder_blocks",
  "prompthub:v1:userTags",
  "prompthub:v1:customBlocks",
  "prompthub:v1:guideBlocks",
  "prompthub:v1:pinnedGuideBlocks",
  "prompthub:v1:recentGuideBlocks",
  "prompthub:v1:guideBlockUsage",
  "prompthub:v1:draftRecipeName",
  "prompthub:v1:hiddenTags",
  "表示言語",
  "詳細ペイン",
  "Always open",
  "ローカル非表示タグ",
  "Show more",
  "exportGuideBlock",
  "editGuideBlock",
  "buildDictionaryGuideBlocks",
  "PromptHub本体の全セクション",
  "Show more blocks",
  "検索例",
  "data/tags.json",
  "GUIDE_BLOCK_ADD_LIMIT",
  "normalizeImportedRecipes",
  "normalizeImportedGuideBlocks",
  "normalizeImportedUserTags",
  "normalizeImportedRecentPrompts",
  "readNormalizedJson",
  "removeJson",
  "selectedCollectionSection",
  "selectedRecipeId",
  "inline-edit-form",
  "GuideBlockCard",
  "GuideBlockShortcutSection",
  "RecommendedGuideBlocks",
  "BuilderMobileActionBar",
  "ActionMenu",
  "recordGuideBlockUse",
  "toggleGuideBlockPin",
  "visibleGuideBlock",
  "Recommended Blocks",
  "今のDraftをGuide Block化",
  "mobile-builder-actions",
  "action-menu",
  "danger-zone",
  "Recently used",
  "My Blocks",
  "Recipe name before save",
  "Copy Both",
  "guide-purpose",
  "guide-shortcuts",
  "aria-selected",
  "[tagIndex, tag]",
  "scrollIntoView",
  "activeSubcategory",
  "explore-sidebar",
  "explore-content",
  "explore-inspector",
  "[sectionIndex, section]",
  "data-label=\"操作\"",
  "if (addUserTag(tagForm))",
];

const missing = requiredSourceStrings.filter((needle) => !src.includes(needle));
if (missing.length > 0) {
  console.error(`Missing source markers: ${missing.join(", ")}`);
  process.exit(1);
}

if (!viteConfig.includes('base: "./"')) {
  console.error('Vite base must be "./" so the public app works from subpath hosting.');
  process.exit(1);
}

if (src.includes("../data/v2/compiled/tags.json")) {
  console.error("Runtime data loading must not depend on repository-relative legacy compiled paths.");
  process.exit(1);
}

if (src.includes("window.prompt(") || src.includes("navigator.clipboard?.writeText(record.en)")) {
  console.error("Public UI still contains brittle prompt dialogs or bypassed copy handling.");
  process.exit(1);
}

if (!src.includes("visibleRecipes.map((recipe)") || src.includes("recipes.map((recipe)")) {
  console.error("Collections recipe table must use visibleRecipes so Sensitive OFF hides recipe names.");
  process.exit(1);
}

if (!src.includes('readNormalizedJson("prompthub:v1:draft"') || !src.includes("for (const key of LOCAL_KEYS) removeJson(key)")) {
  console.error("LocalStorage read/reset paths must be schema-normalized and exception-safe.");
  process.exit(1);
}

if (!src.includes("recordGuideBlockUse(block)") || !src.includes("setRecentGuideBlockIds") || !src.includes("setGuideBlockUsage")) {
  console.error("Guide Blocks must update recent usage and usage counts when applied.");
  process.exit(1);
}

if (!src.includes("pinnedGuideBlockIds.map((id) => guideBlocksById.get(id))") || !src.includes("recentGuideBlockIds")) {
  console.error("Builder must surface pinned and recently used Guide Block shortcuts.");
  process.exit(1);
}

if (!src.includes(".filter(visibleGuideBlock).slice(0, GUIDE_BLOCK_SHORTCUT_LIMIT)") || !src.includes("visibleGuideBlock(block) && (block.userCreated || block.category === \"custom\")")) {
  console.error("Guide Block shortcuts must respect Sensitive OFF filtering.");
  process.exit(1);
}

if (!src.includes("const name = draftRecipeName.trim()") || !src.includes("setDraftRecipeName(\"\")")) {
  console.error("Saved recipes must use the visible recipe name field and clear it after save.");
  process.exit(1);
}

if (!src.includes("copyRecipe(recipe, \"both\")") || !src.includes("copyRecipe(recipe, \"positive\")")) {
  console.error("Collections recipes must expose quick copy actions for reuse.");
  process.exit(1);
}

if (!src.includes("RecommendedGuideBlocks") || !src.includes("draftMatched") || !src.includes("fallbackBlocks")) {
  console.error("Guide Blocks must surface useful recommended blocks before empty shortcut buckets.");
  process.exit(1);
}

if (!src.includes("BuilderMobileActionBar") || !src.includes("Copy +") || !src.includes("Copy both")) {
  console.error("Builder mobile must expose sticky copy/save actions.");
  process.exit(1);
}

if (!src.includes("<ActionMenu>") || !src.includes("row-actions-prioritized")) {
  console.error("Dense row actions must be reduced with prioritized actions and More menus.");
  process.exit(1);
}

if (src.includes("selectedSubcategory && selectedRecord ?")) {
  console.error("Explore heading must use the selected subcategory, not fallback selectedRecord.");
  process.exit(1);
}

if (!styles.includes("@media (min-width: 981px)") || !styles.includes("height: calc(100vh - 62px)") || !styles.includes(".explore-sidebar") || !styles.includes("overscroll-behavior: contain")) {
  console.error("Explore desktop must use split panes with independently scrollable category/content/inspector areas.");
  process.exit(1);
}

if (src.includes("addUserTag(tagForm);\n                setTagForm")) {
  console.error("User tag form must clear only after addUserTag succeeds.");
  process.exit(1);
}

if (!existsSync(distDataPath)) {
  console.error("Missing dist/data/tags.json. Run npm run build first.");
  process.exit(1);
}

if (!distHtml.includes("./assets/")) {
  console.error("Built HTML does not use relative subpath-safe assets.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(distDataPath, "utf8"));
if (!Array.isArray(data.categories) || data.categories.length === 0) {
  console.error("dist/data/tags.json does not include categories.");
  process.exit(1);
}

const sectionCount = data.categories.reduce((sum, category) => {
  const subcategories = category.subcategories || [{ sections: category.sections || [] }];
  return sum + subcategories.reduce((inner, subcategory) => inner + (subcategory.sections || []).filter((section) => (section.tags || []).length > 0).length, 0);
}, 0);

if (sectionCount < 100) {
  console.error(`Expected full PromptHub section data, got only ${sectionCount} sections.`);
  process.exit(1);
}

const guideBlockIds = [];
for (const category of data.categories) {
  const subcategories = category.subcategories || [{ id: `${category.id}_all`, sections: category.sections || [] }];
  for (const subcategory of subcategories) {
    for (const [sectionIndex, section] of (subcategory.sections || []).entries()) {
      if ((section.tags || []).length > 0) {
        guideBlockIds.push(`dict_${[category.id, subcategory.id, section.id, sectionIndex].join("/")}`);
      }
    }
  }
}

if (new Set(guideBlockIds).size !== guideBlockIds.length) {
  console.error("Dictionary Guide Block source paths must be unique after sectionIndex disambiguation.");
  process.exit(1);
}

const initialExploreCount = data.categories.reduce((sum, category) => {
  if (category.id === "sensitive") return sum;
  const subcategories = category.subcategories || [{ sections: category.sections || [] }];
  return sum + subcategories.reduce((inner, subcategory) => {
    return inner + (subcategory.sections || []).reduce((sectionSum, section) => sectionSum + (section.tags || []).length, 0);
  }, 0);
}, 0);

if (initialExploreCount < 1000) {
  console.error(`Initial Explore would be too sparse: ${initialExploreCount} non-sensitive tags.`);
  process.exit(1);
}

const maxSectionTagCount = data.categories.reduce((max, category) => {
  const subcategories = category.subcategories || [{ sections: category.sections || [] }];
  return Math.max(max, ...subcategories.flatMap((subcategory) => (subcategory.sections || []).map((section) => (section.tags || []).length)));
}, 0);

if (maxSectionTagCount > 40 && !src.includes("GUIDE_BLOCK_ADD_LIMIT = 40")) {
  console.error(`Large guide blocks exist (${maxSectionTagCount} tags), but one-click add limit is missing.`);
  process.exit(1);
}

const assetText = readdirSync(distAssetsPath)
  .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
  .map((file) => readFileSync(join(distAssetsPath, file), "utf8"))
  .join("\n");

if (!assetText.includes("data/tags.json")) {
  console.error("Built JavaScript does not request the public data/tags.json asset.");
  process.exit(1);
}

for (const marker of ["Builder Workshop", "Import legacy data", "旧データ検出済み", "ローカル非表示タグ", "English first", "Always open", "PromptHub本体の全セクション"]) {
  if (!assetText.includes(marker)) {
    console.error(`Missing production asset marker: ${marker}`);
    process.exit(1);
  }
}

console.log(`PromptHub public app check passed: ${data.count || "unknown"} tags, ${data.categories.length} categories, ${sectionCount} sections, ${initialExploreCount} initial Explore tags.`);
