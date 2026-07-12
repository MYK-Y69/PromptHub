import { useEffect, useMemo, useRef, useState } from "react";

function assetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path}`.replace(/^\/\//, "/");
}

const DATA_URLS = [
  assetUrl("data/tags.json"),
];

const GUIDE_BLOCK_ADD_LIMIT = 40;

const SAMPLE_DATA = {
  schema_version: "sample",
  generated_at: "2026-06-24T00:00:00Z",
  categories: [
    {
      id: "camera",
      label: "カメラ・構図",
      subcategories: [
        {
          id: "gaze",
          label: "視線",
          sections: [
            {
              id: "gaze_direction",
              label: "視線の方向",
              tags: [
                { en: "looking at viewer", jp: "カメラを見つめる、視線をこちらに向けている状態", target: null, target_note: null },
                { en: "looking at camera", jp: "カメラを見る", target: null, target_note: null },
                { en: "direct gaze", jp: "まっすぐ向けられた視線", target: null, target_note: null },
              ],
            },
          ],
        },
        {
          id: "framing",
          label: "フレーミング",
          sections: [
            {
              id: "body_framing",
              label: "身体の写り方",
              tags: [
                { en: "full body", jp: "全身が画面内に収まっている構図", target: null, target_note: null },
                { en: "upper body", jp: "上半身を中心にした構図", target: null, target_note: null },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "expression",
      label: "表情・顔",
      subcategories: [
        {
          id: "smile",
          label: "笑顔",
          sections: [
            {
              id: "soft_smile",
              label: "やわらかい笑顔",
              tags: [
                { en: "gentle smile", jp: "やさしく自然な微笑み", target: null, target_note: null },
                { en: "soft smile", jp: "柔らかい笑顔", target: null, target_note: null },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "meta",
      label: "メタ・品質",
      subcategories: [
        {
          id: "lighting",
          label: "照明",
          sections: [
            {
              id: "light_quality",
              label: "光の質",
              tags: [
                { en: "soft lighting", jp: "柔らかく拡散した光で照らすライティング", target: null, target_note: null },
                { en: "natural light", jp: "自然光、太陽光による光", target: null, target_note: null },
                { en: "rim light", jp: "輪郭を照らす逆光気味の光", target: null, target_note: null },
              ],
            },
          ],
        },
        {
          id: "quality",
          label: "品質",
          sections: [
            {
              id: "quality_tags",
              label: "品質タグ",
              tags: [
                { en: "high detail", jp: "高密度なディテール", target: null, target_note: null },
                { en: "masterpiece", jp: "高品質な作品を意図するタグ", target: null, target_note: null },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sensitive",
      label: "センシティブ",
      subcategories: [
        {
          id: "hidden_sample",
          label: "非表示サンプル",
          sections: [
            {
              id: "hidden",
              label: "初期非表示",
              tags: [{ en: "sensitive sample", jp: "センシティブ表示ON時のみ検索対象", target: null, target_note: null }],
            },
          ],
        },
      ],
    },
  ],
};

const DEFAULT_NEGATIVE = [
  "low quality",
  "bad hands",
  "watermark",
  "extra fingers",
  "blurry",
];

const STARTER_DRAFT = {
  positive: [
    makeDraftItem("1girl", "一人の女性", "subject", "custom"),
    makeDraftItem("looking at viewer", "カメラ目線", "expression", "dictionary"),
    makeDraftItem("gentle smile", "やさしい笑顔", "expression", "dictionary"),
    makeDraftItem("full body", "全身", "composition", "dictionary"),
    makeDraftItem("soft lighting", "柔らかい光", "style_quality", "dictionary"),
    makeDraftItem("natural light", "自然光", "style_quality", "dictionary"),
    makeDraftItem("35mm lens", "35mmレンズ", "composition", "custom"),
    makeDraftItem("high detail", "高密度なディテール", "style_quality", "dictionary"),
  ],
  negative: DEFAULT_NEGATIVE.map((tag) => makeDraftItem(tag, tag, "negative", "custom")),
};

const CORE_GUIDE_BLOCKS = [
  {
    id: "negative_base",
    label: "基本Negative",
    category: "negative",
    uses: 56,
    positive: [],
    negative: DEFAULT_NEGATIVE,
  },
];

const LOCAL_KEYS = [
  "prompthub:v1:draft",
  "prompthub:v1:favorites",
  "prompthub:v1:recipes",
  "prompthub:v1:recentPrompts",
  "prompthub:v1:preferences",
  "prompthub:v1:customBlocks",
  "prompthub:v1:guideBlocks",
  "prompthub:v1:pinnedGuideBlocks",
  "prompthub:v1:recentGuideBlocks",
  "prompthub:v1:guideBlockUsage",
  "prompthub:v1:draftRecipeName",
  "prompthub:v1:userTags",
  "prompthub:v1:hiddenTags",
];

const SYNC_SETTINGS_KEY = "prompthub:v1:syncSettings";
const SYNC_DEFAULT_ENDPOINT = "https://prompthub-viewer.pages.dev/api/sync";
const SYNC_DEBOUNCE_MS = 1500;
const SYNC_POLL_MS = 60000;

const GUIDE_BLOCK_SHORTCUT_LIMIT = 6;
const RECENT_GUIDE_BLOCK_LIMIT = 12;

const LEGACY_KEYS = [
  "prompthub_deleted",
  "prompthub_user_tags",
  "prompthub_select_builder_usage",
  "prompthub_select_builder_blocks",
];

function makeDraftItem(en, jp = "", role = "custom", source = "dictionary", categoryPath = []) {
  return {
    id: `${source}:${en}`.toLowerCase().replace(/\s+/g, "_"),
    en,
    jp: jp || en,
    role,
    source,
    categoryPath,
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(searchable, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  const compactSearchable = searchable.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (searchable.includes(normalizedQuery) || compactSearchable.includes(compactQuery)) {
    return true;
  }

  const terms = normalizedQuery.split(/[\s,、;；]+/).filter(Boolean);
  return terms.length > 1 && terms.some((term) => {
    const compactTerm = term.replace(/\s+/g, "");
    return searchable.includes(term) || compactSearchable.includes(compactTerm);
  });
}

function uniqByEn(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeText(item.en);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleFromCategory(categoryId, subcategoryId) {
  if (categoryId === "camera") return "composition";
  if (categoryId === "expression") return "expression";
  if (categoryId === "pose" || categoryId === "action") return "pose_action";
  if (categoryId === "clothing") return "clothing";
  if (categoryId === "accessories") return "accessory";
  if (categoryId === "meta" && subcategoryId === "lighting") return "style_quality";
  if (categoryId === "meta") return "style_quality";
  return "custom";
}

function flattenData(data) {
  const records = [];
  const major = [];

  for (const category of data.categories || []) {
    const subcategories = category.subcategories || [{ id: `${category.id}_all`, label: category.label, sections: category.sections || [] }];
    const majorEntry = {
      id: category.id,
      label: category.label,
      count: 0,
      subcategories: [],
    };

    for (const subcategory of subcategories) {
      const subEntry = {
        id: subcategory.id,
        label: subcategory.label,
        count: 0,
        categoryId: category.id,
      };

      for (const section of subcategory.sections || []) {
        for (const [tagIndex, tag] of (section.tags || []).entries()) {
          const record = {
            id: `${category.id}/${subcategory.id}/${section.id}/${tagIndex}/${tag.en}`,
            en: tag.en,
            jp: tag.jp || tag.desc || "",
            target: tag.target || null,
            targetNote: tag.target_note || null,
            categoryId: category.id,
            categoryLabel: category.label,
            subcategoryId: subcategory.id,
            subcategoryLabel: subcategory.label,
            sectionId: section.id,
            sectionLabel: section.label,
            role: roleFromCategory(category.id, subcategory.id),
            sourceSite: category.source_site || "PromptHub",
            sourceUrl: category.source_url || "",
            searchable: normalizeText([tag.en, tag.jp, tag.desc, category.label, subcategory.label, section.label, tag.target, tag.target_note].join(" ")),
          };
          records.push(record);
          majorEntry.count += 1;
          subEntry.count += 1;
        }
      }
      majorEntry.subcategories.push(subEntry);
    }
    major.push(majorEntry);
  }

  return { records, major };
}

function blockIdFromPath(...parts) {
  return parts
    .map((part) => normalizeText(part).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("_");
}

function buildDictionaryGuideBlocks(data) {
  const blocks = [];
  for (const category of data.categories || []) {
    const subcategories = category.subcategories || [{ id: `${category.id}_all`, label: category.label, sections: category.sections || [] }];
    for (const subcategory of subcategories) {
      for (const [sectionIndex, section] of (subcategory.sections || []).entries()) {
        const tags = (section.tags || [])
          .map((tag) => tag.en)
          .filter(Boolean);
        if (tags.length === 0) continue;
        blocks.push({
          id: `dict_${blockIdFromPath(category.id, subcategory.id, section.id, sectionIndex)}`,
          category: category.id,
          categoryLabel: category.label,
          label: `${subcategory.label} / ${section.label}`,
          positive: tags,
          negative: [],
          uses: 0,
          favorite: false,
          usageCount: 0,
          userCreated: false,
          dictionaryGenerated: true,
          sourceCategoryId: category.id,
          sourcePath: [category.label, subcategory.label, section.label],
          tagCount: tags.length,
          searchable: normalizeText([category.label, subcategory.label, section.label, ...tags].join(" ")),
        });
      }
    }
  }
  return blocks;
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readNormalizedJson(key, fallback, normalize) {
  const value = readJson(key, fallback);
  const normalized = normalize(value);
  return normalized ?? fallback;
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeJson(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isLocalAppOrigin() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

function defaultSyncEndpoint() {
  return isLocalAppOrigin() ? SYNC_DEFAULT_ENDPOINT : `${window.location.origin}/api/sync`;
}

function normalizeSyncSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : false,
    endpoint: String(input.endpoint || defaultSyncEndpoint()).trim(),
    username: String(input.username || "viewer").trim(),
    password: "",
  };
}

function persistableSyncSettings(settings) {
  return {
    enabled: !!settings.enabled,
    endpoint: String(settings.endpoint || defaultSyncEndpoint()).trim(),
    username: String(settings.username || "viewer").trim(),
  };
}

function encodeBasicAuth(username, password) {
  try {
    return `Basic ${btoa(`${username}:${password}`)}`;
  } catch {
    return "";
  }
}

function readCustomBlocks() {
  return readNormalizedJson("prompthub:v1:customBlocks", null, normalizeImportedGuideBlocks)
    ?? readNormalizedJson("prompthub:v1:guideBlocks", [], normalizeImportedGuideBlocks);
}

function listLegacyKeys() {
  try {
    return LEGACY_KEYS.filter((key) => localStorage.getItem(key) !== null);
  } catch {
    return [];
  }
}

function readLegacyValue(key) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch {
    return null;
  }
}

function toLegacyArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
}

function normalizeLegacyUserTag(item, index) {
  if (typeof item === "string") {
    const en = item.trim();
    if (!en) return null;
    return {
      id: `legacy_user_${index}_${normalizeText(en).replace(/\W+/g, "_")}`,
      en,
      jp: en,
      note: "旧PromptHubから移行",
      target: null,
      role: "custom",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const en = String(item?.en || item?.tag || item?.danbooru_tag || item?.name || item?.label || "").trim();
  if (!en) return null;

  return {
    id: item.id ? `legacy_${item.id}` : `legacy_user_${index}_${normalizeText(en).replace(/\W+/g, "_")}`,
    en,
    jp: String(item.jp || item.definition || item.desc || item.description || item.label_jp || en).trim(),
    note: String(item.note || item.memo || item.source || "旧PromptHubから移行").trim(),
    target: item.target || null,
    role: item.role || "custom",
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function tagListFromLegacy(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? item : item?.en || item?.tag || item?.label)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return splitPromptText(value);
}

function normalizeLegacyGuideBlock(item, index) {
  const source = typeof item === "string" ? { label: `旧ブロック ${index + 1}`, positive: item } : item;
  const positive = tagListFromLegacy(source?.positive || source?.tags || source?.items || source?.prompt);
  const negative = tagListFromLegacy(source?.negative || source?.negativeTags);
  if (positive.length === 0 && negative.length === 0) return null;

  return {
    id: source.id ? `legacy_block_${source.id}` : `legacy_block_${index}_${Date.now()}`,
    category: source.category || "legacy",
    label: String(source.label || source.name || source.title || `旧ブロック ${index + 1}`).trim(),
    positive,
    negative,
    uses: Number(source.uses || source.usageCount || 0),
    favorite: Boolean(source.favorite),
    usageCount: Number(source.usageCount || source.uses || 0),
    userCreated: true,
    createdAt: source.createdAt || source.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mergeUserTags(current, incoming) {
  const seen = new Set(current.map((tag) => normalizeText(tag.en)));
  const additions = incoming.filter((tag) => {
    const key = normalizeText(tag.en);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: [...additions, ...current], added: additions.length };
}

function mergeGuideBlocks(current, incoming) {
  const signature = (block) => normalizeText(`${block.label}|${block.positive.join(",")}|${block.negative.join(",")}`);
  const seen = new Set(current.map(signature));
  const additions = incoming.filter((block) => {
    const key = signature(block);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: [...additions, ...current], added: additions.length };
}

function splitPromptText(text) {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDraftItems(items, side = "positive") {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return makeDraftItem(item.trim(), item.trim(), side === "negative" ? "negative" : "custom", "import");
      const en = String(item?.en || item?.tag || item?.label || "").trim();
      if (!en) return null;
      return makeDraftItem(
        en,
        String(item?.jp || item?.desc || item?.description || en).trim(),
        side === "negative" ? "negative" : item?.role || "custom",
        item?.source || "import",
        Array.isArray(item?.categoryPath) ? item.categoryPath.map(String) : [],
      );
    })
    .filter(Boolean)
    .slice(0, 400);
}

function normalizeImportedStrings(items, limit = 1000) {
  if (!Array.isArray(items)) return null;
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function normalizeImportedUsageMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([id, usage]) => {
      const source = usage && typeof usage === "object" ? usage : {};
      return [String(id), {
        count: Math.max(0, Number(source.count || source.uses || 0)),
        lastUsedAt: String(source.lastUsedAt || source.updatedAt || ""),
      }];
    })
    .filter(([id]) => id));
}

function normalizeImportedRecipes(items) {
  if (!Array.isArray(items)) return null;
  return items
    .map((item, index) => {
      const positive = normalizeImportedStrings(item?.positive, 400) || [];
      const negative = normalizeImportedStrings(item?.negative, 400) || [];
      if (positive.length === 0 && negative.length === 0) return null;
      return {
        id: String(item?.id || `import_recipe_${Date.now()}_${index}`),
        name: String(item?.name || item?.label || `Imported recipe ${index + 1}`).trim(),
        positive,
        negative,
        updatedAt: String(item?.updatedAt || new Date().toISOString().slice(0, 10).replaceAll("-", "/")),
      };
    })
    .filter(Boolean)
    .slice(0, 300);
}

function normalizeImportedRecentPrompts(items) {
  if (!Array.isArray(items)) return null;
  return items
    .map((item, index) => ({
      id: item?.id || `import_recent_${Date.now()}_${index}`,
      label: String(item?.label || "Imported prompt").trim(),
      text: String(item?.text || "").trim(),
    }))
    .filter((item) => item.text)
    .slice(0, 100);
}

function normalizeImportedGuideBlocks(items) {
  if (!Array.isArray(items)) return null;
  return items
    .map((item, index) => {
      const positive = normalizeImportedStrings(item?.positive || item?.tags || item?.items, 400) || [];
      const negative = normalizeImportedStrings(item?.negative || item?.negativeTags, 400) || [];
      if (positive.length === 0 && negative.length === 0) return null;
      return {
        id: String(item?.id || `import_block_${Date.now()}_${index}`),
        category: String(item?.category || "custom"),
        label: String(item?.label || item?.name || `Imported block ${index + 1}`).trim(),
        positive,
        negative,
        uses: Number(item?.uses || item?.usageCount || 0),
        favorite: Boolean(item?.favorite),
        usageCount: Number(item?.usageCount || item?.uses || 0),
        userCreated: true,
        createdAt: item?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .slice(0, 300);
}

function normalizeImportedUserTags(items) {
  if (!Array.isArray(items)) return null;
  return items
    .map((item, index) => {
      const en = String(item?.en || item?.tag || item?.name || "").trim();
      if (!en) return null;
      return {
        id: String(item?.id || `import_user_${Date.now()}_${index}`),
        en,
        jp: String(item?.jp || item?.definition || item?.desc || en).trim(),
        note: String(item?.note || "").trim(),
        target: item?.target || null,
        role: item?.role || "custom",
        createdAt: item?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .slice(0, 1000);
}

function normalizeImportedPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    sensitive: typeof source.sensitive === "boolean" ? source.sensitive : false,
    density: ["comfortable", "compact"].includes(source.density) ? source.density : "comfortable",
    languageEmphasis: ["en", "jp"].includes(source.languageEmphasis) ? source.languageEmphasis : "en",
    inspectorMode: ["auto", "always"].includes(source.inspectorMode) ? source.inspectorMode : "auto",
  };
}

function normalizeImportedDraft(value) {
  if (!value || typeof value !== "object") return STARTER_DRAFT;
  return {
    positive: normalizeDraftItems(value.positive, "positive"),
    negative: normalizeDraftItems(value.negative, "negative"),
  };
}

function makeUserRecord(tag) {
  return {
    id: `user/user_tags/local/${tag.id}`,
    en: tag.en,
    jp: tag.jp || tag.en,
    target: tag.target || null,
    targetNote: tag.note || null,
    categoryId: "user",
    categoryLabel: "ユーザー追加",
    subcategoryId: "user_tags",
    subcategoryLabel: "ユーザータグ",
    sectionId: "local",
    sectionLabel: "ローカル追加",
    role: tag.role || "custom",
    sourceSite: "User",
    sourceUrl: "",
    userCreated: true,
    searchable: normalizeText([tag.en, tag.jp, tag.note, "ユーザー追加", "ユーザータグ", tag.target].join(" ")),
  };
}

export function App() {
  const initialPreferences = readNormalizedJson("prompthub:v1:preferences", null, normalizeImportedPreferences);
  const [view, setView] = useState("explore");
  const [dataState, setDataState] = useState({ status: "loading", data: SAMPLE_DATA, source: "sample" });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resultLimit, setResultLimit] = useState(80);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [userOnly, setUserOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [draft, setDraft] = useState(() => readNormalizedJson("prompthub:v1:draft", STARTER_DRAFT, normalizeImportedDraft));
  const [favorites, setFavorites] = useState(() => readNormalizedJson("prompthub:v1:favorites", ["looking at viewer", "soft lighting", "shallow depth of field"], (value) => normalizeImportedStrings(value, 2000)));
  const [recipes, setRecipes] = useState(() => readNormalizedJson("prompthub:v1:recipes", [
    {
      id: "soft_portrait_recipe",
      name: "柔らかな自然光のポートレート",
      positive: STARTER_DRAFT.positive.map((item) => item.en),
      negative: STARTER_DRAFT.negative.map((item) => item.en),
      updatedAt: "2026/06/24",
    },
    {
      id: "minimal_bg",
      name: "ミニマル背景・人物",
      positive: ["1girl", "simple background", "full body", "soft lighting"],
      negative: DEFAULT_NEGATIVE,
      updatedAt: "2026/06/21",
    },
  ], normalizeImportedRecipes));
  const [recentPrompts, setRecentPrompts] = useState(() => readNormalizedJson("prompthub:v1:recentPrompts", [], normalizeImportedRecentPrompts));
  const [userGuideBlocks, setUserGuideBlocks] = useState(() => readCustomBlocks());
  const [pinnedGuideBlockIds, setPinnedGuideBlockIds] = useState(() => readNormalizedJson("prompthub:v1:pinnedGuideBlocks", [], (value) => normalizeImportedStrings(value, 200)));
  const [recentGuideBlockIds, setRecentGuideBlockIds] = useState(() => readNormalizedJson("prompthub:v1:recentGuideBlocks", [], (value) => normalizeImportedStrings(value, RECENT_GUIDE_BLOCK_LIMIT)));
  const [guideBlockUsage, setGuideBlockUsage] = useState(() => readNormalizedJson("prompthub:v1:guideBlockUsage", {}, normalizeImportedUsageMap));
  const [draftRecipeName, setDraftRecipeName] = useState(() => String(readJson("prompthub:v1:draftRecipeName", "") || ""));
  const [guideBlockDraftName, setGuideBlockDraftName] = useState("");
  const [latestCreatedGuideBlockId, setLatestCreatedGuideBlockId] = useState("");
  const [userTags, setUserTags] = useState(() => readNormalizedJson("prompthub:v1:userTags", [], normalizeImportedUserTags));
  const [hiddenTags, setHiddenTags] = useState(() => readNormalizedJson("prompthub:v1:hiddenTags", [], (value) => normalizeImportedStrings(value, 5000)));
  const [showSensitive, setShowSensitive] = useState(() => initialPreferences.sensitive);
  const [density, setDensity] = useState(() => initialPreferences.density || "comfortable");
  const [languageEmphasis, setLanguageEmphasis] = useState(() => initialPreferences.languageEmphasis || "en");
  const [inspectorMode, setInspectorMode] = useState(() => initialPreferences.inspectorMode || "auto");
  const [legacyKeysDetected, setLegacyKeysDetected] = useState(() => listLegacyKeys());
  const [migrationNotice, setMigrationNotice] = useState("");
  const [toast, setToast] = useState("");
  const [syncSettings, setSyncSettings] = useState(() => readNormalizedJson(SYNC_SETTINGS_KEY, null, normalizeSyncSettings));
  const [syncStatus, setSyncStatus] = useState({ state: "idle", message: "未同期" });
  const syncBootstrappedRef = useRef(false);
  const syncApplyingRef = useRef(false);
  const syncRevisionRef = useRef(null);
  const syncSuppressNextPushRef = useRef(false);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      for (const url of DATA_URLS) {
        try {
          const response = await fetch(url, { credentials: "same-origin" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          if (alive) setDataState({ status: "ready", data: json, source: "compiled", url });
          return;
        } catch {
          // Try the next known data location before falling back to sample data.
        }
      }

      if (alive) {
        setDataState({ status: "sample", data: SAMPLE_DATA, source: "sample", url: "sample" });
      }
    }

    loadData().catch(() => {
      if (alive) {
        setDataState({ status: "sample", data: SAMPLE_DATA, source: "sample", url: "sample" });
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => { writeJson("prompthub:v1:draft", draft); }, [draft]);
  useEffect(() => { writeJson("prompthub:v1:favorites", favorites); }, [favorites]);
  useEffect(() => { writeJson("prompthub:v1:recipes", recipes); }, [recipes]);
  useEffect(() => { writeJson("prompthub:v1:recentPrompts", recentPrompts); }, [recentPrompts]);
  useEffect(() => { writeJson("prompthub:v1:customBlocks", userGuideBlocks); }, [userGuideBlocks]);
  useEffect(() => { writeJson("prompthub:v1:pinnedGuideBlocks", pinnedGuideBlockIds); }, [pinnedGuideBlockIds]);
  useEffect(() => { writeJson("prompthub:v1:recentGuideBlocks", recentGuideBlockIds); }, [recentGuideBlockIds]);
  useEffect(() => { writeJson("prompthub:v1:guideBlockUsage", guideBlockUsage); }, [guideBlockUsage]);
  useEffect(() => { writeJson("prompthub:v1:draftRecipeName", draftRecipeName); }, [draftRecipeName]);
  useEffect(() => { writeJson("prompthub:v1:userTags", userTags); }, [userTags]);
  useEffect(() => { writeJson("prompthub:v1:hiddenTags", hiddenTags); }, [hiddenTags]);
  useEffect(() => { writeJson("prompthub:v1:preferences", { sensitive: showSensitive, density, languageEmphasis, inspectorMode }); }, [showSensitive, density, languageEmphasis, inspectorMode]);
  useEffect(() => { writeJson(SYNC_SETTINGS_KEY, persistableSyncSettings(syncSettings)); }, [syncSettings]);

  useEffect(() => {
    if (!syncSettings.enabled) {
      syncBootstrappedRef.current = false;
      setSyncStatus({ state: "idle", message: "同期OFF" });
      return;
    }

    syncBootstrappedRef.current = false;
    runSync("pull", { silent: true }).finally(() => {
      syncBootstrappedRef.current = true;
    });
  }, [syncSettings.enabled, syncSettings.endpoint, syncSettings.username, syncSettings.password]);

  useEffect(() => {
    if (!syncSettings.enabled || !syncBootstrappedRef.current || syncApplyingRef.current) return undefined;
    if (syncSuppressNextPushRef.current) {
      syncSuppressNextPushRef.current = false;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      runSync("push", { silent: true });
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    syncSettings.enabled,
    draft,
    favorites,
    recipes,
    recentPrompts,
    userGuideBlocks,
    pinnedGuideBlockIds,
    recentGuideBlockIds,
    guideBlockUsage,
    draftRecipeName,
    userTags,
    hiddenTags,
    showSensitive,
    density,
    languageEmphasis,
    inspectorMode,
  ]);

  useEffect(() => {
    if (!syncSettings.enabled) return undefined;
    const timer = window.setInterval(() => {
      runSync("pull", { silent: true });
    }, SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [syncSettings.enabled, syncSettings.endpoint, syncSettings.username, syncSettings.password]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setResultLimit(80);
  }, [debouncedQuery, selectedCategory, selectedSubcategory, targetFilter, showSensitive, favoriteOnly, sourceFilter, userOnly, hiddenTags]);

  const dictionary = useMemo(() => flattenData(dataState.data), [dataState.data]);
  const dictionaryGuideBlocks = useMemo(() => buildDictionaryGuideBlocks(dataState.data), [dataState.data]);
  const userRecords = useMemo(() => userTags.map(makeUserRecord), [userTags]);
  const records = useMemo(() => [...dictionary.records, ...userRecords], [dictionary.records, userRecords]);
  const hiddenTagSet = useMemo(() => new Set(hiddenTags.map(normalizeText)), [hiddenTags]);
  const major = useMemo(() => {
    if (userRecords.length === 0) return dictionary.major;
    return [
      ...dictionary.major,
      {
        id: "user",
        label: "ユーザー追加",
        count: userRecords.length,
        subcategories: [{ id: "user_tags", label: "ユーザータグ", count: userRecords.length, categoryId: "user" }],
      },
    ];
  }, [dictionary.major, userRecords]);
  const guideBlocks = useMemo(() => [...userGuideBlocks, ...CORE_GUIDE_BLOCKS, ...dictionaryGuideBlocks], [userGuideBlocks, dictionaryGuideBlocks]);
  const guideBlocksById = useMemo(() => new Map(guideBlocks.map((block) => [block.id, block])), [guideBlocks]);
  const sourceSites = useMemo(() => {
    return [...new Set(records.filter((record) => !hiddenTagSet.has(normalizeText(record.en))).map((record) => record.sourceSite).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [records, hiddenTagSet]);

  const visibleRecords = useMemo(() => {
    const q = normalizeText(debouncedQuery);
    return records.filter((record) => {
      if (!showSensitive && record.categoryId === "sensitive") return false;
      if (hiddenTagSet.has(normalizeText(record.en))) return false;
      if (favoriteOnly && !favorites.includes(record.en)) return false;
      if (userOnly && !record.userCreated) return false;
      if (sourceFilter && record.sourceSite !== sourceFilter) return false;
      if (selectedCategory && selectedCategory !== "all" && record.categoryId !== selectedCategory) return false;
      if (selectedSubcategory && record.subcategoryId !== selectedSubcategory) return false;
      if (targetFilter === "__null__" && record.target) return false;
      if (targetFilter && targetFilter !== "__null__" && record.target !== targetFilter) return false;
      if (q && !matchesSearch(record.searchable, q)) return false;
      return true;
    });
  }, [records, debouncedQuery, selectedCategory, selectedSubcategory, targetFilter, showSensitive, hiddenTagSet, favoriteOnly, favorites, sourceFilter, userOnly]);

  useEffect(() => {
    if (selectedRecordId && !visibleRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(null);
    }
  }, [selectedRecordId, visibleRecords]);

  const selectedRecord = useMemo(() => {
    return visibleRecords.find((record) => record.id === selectedRecordId) || visibleRecords[0] || null;
  }, [selectedRecordId, visibleRecords]);

  const activeMajor = selectedCategory === "all" ? null : major.find((item) => item.id === selectedCategory);

  function notify(message) {
    setToast(message);
  }

  function buildLocalSyncSnapshot() {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      favorites,
      recipes,
      recentPrompts,
      draft,
      customBlocks: userGuideBlocks,
      guideBlocks: userGuideBlocks,
      pinnedGuideBlocks: pinnedGuideBlockIds,
      recentGuideBlocks: recentGuideBlockIds,
      guideBlockUsage,
      draftRecipeName,
      userTags,
      hiddenTags,
      preferences: { sensitive: showSensitive, density, languageEmphasis, inspectorMode },
    };
  }

  function applySyncSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;

    const importedFavorites = normalizeImportedStrings(snapshot.favorites, 2000);
    const importedRecipes = normalizeImportedRecipes(snapshot.recipes);
    const importedRecentPrompts = normalizeImportedRecentPrompts(snapshot.recentPrompts);
    const importedBlocks = normalizeImportedGuideBlocks(snapshot.customBlocks || snapshot.guideBlocks);
    const importedPinnedBlocks = normalizeImportedStrings(snapshot.pinnedGuideBlocks, 200);
    const importedRecentBlocks = normalizeImportedStrings(snapshot.recentGuideBlocks, RECENT_GUIDE_BLOCK_LIMIT);
    const importedUsage = normalizeImportedUsageMap(snapshot.guideBlockUsage);
    const importedUserTags = normalizeImportedUserTags(snapshot.userTags);
    const importedHiddenTags = normalizeImportedStrings(snapshot.hiddenTags, 5000);
    const importedPreferences = normalizeImportedPreferences(snapshot.preferences);

    syncApplyingRef.current = true;
    if (importedFavorites) setFavorites(importedFavorites);
    if (importedRecipes) setRecipes(importedRecipes);
    if (importedRecentPrompts) setRecentPrompts(importedRecentPrompts);
    if (importedBlocks) setUserGuideBlocks(importedBlocks);
    if (importedPinnedBlocks) setPinnedGuideBlockIds(importedPinnedBlocks);
    if (importedRecentBlocks) setRecentGuideBlockIds(importedRecentBlocks);
    if (Object.prototype.hasOwnProperty.call(snapshot, "guideBlockUsage")) setGuideBlockUsage(importedUsage);
    if (typeof snapshot.draftRecipeName === "string") setDraftRecipeName(snapshot.draftRecipeName);
    if (importedUserTags) setUserTags(importedUserTags);
    if (importedHiddenTags) setHiddenTags(importedHiddenTags);
    if (snapshot.draft?.positive || snapshot.draft?.negative) {
      setDraft({
        positive: normalizeDraftItems(snapshot.draft?.positive, "positive"),
        negative: normalizeDraftItems(snapshot.draft?.negative, "negative"),
      });
    }
    setShowSensitive(importedPreferences.sensitive);
    setDensity(importedPreferences.density);
    setLanguageEmphasis(importedPreferences.languageEmphasis);
    setInspectorMode(importedPreferences.inspectorMode);
    window.setTimeout(() => {
      syncApplyingRef.current = false;
    }, 0);
    return true;
  }

  async function requestSync(method, body) {
    const endpoint = syncSettings.endpoint || defaultSyncEndpoint();
    const headers = { "Content-Type": "application/json" };
    if (syncSettings.username && syncSettings.password) {
      headers.Authorization = encodeBasicAuth(syncSettings.username, syncSettings.password);
    }

    const response = await fetch(endpoint, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function pushSyncSnapshot(snapshot = buildLocalSyncSnapshot(), expectedRevision = syncRevisionRef.current, silent = false) {
    if (!syncSettings.enabled) return;
    if (syncStatus.state === "conflict") {
      setSyncStatus({ state: "conflict", message: "Pullしてクラウド変更を確認してからPushしてください。" });
      return;
    }
    setSyncStatus({ state: "syncing", message: "クラウドへ保存中..." });
    const result = await requestSync("POST", { snapshot, expectedRevision });
    syncRevisionRef.current = result.revision || null;
    setSyncStatus({
      state: "synced",
      message: `同期済み ${new Date().toLocaleTimeString()}`,
      revision: result.revision || null,
    });
    if (!silent) notify("クラウドへ同期しました");
  }

  async function pullSyncSnapshot({ silent = false } = {}) {
    if (!syncSettings.enabled) return;
    setSyncStatus({ state: "syncing", message: "クラウドから確認中..." });
    const remote = await requestSync("GET");
    const localSnapshot = buildLocalSyncSnapshot();

    if (!remote.snapshot) {
      await pushSyncSnapshot(localSnapshot, remote.revision || null, true);
      if (!silent) notify("ローカルデータをクラウドに作成しました");
      return;
    }

    syncRevisionRef.current = remote.revision || null;
    syncSuppressNextPushRef.current = true;
    applySyncSnapshot(remote.snapshot);
    setSyncStatus({
      state: "synced",
      message: `クラウド確認済み ${new Date().toLocaleTimeString()}`,
      revision: remote.revision || null,
    });
    if (!silent) notify("クラウド同期データを反映しました");
  }

  async function runSync(action, options) {
    try {
      if (!syncSettings.endpoint) {
        setSyncStatus({ state: "error", message: "同期URLが未設定です" });
        return;
      }
      if (action === "pull") await pullSyncSnapshot(options);
      if (action === "push") await pushSyncSnapshot(buildLocalSyncSnapshot(), syncRevisionRef.current, options?.silent);
    } catch (error) {
      if (error.status === 409) {
        setSyncStatus({ state: "conflict", message: "クラウド側に新しい変更があります。Pullして確認してください。" });
        return;
      }
      const message = error.data?.error === "sync_storage_not_configured"
        ? "Cloudflare KVが未設定です"
        : `同期失敗: ${error.message}`;
      setSyncStatus({ state: "error", message });
    }
  }

  function updateSyncSetting(name, value) {
    setSyncSettings((current) => ({ ...current, [name]: value }));
  }

  function addToDraft(record, side = "positive") {
    if (!record) return;
    const item = makeDraftItem(record.en, record.jp, side === "negative" ? "negative" : record.role, "dictionary", [
      record.categoryLabel,
      record.subcategoryLabel,
      record.sectionLabel,
    ]);
    setDraft((current) => ({
      ...current,
      [side]: uniqByEn([...(current[side] || []), item]),
    }));
    notify(`${record.en} を ${side === "positive" ? "Positive" : "Negative"} に追加`);
  }

  function removeDraftItem(side, en) {
    setDraft((current) => ({
      ...current,
      [side]: current[side].filter((item) => item.en !== en),
    }));
  }

  function moveDraftItem(side, en, direction) {
    setDraft((current) => {
      const items = [...current[side]];
      const index = items.findIndex((item) => item.en === en);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return current;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...current, [side]: items };
    });
  }

  function clearDraft() {
    setDraft({ positive: [], negative: [] });
    notify("Draft をクリアしました");
  }

  function recordGuideBlockUse(block) {
    const now = new Date().toISOString();
    setRecentGuideBlockIds((current) => [block.id, ...current.filter((id) => id !== block.id)].slice(0, RECENT_GUIDE_BLOCK_LIMIT));
    setGuideBlockUsage((current) => ({
      ...current,
      [block.id]: {
        count: Number(current[block.id]?.count || block.usageCount || block.uses || 0) + 1,
        lastUsedAt: now,
      },
    }));
  }

  function toggleGuideBlockPin(block) {
    setPinnedGuideBlockIds((current) => {
      if (current.includes(block.id)) return current.filter((id) => id !== block.id);
      return [block.id, ...current].slice(0, 200);
    });
    notify(pinnedGuideBlockIds.includes(block.id) ? `${block.label} の固定を解除しました` : `${block.label} を固定しました`);
  }

  function applyGuideBlock(block, side = "both") {
    const addPositive = side === "both" || side === "positive";
    const addNegative = side === "both" || side === "negative";
    const positiveTags = addPositive ? (block.positive || []).slice(0, block.dictionaryGenerated ? GUIDE_BLOCK_ADD_LIMIT : undefined) : [];
    const negativeTags = addNegative ? (block.negative || []).slice(0, block.dictionaryGenerated ? GUIDE_BLOCK_ADD_LIMIT : undefined) : [];
    setDraft((current) => ({
      positive: uniqByEn([...current.positive, ...positiveTags.map((tag) => makeDraftItem(tag, tag, tag.includes("light") ? "style_quality" : "custom", "block"))]),
      negative: uniqByEn([...current.negative, ...negativeTags.map((tag) => makeDraftItem(tag, tag, "negative", "block"))]),
    }));
    recordGuideBlockUse(block);
    const totalTags = (block.positive || []).length + (block.negative || []).length;
    const sideLabel = side === "positive" ? "Positive" : side === "negative" ? "Negative" : "Draft";
    if (block.dictionaryGenerated && totalTags > GUIDE_BLOCK_ADD_LIMIT) {
      notify(`${block.label} の先頭${GUIDE_BLOCK_ADD_LIMIT}件を${sideLabel}に追加`);
    } else {
      notify(`${block.label} を${sideLabel}に追加`);
    }
  }

  function createGuideBlockFromDraft() {
    if (draft.positive.length === 0 && draft.negative.length === 0) {
      notify("ブロック化するタグがありません");
      return;
    }

    const now = new Date().toISOString();
    const fallbackLabel = `カスタムブロック ${userGuideBlocks.length + 1}`;
    const label = guideBlockDraftName.trim() || fallbackLabel;
    const block = {
      id: `custom_${Date.now()}`,
      category: "custom",
      label,
      positive: draft.positive.map((item) => item.en),
      negative: draft.negative.map((item) => item.en),
      uses: 0,
      favorite: false,
      usageCount: 0,
      userCreated: true,
      createdAt: now,
      updatedAt: now,
    };
    setUserGuideBlocks((current) => [block, ...current]);
    setLatestCreatedGuideBlockId(block.id);
    setGuideBlockDraftName("");
    notify(`${label} をGuide Blockに保存しました`);
  }

  function deleteGuideBlock(id) {
    const block = userGuideBlocks.find((item) => item.id === id);
    if (!block || !window.confirm(`${block.label} を削除しますか？`)) return;
    setUserGuideBlocks((current) => current.filter((item) => item.id !== id));
    notify("Guide Block を削除しました");
  }

  function editGuideBlock(block, values) {
    if (!values?.label?.trim()) return;
    setUserGuideBlocks((current) => current.map((item) => item.id === block.id ? {
      ...item,
      label: values.label.trim(),
      positive: splitPromptText(values.positive ?? item.positive.join(", ")),
      negative: splitPromptText(values.negative ?? item.negative.join(", ")),
      updatedAt: new Date().toISOString(),
    } : item));
    notify("Guide Block を更新しました");
  }

  function exportGuideBlock(block) {
    downloadJson(`prompthub_guide_block_${block.id}.json`, block);
    notify("Guide Block を書き出しました");
  }

  function addUserTag(tag) {
    const en = tag.en?.trim();
    if (!en) {
      notify("English tag を入力してください");
      return false;
    }
    const exists = records.some((record) => normalizeText(record.en) === normalizeText(en));
    if (exists) {
      notify("同じEnglish tagがすでにあります");
      return false;
    }
    const now = new Date().toISOString();
    setUserTags((current) => [
      {
        id: `user_${Date.now()}`,
        en,
        jp: tag.jp?.trim() || en,
        note: tag.note?.trim() || "",
        target: tag.target || null,
        role: "custom",
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ]);
    notify("ユーザータグを追加しました");
    return true;
  }

  function editUserTag(tag, values) {
    const en = values?.en?.trim();
    if (!en) {
      notify("English tag を入力してください");
      return false;
    }
    const exists = records.some((record) => normalizeText(record.en) === normalizeText(en) && record.id !== tag.id);
    if (exists) {
      notify("同じEnglish tagがすでにあります");
      return false;
    }
    setUserTags((current) => current.map((item) => item.id === tag.id ? {
      ...item,
      en,
      jp: values.jp?.trim() || en,
      note: values.note?.trim() || "",
      target: values.target || null,
      updatedAt: new Date().toISOString(),
    } : item));
    notify("ユーザータグを更新しました");
    return true;
  }

  function deleteUserTag(id) {
    const tag = userTags.find((item) => item.id === id);
    if (!tag || !window.confirm(`${tag.en} を削除しますか？`)) return;
    setUserTags((current) => current.filter((tag) => tag.id !== id));
    notify("ユーザータグを削除しました");
  }

  function toggleFavorite(en) {
    setFavorites((current) => current.includes(en) ? current.filter((item) => item !== en) : [...current, en]);
  }

  function hideTag(en) {
    setHiddenTags((current) => current.some((item) => normalizeText(item) === normalizeText(en)) ? current : [en, ...current]);
    setFavorites((current) => current.filter((item) => normalizeText(item) !== normalizeText(en)));
    notify(`${en} をローカル非表示にしました`);
  }

  function unhideTag(en) {
    setHiddenTags((current) => current.filter((item) => normalizeText(item) !== normalizeText(en)));
    notify(`${en} の非表示を解除しました`);
  }

  function clearHiddenTags() {
    setHiddenTags([]);
    notify("非表示タグをすべて解除しました");
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setRecentPrompts((current) => [{ id: Date.now(), label, text }, ...current].slice(0, 20));
    notify(`${label} をコピーしました`);
  }

  function saveRecipe() {
    const name = draftRecipeName.trim() || "新しいPromptレシピ";
    const recipe = {
      id: `recipe_${Date.now()}`,
      name,
      positive: draft.positive.map((item) => item.en),
      negative: draft.negative.map((item) => item.en),
      updatedAt: new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
    };
    setRecipes((current) => [recipe, ...current]);
    setDraftRecipeName("");
    notify("Collections に保存しました");
    setView("collections");
  }

  function renameRecipe(recipe, name) {
    if (!name?.trim()) return;
    setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString().slice(0, 10).replaceAll("-", "/") } : item));
    notify("レシピ名を変更しました");
  }

  function duplicateRecipe(recipe) {
    const copy = {
      ...recipe,
      id: `recipe_${Date.now()}`,
      name: `${recipe.name} copy`,
      updatedAt: new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
    };
    setRecipes((current) => [copy, ...current]);
    notify("レシピを複製しました");
  }

  function deleteRecipe(recipe) {
    if (!window.confirm(`${recipe.name} を削除しますか？`)) return;
    setRecipes((current) => current.filter((item) => item.id !== recipe.id));
    notify("レシピを削除しました");
  }

  function exportRecipe(recipe) {
    downloadJson(`prompthub_recipe_${recipe.id}.json`, recipe);
    notify("レシピを書き出しました");
  }

  function saveRecentAsRecipe(item) {
    const positive = splitPromptText(item.text.replace(/^Positive:\s*/i, "").split(/\n\nNegative:/i)[0]);
    const negativeMatch = item.text.match(/Negative:\s*([\s\S]*)/i);
    const negative = negativeMatch ? splitPromptText(negativeMatch[1]) : [];
    const recipe = {
      id: `recipe_${Date.now()}`,
      name: `${item.label} から保存`,
      positive,
      negative,
      updatedAt: new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
    };
    setRecipes((current) => [recipe, ...current]);
    notify("最近コピーからレシピを保存しました");
  }

  function deleteRecentPrompt(id) {
    setRecentPrompts((current) => current.filter((item) => item.id !== id));
    notify("最近コピーから削除しました");
  }

  function loadRecipe(recipe) {
    setDraft({
      positive: recipe.positive.map((tag) => makeDraftItem(tag, tag, "custom", "recipe")),
      negative: recipe.negative.map((tag) => makeDraftItem(tag, tag, "negative", "recipe")),
    });
    setView("builder");
    notify(`${recipe.name} をBuilderに読み込みました`);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportLocalData() {
    downloadJson(`prompthub_local_${new Date().toISOString().slice(0, 10)}.json`, {
      favorites,
      recipes,
      recentPrompts,
      draft,
      customBlocks: userGuideBlocks,
      guideBlocks: userGuideBlocks,
      pinnedGuideBlocks: pinnedGuideBlockIds,
      recentGuideBlocks: recentGuideBlockIds,
      guideBlockUsage,
      draftRecipeName,
      userTags,
      hiddenTags,
      legacyKeysDetected,
      preferences: { sensitive: showSensitive, density, languageEmphasis, inspectorMode },
    });
    notify("ローカルデータを書き出しました");
  }

  function importLocalData(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        const summary = [];
        const importedFavorites = normalizeImportedStrings(data.favorites, 2000);
        const importedRecipes = normalizeImportedRecipes(data.recipes);
        const importedRecentPrompts = normalizeImportedRecentPrompts(data.recentPrompts);
        const importedBlocks = normalizeImportedGuideBlocks(data.customBlocks || data.guideBlocks);
        const importedPinnedBlocks = normalizeImportedStrings(data.pinnedGuideBlocks, 200);
        const importedRecentBlocks = normalizeImportedStrings(data.recentGuideBlocks, RECENT_GUIDE_BLOCK_LIMIT);
        const importedUsage = normalizeImportedUsageMap(data.guideBlockUsage);
        const importedUserTags = normalizeImportedUserTags(data.userTags);
        const importedHiddenTags = normalizeImportedStrings(data.hiddenTags, 5000);

        if (importedFavorites) { setFavorites(importedFavorites); summary.push(`favorites ${importedFavorites.length}`); }
        if (importedRecipes) { setRecipes(importedRecipes); summary.push(`recipes ${importedRecipes.length}`); }
        if (importedRecentPrompts) { setRecentPrompts(importedRecentPrompts); summary.push(`recent ${importedRecentPrompts.length}`); }
        if (importedBlocks) { setUserGuideBlocks(importedBlocks); summary.push(`blocks ${importedBlocks.length}`); }
        if (importedPinnedBlocks) { setPinnedGuideBlockIds(importedPinnedBlocks); summary.push(`pinned blocks ${importedPinnedBlocks.length}`); }
        if (importedRecentBlocks) { setRecentGuideBlockIds(importedRecentBlocks); summary.push(`recent blocks ${importedRecentBlocks.length}`); }
        if (Object.keys(importedUsage).length > 0) { setGuideBlockUsage(importedUsage); summary.push(`block usage ${Object.keys(importedUsage).length}`); }
        if (typeof data.draftRecipeName === "string") setDraftRecipeName(data.draftRecipeName);
        if (importedUserTags) { setUserTags(importedUserTags); summary.push(`user tags ${importedUserTags.length}`); }
        if (importedHiddenTags) { setHiddenTags(importedHiddenTags); summary.push(`hidden ${importedHiddenTags.length}`); }
        if (data.draft?.positive || data.draft?.negative) {
          const nextDraft = {
            positive: normalizeDraftItems(data.draft?.positive, "positive"),
            negative: normalizeDraftItems(data.draft?.negative, "negative"),
          };
          setDraft(nextDraft);
          summary.push(`draft ${nextDraft.positive.length + nextDraft.negative.length}`);
        }
        if (typeof data.preferences?.sensitive === "boolean") setShowSensitive(data.preferences.sensitive);
        if (["comfortable", "compact"].includes(data.preferences?.density)) setDensity(data.preferences.density);
        if (["en", "jp"].includes(data.preferences?.languageEmphasis)) setLanguageEmphasis(data.preferences.languageEmphasis);
        if (["auto", "always"].includes(data.preferences?.inspectorMode)) setInspectorMode(data.preferences.inspectorMode);
        notify(summary.length > 0 ? `読み込み: ${summary.join(", ")}` : "読み込めるデータがありませんでした");
      } catch {
        notify("JSONを読み込めませんでした");
      }
    };
    reader.readAsText(file);
  }

  function resetLocalData() {
    if (!window.confirm("PromptHubのローカル保存データをリセットしますか？")) return;
    for (const key of LOCAL_KEYS) removeJson(key);
    setDraft(STARTER_DRAFT);
    setFavorites(["looking at viewer", "soft lighting", "shallow depth of field"]);
    setRecipes([]);
    setRecentPrompts([]);
    setUserGuideBlocks([]);
    setPinnedGuideBlockIds([]);
    setRecentGuideBlockIds([]);
    setGuideBlockUsage({});
    setDraftRecipeName("");
    setUserTags([]);
    setHiddenTags([]);
    setShowSensitive(false);
    setDensity("comfortable");
    setLanguageEmphasis("en");
    setInspectorMode("auto");
    notify("ローカルデータをリセットしました");
  }

  function migrateLegacyData() {
    const keys = listLegacyKeys();
    setLegacyKeysDetected(keys);

    if (keys.length === 0) {
      setMigrationNotice("旧データは見つかりませんでした。");
      notify("旧データは見つかりませんでした");
      return;
    }

    const legacyTags = toLegacyArray(readLegacyValue("prompthub_user_tags"))
      .map(normalizeLegacyUserTag)
      .filter(Boolean);
    const legacyBlocks = toLegacyArray(readLegacyValue("prompthub_select_builder_blocks"))
      .map(normalizeLegacyGuideBlock)
      .filter(Boolean);
    const mergedTags = mergeUserTags(userTags, legacyTags);
    const mergedBlocks = mergeGuideBlocks(userGuideBlocks, legacyBlocks);

    setUserTags(mergedTags.items);
    setUserGuideBlocks(mergedBlocks.items);
    setMigrationNotice(`旧データ検出済み: ${keys.join(", ")} / 追加: ユーザータグ ${mergedTags.added}件、Guide Blocks ${mergedBlocks.added}件。旧キーは削除していません。`);
    notify("旧データの移行を確認しました");
  }

  const positiveText = draft.positive.map((item) => item.en).join(", ");
  const negativeText = draft.negative.map((item) => item.en).join(", ");

  return (
    <div className={`app-shell density-${density} inspector-${inspectorMode}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("explore")}>Prompt<span>Hub</span></button>
        <nav className="nav" aria-label="Primary">
          {["explore", "builder", "collections", "learn", "settings"].map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <div className="top-status">
          <button
            className={`pill pill-button ${showSensitive ? "active" : "muted"}`}
            aria-pressed={showSensitive}
            aria-label={`Sensitive語彙を${showSensitive ? "OFF" : "ON"}に切り替え`}
            onClick={() => setShowSensitive(!showSensitive)}
          >
            Sensitive {showSensitive ? "ON" : "OFF"}
          </button>
          <span className="pill">{dataState.source === "compiled" ? "compiled data" : "sample data"}</span>
        </div>
      </header>

      {view === "explore" && (
        <ExploreView
          major={major}
          activeMajor={activeMajor}
          records={visibleRecords}
          allRecords={records.filter((record) => (showSensitive || record.categoryId !== "sensitive") && !hiddenTagSet.has(normalizeText(record.en)))}
          selectedRecord={selectedRecord}
          resultLimit={resultLimit}
          setResultLimit={setResultLimit}
          query={query}
          setQuery={setQuery}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedSubcategory={selectedSubcategory}
          setSelectedSubcategory={setSelectedSubcategory}
          targetFilter={targetFilter}
          setTargetFilter={setTargetFilter}
          favoriteOnly={favoriteOnly}
          setFavoriteOnly={setFavoriteOnly}
          userOnly={userOnly}
          setUserOnly={setUserOnly}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          sourceSites={sourceSites}
          setSelectedRecordId={setSelectedRecordId}
          addToDraft={addToDraft}
          copyText={copyText}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          hideTag={hideTag}
          draft={draft}
          setView={setView}
          showSensitive={showSensitive}
          languageEmphasis={languageEmphasis}
        />
      )}

      {view === "builder" && (
        <BuilderView
          records={records.filter((record) => (showSensitive || record.categoryId !== "sensitive") && !hiddenTagSet.has(normalizeText(record.en)))}
          draft={draft}
          setQuery={setQuery}
          query={query}
          removeDraftItem={removeDraftItem}
          moveDraftItem={moveDraftItem}
          clearDraft={clearDraft}
          guideBlocks={guideBlocks}
          dictionaryGuideBlockCount={dictionaryGuideBlocks.length}
          showSensitive={showSensitive}
          applyGuideBlock={applyGuideBlock}
          copyGuideBlock={(block) => copyText([...block.positive, ...block.negative].join(", "), block.label)}
          pinnedGuideBlockIds={pinnedGuideBlockIds}
          recentGuideBlockIds={recentGuideBlockIds}
          guideBlockUsage={guideBlockUsage}
          guideBlocksById={guideBlocksById}
          toggleGuideBlockPin={toggleGuideBlockPin}
          createGuideBlockFromDraft={createGuideBlockFromDraft}
          copyText={copyText}
          saveRecipe={saveRecipe}
          draftRecipeName={draftRecipeName}
          setDraftRecipeName={setDraftRecipeName}
          guideBlockDraftName={guideBlockDraftName}
          setGuideBlockDraftName={setGuideBlockDraftName}
          latestCreatedGuideBlockId={latestCreatedGuideBlockId}
          positiveText={positiveText}
          negativeText={negativeText}
          addToDraft={addToDraft}
        />
      )}

      {view === "collections" && (
        <CollectionsView
          recipes={recipes}
          favorites={favorites}
          records={records}
          showSensitive={showSensitive}
          addToDraft={addToDraft}
          toggleFavorite={toggleFavorite}
          loadRecipe={loadRecipe}
          renameRecipe={renameRecipe}
          duplicateRecipe={duplicateRecipe}
          deleteRecipe={deleteRecipe}
          exportRecipe={exportRecipe}
          copyRecipe={(recipe, mode = "both") => {
            const positive = recipe.positive.join(", ");
            const negative = recipe.negative.join(", ");
            if (mode === "positive") copyText(positive, `${recipe.name} Positive`);
            else copyText(`Positive:\n${positive}\n\nNegative:\n${negative}`, `${recipe.name} Both`);
          }}
          copyText={copyText}
          positiveText={positiveText}
          negativeText={negativeText}
          recentPrompts={recentPrompts}
          saveRecentAsRecipe={saveRecentAsRecipe}
          deleteRecentPrompt={deleteRecentPrompt}
          guideBlocks={guideBlocks}
          applyGuideBlock={applyGuideBlock}
          deleteGuideBlock={deleteGuideBlock}
          editGuideBlock={editGuideBlock}
          exportGuideBlock={exportGuideBlock}
          userTags={userTags}
          addUserTag={addUserTag}
          editUserTag={editUserTag}
          deleteUserTag={deleteUserTag}
          hideTag={hideTag}
          exportLocalData={exportLocalData}
          setView={setView}
        />
      )}

      {view === "learn" && <LearnView />}

      {view === "settings" && (
        <SettingsView
          showSensitive={showSensitive}
          setShowSensitive={setShowSensitive}
          density={density}
          setDensity={setDensity}
          languageEmphasis={languageEmphasis}
          setLanguageEmphasis={setLanguageEmphasis}
          inspectorMode={inspectorMode}
          setInspectorMode={setInspectorMode}
          exportLocalData={exportLocalData}
          importLocalData={importLocalData}
          resetLocalData={resetLocalData}
          syncSettings={syncSettings}
          syncStatus={syncStatus}
          updateSyncSetting={updateSyncSetting}
          pullSync={() => runSync("pull")}
          pushSync={() => runSync("push")}
          dataState={dataState}
          legacyKeysDetected={legacyKeysDetected}
          migrationNotice={migrationNotice}
          migrateLegacyData={migrateLegacyData}
          hiddenTags={hiddenTags}
          unhideTag={unhideTag}
          clearHiddenTags={clearHiddenTags}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

function ExploreView(props) {
  const {
    major,
    activeMajor,
    records,
    allRecords,
    selectedRecord,
    resultLimit,
    setResultLimit,
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    targetFilter,
    setTargetFilter,
    favoriteOnly,
    setFavoriteOnly,
    userOnly,
    setUserOnly,
    sourceFilter,
    setSourceFilter,
    sourceSites,
    setSelectedRecordId,
    addToDraft,
    copyText,
    favorites,
    toggleFavorite,
    hideTag,
    draft,
    setView,
    showSensitive,
    languageEmphasis,
  } = props;

  const displayedMajor = major.filter((item) => showSensitive || item.id !== "sensitive");
  const activeSubcategory = activeMajor?.subcategories.find((subcategory) => subcategory.id === selectedSubcategory);
  const categoryScopedResults = selectedCategory && selectedCategory !== "all";
  const visibleTableRecords = categoryScopedResults ? records : records.slice(0, resultLimit);
  const resultsTopRef = useRef(null);
  const jumpToResults = () => {
    window.requestAnimationFrame(() => {
      resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const selectCategory = (categoryId) => {
    setSelectedCategory(categoryId);
    setSelectedSubcategory("");
    setSelectedRecordId(null);
    jumpToResults();
  };
  const selectSubcategory = (subcategoryId) => {
    setSelectedSubcategory(subcategoryId);
    setSelectedRecordId(null);
    jumpToResults();
  };

  return (
    <main className="workspace explore">
      <aside className="sidebar explore-sidebar">
        <h2>カテゴリ</h2>
        <button
          className={`category-button ${selectedCategory === "all" ? "active" : ""}`}
          onClick={() => selectCategory("all")}
        >
          <span>すべて</span><strong>{displayedMajor.reduce((sum, item) => sum + item.count, 0).toLocaleString()}</strong>
        </button>
        {displayedMajor.map((category) => {
          const isOpen = selectedCategory === category.id;
          return (
            <div className="category-group" key={category.id}>
              <button
                className={`category-button ${isOpen ? "active" : ""}`}
                onClick={() => selectCategory(category.id)}
              >
                <span>{category.label}</span><strong>{category.count.toLocaleString()}</strong>
              </button>
              {isOpen && (
                <div className="subcategory-list">
                  {category.subcategories.filter((sub) => sub.count > 0).slice(0, 10).map((subcategory) => (
                    <button
                      key={subcategory.id}
                      className={`subcategory-button ${selectedSubcategory === subcategory.id ? "active" : ""}`}
                      onClick={() => selectSubcategory(subcategory.id)}
                    >
                      <span>{subcategory.label}</span><strong>{subcategory.count.toLocaleString()}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="notice">
          <strong>センシティブ語彙 {showSensitive ? "ON" : "OFF"}</strong>
          <p>{showSensitive ? "検索対象に含まれています。" : "初期状態では検索結果に含めません。"}</p>
        </div>
      </aside>

      <section className="content explore-content">
        <div className="search-hero">
          <label htmlFor="global-search">日本語・英語でタグ検索</label>
          <div className="search-row">
            <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例: カメラ目線、自然光、full body" />
            <button className="primary" onClick={() => setQuery("")} disabled={!query}>Clear</button>
          </div>
          <div className="filter-row">
            {["", "self", "other", "mutual", "object", "__null__"].map((value) => (
              <button key={value || "all"} className={targetFilter === value ? "active" : ""} onClick={() => setTargetFilter(value)}>
                {value === "" ? "target すべて" : value === "__null__" ? "未設定" : value}
              </button>
            ))}
            <button className={favoriteOnly ? "active" : ""} onClick={() => setFavoriteOnly(!favoriteOnly)}>Favorite</button>
            <button className={userOnly ? "active" : ""} onClick={() => setUserOnly(!userOnly)}>ユーザー追加</button>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="source site filter">
              <option value="">source すべて</option>
              {sourceSites.map((site) => <option key={site} value={site}>{site}</option>)}
            </select>
          </div>
          <div className="example-row" aria-label="検索例">
            {["カメラ目線", "自然光", "full body", "笑顔", "背景"].map((example) => (
              <button key={example} onClick={() => setQuery(example)}>{example}</button>
            ))}
          </div>
        </div>

        <div className="section-heading" ref={resultsTopRef}>
          <div>
            <h1>Explore</h1>
            <p>
              {records.length.toLocaleString()} 件
              {selectedCategory && selectedCategory !== "all" && activeMajor ? ` / ${activeMajor.label}` : ""}
              {selectedSubcategory && activeSubcategory ? ` > ${activeSubcategory.label}` : ""}
            </p>
          </div>
          <button onClick={() => setView("builder")}>Builderを開く</button>
        </div>

        <div className="mobile-category-strip" aria-label="Mobile category shortcuts">
          <button
            className={selectedCategory === "all" ? "active" : ""}
            onClick={() => selectCategory("all")}
          >
            すべて
          </button>
          {displayedMajor.map((category) => (
            <button key={category.id} className={selectedCategory === category.id ? "active" : ""} onClick={() => selectCategory(category.id)}>
              {category.label}
            </button>
          ))}
        </div>
        {activeMajor && selectedCategory !== "all" && (
          <div className="mobile-category-strip sub" aria-label="Mobile subcategory shortcuts">
            <button className={!selectedSubcategory ? "active" : ""} onClick={() => selectSubcategory("")}>カテゴリ内すべて</button>
            {activeMajor.subcategories.map((subcategory) => (
              <button key={subcategory.id} className={selectedSubcategory === subcategory.id ? "active" : ""} onClick={() => selectSubcategory(subcategory.id)}>
                {subcategory.label} {subcategory.count}
              </button>
            ))}
          </div>
        )}

        <TagTable
          records={visibleTableRecords}
          totalRecords={records.length}
          selectedRecord={selectedRecord}
          setSelectedRecordId={setSelectedRecordId}
          addToDraft={addToDraft}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          hideTag={hideTag}
          languageEmphasis={languageEmphasis}
          copyText={copyText}
        />
        {!categoryScopedResults && records.length > resultLimit && (
          <div className="show-more">
            <span>{resultLimit.toLocaleString()} / {records.length.toLocaleString()} 件を表示中</span>
            <button onClick={() => setResultLimit((current) => current + 80)}>Show more</button>
          </div>
        )}
      </section>

      <aside className="inspector explore-inspector">
        <TagInspector
          record={selectedRecord}
          allRecords={allRecords}
          addToDraft={addToDraft}
          copyText={copyText}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          hideTag={hideTag}
          languageEmphasis={languageEmphasis}
        />
        <PromptSummary draft={draft} setView={setView} />
      </aside>
    </main>
  );
}

function TagTable({ records, totalRecords, selectedRecord, setSelectedRecordId, addToDraft, favorites, toggleFavorite, hideTag, languageEmphasis, copyText }) {
  if (records.length === 0) {
    return (
      <div className="empty-state">
        <h2>該当するタグがありません</h2>
        <p>検索語を短くするか、カテゴリや target フィルタを外してください。</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div className="table-meta">
        <span>{records.length.toLocaleString()} / {totalRecords.toLocaleString()} 件</span>
        <span>{languageEmphasis === "jp" ? "日本語優先" : "English first"}</span>
      </div>
      <table className="tag-table">
        <thead>
          <tr>
            {languageEmphasis === "jp" ? (
              <>
                <th>日本語説明</th>
                <th>English tag</th>
              </>
            ) : (
              <>
                <th>English tag</th>
                <th>日本語説明</th>
              </>
            )}
            <th>Category path</th>
            <th>Target</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const isFavorite = favorites.includes(record.en);
            return (
              <tr
                key={record.id}
                className={selectedRecord?.id === record.id ? "selected" : ""}
                onClick={() => setSelectedRecordId(record.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRecordId(record.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selectedRecord?.id === record.id}
              >
                {languageEmphasis === "jp" ? (
                  <>
                    <td>{record.jp}</td>
                    <td><strong>{record.en}</strong></td>
                  </>
                ) : (
                  <>
                    <td><strong>{record.en}</strong></td>
                    <td>{record.jp}</td>
                  </>
                )}
                <td>{record.categoryLabel} &gt; {record.subcategoryLabel}</td>
                <td><span className="small-pill">{record.target || "未設定"}</span></td>
                <td>
                  <div className="row-actions row-actions-prioritized">
                    <button className="primary" onClick={(event) => { event.stopPropagation(); addToDraft(record, "positive"); }}>+Positive</button>
                    <button onClick={(event) => { event.stopPropagation(); addToDraft(record, "negative"); }}>+Negative</button>
                    <button
                      className={`favorite-toggle ${isFavorite ? "active" : ""}`}
                      aria-label={`${record.en} を${isFavorite ? "お気に入り解除" : "お気に入り登録"}`}
                      aria-pressed={isFavorite}
                      title={isFavorite ? "お気に入り解除" : "お気に入り登録"}
                      onClick={(event) => { event.stopPropagation(); toggleFavorite(record.en); }}
                    >
                      {isFavorite ? "★" : "☆"}
                    </button>
                    <ActionMenu>
                      <button onClick={(event) => { event.stopPropagation(); copyText(record.en, record.en); }}>Copy</button>
                      <button className="danger-button" onClick={(event) => { event.stopPropagation(); hideTag(record.en); }}>Hide</button>
                    </ActionMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TagInspector({ record, allRecords, addToDraft, copyText, favorites, toggleFavorite, hideTag, languageEmphasis }) {
  if (!record) return null;
  const relatedRecords = allRecords
    .filter((item) => item.sectionId === record.sectionId && item.categoryId === record.categoryId && item.en !== record.en)
    .slice(0, 6);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>タグ詳細</h2>
        <button className={favorites.includes(record.en) ? "active subtle" : "subtle"} onClick={() => toggleFavorite(record.en)}>Favorite</button>
      </div>
      <h3 className="tag-title">{languageEmphasis === "jp" ? record.jp || record.en : record.en}</h3>
      <p className="jp-text">{languageEmphasis === "jp" ? record.en : record.jp || "説明なし"}</p>
      <dl className="detail-list">
        <dt>カテゴリパス</dt><dd>{record.categoryLabel} &gt; {record.subcategoryLabel} &gt; {record.sectionLabel}</dd>
        <dt>target</dt><dd>{record.target || "未設定"}</dd>
        <dt>target note</dt><dd>{record.targetNote || "なし"}</dd>
        <dt>source</dt><dd>{record.sourceSite}</dd>
        {record.sourceUrl && (
          <>
            <dt>source URL</dt>
            <dd><a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.sourceUrl}</a></dd>
          </>
        )}
      </dl>
      <div className="related">
        <span>{record.subcategoryLabel}</span>
        <span>{record.sectionLabel}</span>
        <span>{record.role}</span>
      </div>
      {relatedRecords.length > 0 && (
        <div className="related related-tags" aria-label="同セクションの関連タグ">
          {relatedRecords.map((item) => (
            <button key={item.id} onClick={() => addToDraft(item, "positive")}>{item.en}</button>
          ))}
        </div>
      )}
      <div className="stack-actions">
        <button onClick={() => copyText(record.en, record.en)}>Copy tag</button>
        <button className="primary" onClick={() => addToDraft(record, "positive")}>+ Positive に追加</button>
        <button onClick={() => addToDraft(record, "negative")}>+ Negative に追加</button>
        <button className="danger-button" onClick={() => hideTag(record.en)}>Hide locally</button>
      </div>
    </section>
  );
}

function PromptSummary({ draft, setView }) {
  return (
    <section className="panel prompt-summary">
      <div className="panel-head">
        <h2>Prompt Draft</h2>
        <span>{draft.positive.length + draft.negative.length} tags</span>
      </div>
      <div>
        <strong>Positive</strong>
        <p>{draft.positive.map((item) => item.en).join(", ") || "Explore からタグを送る"}</p>
      </div>
      <div>
        <strong>Negative</strong>
        <p>{draft.negative.map((item) => item.en).join(", ") || "Negativeタグは未設定"}</p>
      </div>
      <button className="primary full" onClick={() => setView("builder")}>Builderで編集</button>
    </section>
  );
}

function ActionMenu({ label = "More", children }) {
  return (
    <details className="action-menu">
      <summary>{label}</summary>
      <div className="action-menu-panel">
        {children}
      </div>
    </details>
  );
}

function GuideBlockCard({ block, applyGuideBlock, copyGuideBlock, pinned, toggleGuideBlockPin, guideBlockUsage, compact = false }) {
  const positiveCount = (block.positive || []).length;
  const negativeCount = (block.negative || []).length;
  const usage = guideBlockUsage[block.id];
  const usageCount = Number(usage?.count || block.usageCount || block.uses || 0);
  const meta = block.dictionaryGenerated
    ? `${block.sourcePath?.join(" > ")} / ${block.tagCount} tags`
    : `${usageCount} uses`;
  const tags = [...(block.positive || []), ...(block.negative || [])].join(", ");

  return (
    <article className={`guide-card ${compact ? "compact" : ""}`}>
      <div className="guide-card-main">
        <strong>{block.label}</strong>
        <span>{tags}</span>
        <em>{meta}</em>
      </div>
      <div className="guide-card-actions">
        <button
          className="primary"
          disabled={positiveCount === 0}
          onClick={() => applyGuideBlock(block, "positive")}
          aria-label={`${block.label} をPositiveに追加`}
        >
          +Positive
        </button>
        <button
          disabled={negativeCount === 0}
          onClick={() => applyGuideBlock(block, "negative")}
          aria-label={`${block.label} をNegativeに追加`}
        >
          +Negative
        </button>
        <button onClick={() => toggleGuideBlockPin(block)} aria-label={`${block.label} を${pinned ? "固定解除" : "固定"}`}>
          {pinned ? "Unpin" : "Pin"}
        </button>
        <button onClick={() => copyGuideBlock(block)} aria-label={`${block.label} をコピー`}>
          Copy
        </button>
      </div>
    </article>
  );
}

function GuideBlockShortcutSection({ title, description, blocks, emptyText, applyGuideBlock, copyGuideBlock, pinnedGuideBlockIds, toggleGuideBlockPin, guideBlockUsage }) {
  return (
    <section className={`guide-shortcut-section ${blocks.length === 0 ? "empty" : ""}`}>
      <div className="guide-shortcut-head">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {blocks.length === 0 ? (
        <p className="shortcut-empty">{emptyText}</p>
      ) : (
        <div className="guide-shortcut-grid">
          {blocks.map((block) => (
            <GuideBlockCard
              key={block.id}
              block={block}
              compact
              applyGuideBlock={applyGuideBlock}
              copyGuideBlock={copyGuideBlock}
              pinned={pinnedGuideBlockIds.includes(block.id)}
              toggleGuideBlockPin={toggleGuideBlockPin}
              guideBlockUsage={guideBlockUsage}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendedGuideBlocks({ blocks, applyGuideBlock, copyGuideBlock, pinnedGuideBlockIds, toggleGuideBlockPin, guideBlockUsage }) {
  return (
    <section className="recommended-guide-blocks" aria-label="Recommended Guide Blocks">
      <div className="guide-shortcut-head">
        <strong>Recommended Blocks</strong>
        <span>今のDraftに近い構成と、すぐ使える定番ブロック</span>
      </div>
      <div className="guide-recommend-grid">
        {blocks.map((block) => (
          <GuideBlockCard
            key={block.id}
            block={block}
            compact
            applyGuideBlock={applyGuideBlock}
            copyGuideBlock={copyGuideBlock}
            pinned={pinnedGuideBlockIds.includes(block.id)}
            toggleGuideBlockPin={toggleGuideBlockPin}
            guideBlockUsage={guideBlockUsage}
          />
        ))}
      </div>
    </section>
  );
}

function BuilderMobileActionBar({ positiveText, negativeText, copyText, saveRecipe }) {
  return (
    <nav className="mobile-builder-actions" aria-label="Builder quick actions">
      <button className="primary" disabled={!positiveText} onClick={() => copyText(positiveText, "Positive Prompt")}>Copy +</button>
      <button disabled={!negativeText} onClick={() => copyText(negativeText, "Negative Prompt")}>Copy -</button>
      <button disabled={!positiveText && !negativeText} onClick={() => copyText(`Positive:\n${positiveText}\n\nNegative:\n${negativeText}`, "Both Prompts")}>Copy both</button>
      <button disabled={!positiveText && !negativeText} onClick={saveRecipe}>Save</button>
    </nav>
  );
}

function BuilderView({
  records,
  draft,
  removeDraftItem,
  moveDraftItem,
  clearDraft,
  guideBlocks,
  dictionaryGuideBlockCount,
  showSensitive,
  applyGuideBlock,
  copyGuideBlock,
  pinnedGuideBlockIds,
  recentGuideBlockIds,
  guideBlockUsage,
  guideBlocksById,
  toggleGuideBlockPin,
  createGuideBlockFromDraft,
  copyText,
  saveRecipe,
  draftRecipeName,
  setDraftRecipeName,
  guideBlockDraftName,
  setGuideBlockDraftName,
  latestCreatedGuideBlockId,
  positiveText,
  negativeText,
  addToDraft,
}) {
  const [localSearch, setLocalSearch] = useState("soft");
  const [guideSearch, setGuideSearch] = useState("");
  const [guideCategory, setGuideCategory] = useState("all");
  const [guideLimit, setGuideLimit] = useState(80);
  const candidates = records
    .filter((record) => matchesSearch(record.searchable, localSearch))
    .slice(0, 6);
  const conflicts = draft.positive
    .map((item) => item.en)
    .filter((tag) => draft.negative.some((item) => normalizeText(item.en) === normalizeText(tag)));
  const guideCategories = useMemo(() => {
    const map = new Map();
    for (const block of guideBlocks) {
      if (!showSensitive && block.sourceCategoryId === "sensitive") continue;
      map.set(block.category, block.categoryLabel || block.category);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [guideBlocks, showSensitive]);
  const visibleGuideBlock = (block) => block && (showSensitive || block.sourceCategoryId !== "sensitive");
  const latestCreatedGuideBlock = guideBlocksById.get(latestCreatedGuideBlockId);
  const filteredGuideBlocks = useMemo(() => {
    const q = normalizeText(guideSearch);
    return guideBlocks.filter((block) => {
      if (!visibleGuideBlock(block)) return false;
      if (guideCategory !== "all" && block.category !== guideCategory) return false;
      if (!q) return true;
      const searchable = block.searchable || normalizeText([block.label, block.categoryLabel, block.category, ...(block.positive || []), ...(block.negative || [])].join(" "));
      return matchesSearch(searchable, q);
    }).sort((a, b) => {
      if (a.id === latestCreatedGuideBlockId) return -1;
      if (b.id === latestCreatedGuideBlockId) return 1;
      const pinnedDiff = Number(pinnedGuideBlockIds.includes(b.id)) - Number(pinnedGuideBlockIds.includes(a.id));
      if (pinnedDiff !== 0) return pinnedDiff;
      const usageDiff = Number(guideBlockUsage[b.id]?.count || b.usageCount || b.uses || 0) - Number(guideBlockUsage[a.id]?.count || a.usageCount || a.uses || 0);
      if (usageDiff !== 0) return usageDiff;
      return a.label.localeCompare(b.label, "ja");
    });
  }, [guideBlocks, guideSearch, guideCategory, showSensitive, pinnedGuideBlockIds, guideBlockUsage, latestCreatedGuideBlockId]);
  const pinnedBlocks = pinnedGuideBlockIds.map((id) => guideBlocksById.get(id)).filter(visibleGuideBlock).slice(0, GUIDE_BLOCK_SHORTCUT_LIMIT);
  const recentBlocks = recentGuideBlockIds
    .map((id) => guideBlocksById.get(id))
    .filter(visibleGuideBlock)
    .filter((block, index, list) => list.findIndex((item) => item.id === block.id) === index)
    .slice(0, GUIDE_BLOCK_SHORTCUT_LIMIT);
  const myBlocks = guideBlocks
    .filter((block) => visibleGuideBlock(block) && (block.userCreated || block.category === "custom"))
    .slice(0, GUIDE_BLOCK_SHORTCUT_LIMIT);
  const draftTerms = useMemo(() => {
    return [...draft.positive, ...draft.negative]
      .map((item) => normalizeText(item.en))
      .filter(Boolean);
  }, [draft.positive, draft.negative]);
  const recommendedBlocks = useMemo(() => {
    const seen = new Set();
    const blocks = [];
    const addBlocks = (items) => {
      for (const block of items) {
        if (blocks.length >= 4) return;
        if (!block || seen.has(block.id) || !visibleGuideBlock(block)) continue;
        seen.add(block.id);
        blocks.push(block);
      }
    };
    const draftMatched = filteredGuideBlocks.filter((block) => {
      if (draftTerms.length === 0) return false;
      const searchable = block.searchable || normalizeText([block.label, block.categoryLabel, block.category, ...(block.positive || []), ...(block.negative || [])].join(" "));
      return draftTerms.some((term) => searchable.includes(term));
    });
    const fallbackBlocks = filteredGuideBlocks.filter((block) => {
      return block.id === "negative_base" || block.userCreated || !block.dictionaryGenerated || Number(block.tagCount || 0) <= 16;
    });
    addBlocks([latestCreatedGuideBlock]);
    addBlocks(pinnedBlocks);
    addBlocks(recentBlocks);
    addBlocks(draftMatched);
    addBlocks(fallbackBlocks);
    addBlocks(filteredGuideBlocks);
    return blocks;
  }, [draftTerms, filteredGuideBlocks, pinnedBlocks, recentBlocks, showSensitive, latestCreatedGuideBlock]);

  useEffect(() => {
    setGuideLimit(80);
  }, [guideSearch, guideCategory, showSensitive]);

  return (
    <main className="workspace builder">
      <aside className="sidebar builder-sidebar">
        <h2>追加候補</h2>
        <input className="side-search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} aria-label="Builder tag search" />
        <div className="candidate-list">
          {candidates.map((record) => (
            <button key={record.id} onClick={() => addToDraft(record, "positive")}>
              <strong>{record.en}</strong>
              <span>{record.subcategoryLabel}</span>
            </button>
          ))}
        </div>
        <h2>最近使うタグ</h2>
        <div className="tag-cloud">
          {["looking at viewer", "gentle smile", "natural light", "high detail"].map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </aside>

      <section className="content builder-content">
        <div className="builder-workshop-pane">
          <div className="section-heading">
            <div>
              <h1>Builder Workshop</h1>
              <p>Explore から送ったタグと Guide Blocks を、1つのPrompt Draftで編集します。</p>
            </div>
            <button onClick={clearDraft}>すべてクリア</button>
          </div>
          {conflicts.length > 0 && (
            <div className="warning-box" role="status">
              Positive と Negative の両方にあるタグ: {conflicts.join(", ")}
            </div>
          )}
          <PromptEditor side="positive" title="Positive Prompt" items={draft.positive} text={positiveText} onRemove={removeDraftItem} onMove={moveDraftItem} />
          <PromptEditor side="negative" title="Negative Prompt" items={draft.negative} text={negativeText} onRemove={removeDraftItem} onMove={moveDraftItem} />
        </div>
        <section className="guide-panel builder-guide-pane">
          <div className="panel-head">
            <div>
              <h2>Guide Blocks</h2>
              <p>よく使う表情、構図、品質、Negativeをブロック単位で再利用します。探す前に、固定・最近使用・自作からすぐ追加できます。</p>
            </div>
            <div className="guide-create-controls">
              <label htmlFor="guide-block-draft-name">Guide Block name</label>
              <input
                id="guide-block-draft-name"
                value={guideBlockDraftName}
                onChange={(event) => setGuideBlockDraftName(event.target.value)}
                placeholder="例: 表情セット"
                aria-label="Guide Block name before create"
              />
              <button onClick={createGuideBlockFromDraft}>作成</button>
            </div>
          </div>
          <RecommendedGuideBlocks
            blocks={recommendedBlocks}
            applyGuideBlock={applyGuideBlock}
            copyGuideBlock={copyGuideBlock}
            pinnedGuideBlockIds={pinnedGuideBlockIds}
            toggleGuideBlockPin={toggleGuideBlockPin}
            guideBlockUsage={guideBlockUsage}
          />
          <div className="guide-purpose">
            <strong>何に使う？</strong>
            <span>繰り返し使うタグの組み合わせを、毎回検索せずにBuilderへ戻すためのショートカットです。</span>
          </div>
          <div className="guide-shortcuts">
            <GuideBlockShortcutSection
              title="Pinned"
              description="毎回使う構成"
              blocks={pinnedBlocks}
              emptyText="LibraryからPinするとここに固定されます。"
              applyGuideBlock={applyGuideBlock}
              copyGuideBlock={copyGuideBlock}
              pinnedGuideBlockIds={pinnedGuideBlockIds}
              toggleGuideBlockPin={toggleGuideBlockPin}
              guideBlockUsage={guideBlockUsage}
            />
            <GuideBlockShortcutSection
              title="Recently used"
              description="直近で使ったブロック"
              blocks={recentBlocks}
              emptyText="Guide Blockを追加するとここに履歴が残ります。"
              applyGuideBlock={applyGuideBlock}
              copyGuideBlock={copyGuideBlock}
              pinnedGuideBlockIds={pinnedGuideBlockIds}
              toggleGuideBlockPin={toggleGuideBlockPin}
              guideBlockUsage={guideBlockUsage}
            />
            <GuideBlockShortcutSection
              title="My Blocks"
              description="自分で保存した構成"
              blocks={myBlocks}
              emptyText="Draftをブロック化すると自作ブロックとして出ます。"
              applyGuideBlock={applyGuideBlock}
              copyGuideBlock={copyGuideBlock}
              pinnedGuideBlockIds={pinnedGuideBlockIds}
              toggleGuideBlockPin={toggleGuideBlockPin}
              guideBlockUsage={guideBlockUsage}
            />
          </div>
          <div className="library-heading">
            <div>
              <h3>Library</h3>
              <p>PromptHub本体の全セクション {dictionaryGuideBlockCount.toLocaleString()} 件から、必要なブロックを探して固定できます。</p>
            </div>
          </div>
          <div className="guide-tools">
            <input value={guideSearch} onChange={(event) => setGuideSearch(event.target.value)} placeholder="Guide Blocksを検索" aria-label="Guide Blocks search" />
            <select value={guideCategory} onChange={(event) => setGuideCategory(event.target.value)} aria-label="Guide Blocks category">
              <option value="all">すべてのカテゴリ</option>
              {guideCategories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <span>{filteredGuideBlocks.length.toLocaleString()} blocks</span>
          </div>
          <div className="guide-grid">
            {filteredGuideBlocks.slice(0, guideLimit).map((block) => (
              <GuideBlockCard
                key={block.id}
                block={block}
                applyGuideBlock={applyGuideBlock}
                copyGuideBlock={copyGuideBlock}
                pinned={pinnedGuideBlockIds.includes(block.id)}
                toggleGuideBlockPin={toggleGuideBlockPin}
                guideBlockUsage={guideBlockUsage}
              />
            ))}
          </div>
          {filteredGuideBlocks.length > guideLimit && (
            <div className="show-more">
              <span>{guideLimit.toLocaleString()} / {filteredGuideBlocks.length.toLocaleString()} blocks</span>
              <button onClick={() => setGuideLimit((current) => current + 80)}>Show more blocks</button>
            </div>
          )}
        </section>
      </section>

      <aside className="inspector builder-inspector">
        <section className="panel">
          <h2>出力と保存</h2>
          <OutputBox label="Positive" text={positiveText} />
          <OutputBox label="Negative" text={negativeText} danger />
          <label className="save-name-field">
            <span>Recipe name</span>
            <input
              value={draftRecipeName}
              onChange={(event) => setDraftRecipeName(event.target.value)}
              placeholder="例: 自然光ポートレート"
              aria-label="Recipe name before save"
            />
          </label>
          <div className="stack-actions">
            <button className="primary" onClick={() => copyText(positiveText, "Positive Prompt")}>Copy Positive</button>
            <button onClick={() => copyText(negativeText, "Negative Prompt")}>Copy Negative</button>
            <button onClick={() => copyText(`Positive:\n${positiveText}\n\nNegative:\n${negativeText}`, "Both Prompts")}>Copy Both</button>
            <button onClick={saveRecipe}>Save Recipe</button>
          </div>
          <div className="notice">
            <strong>このブラウザに保存</strong>
            <p>保存したレシピは Collections から読み込めます。</p>
          </div>
        </section>
      </aside>
      <BuilderMobileActionBar positiveText={positiveText} negativeText={negativeText} copyText={copyText} saveRecipe={saveRecipe} />
    </main>
  );
}

function PromptEditor({ side, title, items, text, onRemove, onMove }) {
  const textareaId = `${side}-prompt-output`;
  return (
    <section className={`prompt-editor ${side}`}>
      <div className="editor-head">
        <strong id={`${textareaId}-label`}>{title}</strong>
        <span>{items.length} tags / 2,000</span>
      </div>
      <div className="token-row">
        {items.map((item) => (
          <span key={`${side}-${item.en}`}>
            {item.en}
            <button onClick={() => onMove(side, item.en, -1)} aria-label={`${item.en} を上へ移動`}>↑</button>
            <button onClick={() => onMove(side, item.en, 1)} aria-label={`${item.en} を下へ移動`}>↓</button>
            <button onClick={() => onRemove(side, item.en)} aria-label={`${item.en} を削除`}>x</button>
          </span>
        ))}
      </div>
      <textarea id={textareaId} value={text} readOnly aria-labelledby={`${textareaId}-label`} />
    </section>
  );
}

function OutputBox({ label, text, danger = false }) {
  return (
    <div className={`output-box ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <p>{text || "未設定"}</p>
    </div>
  );
}

function CollectionsView({
  recipes,
  favorites,
  records,
  showSensitive,
  addToDraft,
  toggleFavorite,
  loadRecipe,
  renameRecipe,
  duplicateRecipe,
  deleteRecipe,
  exportRecipe,
  copyRecipe,
  copyText,
  recentPrompts,
  saveRecentAsRecipe,
  deleteRecentPrompt,
  guideBlocks,
  applyGuideBlock,
  deleteGuideBlock,
  editGuideBlock,
  exportGuideBlock,
  userTags,
  addUserTag,
  editUserTag,
  deleteUserTag,
  hideTag,
  exportLocalData,
  setView,
}) {
  const [tagForm, setTagForm] = useState({ en: "", jp: "", note: "", target: "" });
  const [selectedCollectionSection, setSelectedCollectionSection] = useState("recipes");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [recipeNameDraft, setRecipeNameDraft] = useState("");
  const [editingBlockId, setEditingBlockId] = useState("");
  const [blockForm, setBlockForm] = useState({ label: "", positive: "", negative: "" });
  const [editingUserTagId, setEditingUserTagId] = useState("");
  const [userTagEditForm, setUserTagEditForm] = useState({ en: "", jp: "", note: "", target: "" });
  const favoriteRecords = favorites
    .map((en) => records.find((record) => record.en === en) || { en, jp: en, categoryLabel: "Custom" })
    .slice(0, 6);
  const recipeHasSensitive = (recipe) => {
    return [...recipe.positive, ...recipe.negative].some((tag) => {
      return records.some((record) => normalizeText(record.en) === normalizeText(tag) && record.categoryId === "sensitive");
    });
  };
  const visibleRecipes = recipes.filter((recipe) => showSensitive || !recipeHasSensitive(recipe));
  const selectedRecipe = visibleRecipes.find((recipe) => recipe.id === selectedRecipeId) || visibleRecipes[0] || null;

  useEffect(() => {
    if (!selectedRecipe && visibleRecipes.length > 0) {
      setSelectedRecipeId(visibleRecipes[0].id);
    }
  }, [selectedRecipe, visibleRecipes]);

  function startRecipeEdit(recipe) {
    setEditingRecipeId(recipe.id);
    setRecipeNameDraft(recipe.name);
  }

  function saveRecipeEdit(recipe) {
    renameRecipe(recipe, recipeNameDraft);
    setEditingRecipeId("");
    setRecipeNameDraft("");
  }

  function startBlockEdit(block) {
    setEditingBlockId(block.id);
    setBlockForm({
      label: block.label,
      positive: (block.positive || []).join(", "),
      negative: (block.negative || []).join(", "),
    });
  }

  function saveBlockEdit(block) {
    editGuideBlock(block, blockForm);
    setEditingBlockId("");
    setBlockForm({ label: "", positive: "", negative: "" });
  }

  function startUserTagEdit(tag) {
    setEditingUserTagId(tag.id);
    setUserTagEditForm({
      en: tag.en,
      jp: tag.jp || "",
      note: tag.note || "",
      target: tag.target || "",
    });
  }

  function saveUserTagEdit(tag) {
    if (editUserTag(tag, userTagEditForm)) {
      setEditingUserTagId("");
      setUserTagEditForm({ en: "", jp: "", note: "", target: "" });
    }
  }

  return (
    <main className="workspace collections">
      <aside className="sidebar collections-sidebar">
        <h2>コレクション</h2>
        {[
          ["recipes", "保存済みレシピ", recipes.length],
          ["favorites", "お気に入りタグ", favorites.length],
          ["recent", "最近コピー", recentPrompts.length],
          ["blocks", "Guide Blocks", guideBlocks.length],
          ["userTags", "ユーザー追加タグ", userTags.length],
        ].map(([id, label, count]) => (
          <button
            key={id}
            className={`category-button ${selectedCollectionSection === id ? "active" : ""}`}
            aria-pressed={selectedCollectionSection === id}
            onClick={() => setSelectedCollectionSection(id)}
          >
            <span>{label}</span><strong>{count}</strong>
          </button>
        ))}
        <div className="notice strong">
          <strong>ローカル保存のみ</strong>
          <p>すべてこのブラウザに保存されます。JSONでバックアップできます。</p>
        </div>
      </aside>

      <section className="content collections-content">
        <div className="section-heading">
          <div>
            <h1>Collections</h1>
            <p>完成Prompt、よく使うタグ、Guide Blocksを再利用する場所です。</p>
          </div>
          <button onClick={exportLocalData}>Export JSON</button>
        </div>
        {selectedCollectionSection === "recipes" && (
          <table className="recipe-table">
            <thead><tr><th>名前</th><th>更新日</th><th>Positive</th><th>Negative</th><th>操作</th></tr></thead>
            <tbody>
              {visibleRecipes.map((recipe) => {
                const locked = false;
                const editing = editingRecipeId === recipe.id;
                return (
                  <tr
                    key={recipe.id}
                    className={`${locked ? "muted-row" : ""} ${selectedRecipe?.id === recipe.id ? "selected" : ""}`}
                    onClick={() => !locked && setSelectedRecipeId(recipe.id)}
                    onKeyDown={(event) => {
                      if (!locked && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setSelectedRecipeId(recipe.id);
                      }
                    }}
                    tabIndex={locked ? undefined : 0}
                    aria-selected={selectedRecipe?.id === recipe.id}
                  >
                    <td data-label="名前">
                      {editing ? (
                        <input
                          value={recipeNameDraft}
                          onChange={(event) => setRecipeNameDraft(event.target.value)}
                          aria-label="Recipe name"
                        />
                      ) : (
                        <strong>{recipe.name}</strong>
                      )}
                    </td>
                    <td data-label="更新日">{recipe.updatedAt}</td>
                    <td data-label="Positive">{locked ? "Sensitiveを含むため非表示" : recipe.positive.length}</td>
                    <td data-label="Negative">{locked ? "-" : recipe.negative.length}</td>
                    <td data-label="操作">
                      {locked ? (
                        <span className="small-pill">SettingsでSensitive ON</span>
                      ) : (
                        <div className="row-actions row-actions-prioritized">
                          <button className="primary" onClick={(event) => { event.stopPropagation(); loadRecipe(recipe); }}>Load</button>
                          <button onClick={(event) => { event.stopPropagation(); copyRecipe(recipe, "both"); }}>Copy</button>
                          {editing ? (
                            <>
                              <button onClick={(event) => { event.stopPropagation(); saveRecipeEdit(recipe); }}>Save</button>
                              <button onClick={(event) => { event.stopPropagation(); setEditingRecipeId(""); }}>Cancel</button>
                            </>
                          ) : (
                            <ActionMenu>
                              <button onClick={(event) => { event.stopPropagation(); copyRecipe(recipe, "positive"); }}>Copy Positive</button>
                              <button onClick={(event) => { event.stopPropagation(); startRecipeEdit(recipe); }}>Rename</button>
                              <button onClick={(event) => { event.stopPropagation(); duplicateRecipe(recipe); }}>Duplicate</button>
                              <button onClick={(event) => { event.stopPropagation(); exportRecipe(recipe); }}>Export</button>
                              <button className="danger-button" onClick={(event) => { event.stopPropagation(); deleteRecipe(recipe); }}>Delete</button>
                            </ActionMenu>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {selectedCollectionSection === "favorites" && (
        <section className="panel">
          <div className="panel-head"><h2>お気に入りタグ</h2><button onClick={() => setView("explore")}>Exploreで探す</button></div>
          <table className="tag-table compact">
            <tbody>
              {favoriteRecords.map((record) => (
                <tr key={record.en}>
                  <td><strong>{record.en}</strong></td>
                  <td>{record.jp}</td>
                  <td>{record.categoryLabel}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => copyText(record.en, record.en)}>Copy</button>
                      {record.id && <button onClick={() => addToDraft(record, "positive")}>+Builder</button>}
                      <button onClick={() => toggleFavorite(record.en)}>Remove</button>
                      <button onClick={() => hideTag(record.en)}>Hide</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        )}
        {selectedCollectionSection === "recent" && (
        <section className="panel">
          <div className="panel-head"><h2>最近コピー</h2><span>{recentPrompts.length}件</span></div>
          <div className="recent-list">
            {recentPrompts.length === 0 && <p>コピー履歴はまだありません。</p>}
            {recentPrompts.slice(0, 6).map((item) => (
              <div className="recent-item" key={item.id}>
                <strong>{item.label}</strong>
                <p>{item.text}</p>
                <div className="row-actions">
                  <button onClick={() => copyText(item.text, item.label)}>Copy again</button>
                  <button onClick={() => saveRecentAsRecipe(item)}>Save recipe</button>
                  <button onClick={() => deleteRecentPrompt(item.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}
        {selectedCollectionSection === "blocks" && (
        <section className="panel">
          <div className="panel-head"><h2>カスタムGuide Blocks</h2><button onClick={() => setView("builder")}>Builderで作成</button></div>
          <div className="guide-list">
            {guideBlocks.filter((block) => block.userCreated).length === 0 && <p>BuilderでDraftをブロック化するとここに表示されます。</p>}
            {guideBlocks.filter((block) => block.userCreated).map((block) => (
              <div className="guide-list-item" key={block.id}>
                <strong>{block.label}</strong>
                <span>{[...block.positive, ...block.negative].join(", ")}</span>
                <div className="row-actions">
                  <button onClick={() => applyGuideBlock(block)}>Add to Builder</button>
                  <button onClick={() => startBlockEdit(block)}>Edit</button>
                  <button onClick={() => exportGuideBlock(block)}>Export</button>
                  <button onClick={() => deleteGuideBlock(block.id)}>Delete</button>
                </div>
                {editingBlockId === block.id && (
                  <div className="inline-edit-form">
                    <input value={blockForm.label} onChange={(event) => setBlockForm((current) => ({ ...current, label: event.target.value }))} aria-label="Guide Block name" />
                    <textarea value={blockForm.positive} onChange={(event) => setBlockForm((current) => ({ ...current, positive: event.target.value }))} aria-label="Guide Block positive tags" />
                    <textarea value={blockForm.negative} onChange={(event) => setBlockForm((current) => ({ ...current, negative: event.target.value }))} aria-label="Guide Block negative tags" />
                    <div className="row-actions">
                      <button className="primary" onClick={() => saveBlockEdit(block)}>Save</button>
                      <button onClick={() => setEditingBlockId("")}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        )}
        {selectedCollectionSection === "userTags" && (
        <section className="panel">
          <div className="panel-head"><h2>ユーザー追加タグ</h2><span>{userTags.length}件</span></div>
          <div className="user-tag-form">
            <input
              value={tagForm.en}
              onChange={(event) => setTagForm((current) => ({ ...current, en: event.target.value }))}
              placeholder="English tag"
              aria-label="User tag English"
            />
            <input
              value={tagForm.jp}
              onChange={(event) => setTagForm((current) => ({ ...current, jp: event.target.value }))}
              placeholder="日本語説明"
              aria-label="User tag Japanese"
            />
            <input
              value={tagForm.note}
              onChange={(event) => setTagForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="メモ"
              aria-label="User tag note"
            />
            <select value={tagForm.target} onChange={(event) => setTagForm((current) => ({ ...current, target: event.target.value }))} aria-label="User tag target">
              <option value="">target 未設定</option>
              <option value="self">self</option>
              <option value="other">other</option>
              <option value="mutual">mutual</option>
              <option value="object">object</option>
            </select>
            <button
              className="primary"
              onClick={() => {
                if (addUserTag(tagForm)) {
                  setTagForm({ en: "", jp: "", note: "", target: "" });
                }
              }}
            >
              Add tag
            </button>
          </div>
          <div className="guide-list">
            {userTags.length === 0 && <p>辞書にない表現を、自分用タグとして追加できます。</p>}
            {userTags.map((tag) => {
              const record = makeUserRecord(tag);
              const editing = editingUserTagId === tag.id;
              return (
                <div className="guide-list-item" key={tag.id}>
                  <strong>{tag.en}</strong>
                  <span>{tag.jp || tag.en}{tag.note ? ` / ${tag.note}` : ""}</span>
                  <div className="row-actions">
                    <button onClick={() => addToDraft(record, "positive")}>+Builder</button>
                    <button onClick={() => copyText(tag.en, tag.en)}>Copy</button>
                    <button onClick={() => startUserTagEdit(tag)}>Edit</button>
                    <button onClick={() => hideTag(tag.en)}>Hide locally</button>
                    <button onClick={() => deleteUserTag(tag.id)}>Delete</button>
                  </div>
                  {editing && (
                    <div className="inline-edit-form">
                      <input value={userTagEditForm.en} onChange={(event) => setUserTagEditForm((current) => ({ ...current, en: event.target.value }))} aria-label="Edit user tag English" />
                      <input value={userTagEditForm.jp} onChange={(event) => setUserTagEditForm((current) => ({ ...current, jp: event.target.value }))} aria-label="Edit user tag Japanese" />
                      <input value={userTagEditForm.note} onChange={(event) => setUserTagEditForm((current) => ({ ...current, note: event.target.value }))} aria-label="Edit user tag note" />
                      <select value={userTagEditForm.target} onChange={(event) => setUserTagEditForm((current) => ({ ...current, target: event.target.value }))} aria-label="Edit user tag target">
                        <option value="">target 未設定</option>
                        <option value="self">self</option>
                        <option value="other">other</option>
                        <option value="mutual">mutual</option>
                        <option value="object">object</option>
                      </select>
                      <div className="row-actions">
                        <button className="primary" onClick={() => saveUserTagEdit(tag)}>Save</button>
                        <button onClick={() => setEditingUserTagId("")}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        )}
      </section>

      <aside className="inspector collections-inspector">
        {selectedRecipe && (
          <section className="panel">
            <h2>選択中のレシピ</h2>
            <h3 className="tag-title">{selectedRecipe.name}</h3>
            <OutputBox label="Positive" text={selectedRecipe.positive.join(", ")} />
            <OutputBox label="Negative" text={selectedRecipe.negative.join(", ")} danger />
            <div className="stack-actions">
              <button className="primary" onClick={() => loadRecipe(selectedRecipe)}>Builderに読み込む</button>
              <button onClick={() => copyText(selectedRecipe.positive.join(", "), "Recipe Positive")}>Copy Positive</button>
              <button onClick={() => copyText(selectedRecipe.negative.join(", "), "Recipe Negative")}>Copy Negative</button>
            </div>
          </section>
        )}
      </aside>
    </main>
  );
}

function LearnView() {
  return (
    <main className="simple-page">
      <h1>Learn</h1>
      <div className="learn-grid">
        {[
          ["PromptHub", "日本語で発想した内容を、英語タグとして探して組み立てる作業場です。"],
          ["検索のコツ", "短い単語、カテゴリ名、target、sourceを組み合わせると候補を絞りやすくなります。"],
          ["Positive / Negative", "入れたい要素はPositive、避けたい崩れや不要要素はNegativeに分けます。"],
          ["target", "self / other / mutual / object は、タグが誰や何に向くかの目安です。"],
          ["Guide Blocks", "よく使うタグや組み合わせを、Builder内の時短パーツとして使います。"],
          ["保存とバックアップ", "レシピ、Guide Blocks、ユーザー追加タグはブラウザ内に保存し、JSONでバックアップできます。"],
          ["Sensitive", "初期状態はOFF。SettingsでONにしたときだけ検索対象に含めます。"],
          ["データ出典と限界", "sourceやtarget noteを確認し、必要に応じて自分用タグで補完してください。"],
        ].map(([title, body]) => (
          <section className="panel" key={title}><h2>{title}</h2><p>{body}</p></section>
        ))}
      </div>
    </main>
  );
}

function SettingsView({
  showSensitive,
  setShowSensitive,
  density,
  setDensity,
  languageEmphasis,
  setLanguageEmphasis,
  inspectorMode,
  setInspectorMode,
  exportLocalData,
  importLocalData,
  resetLocalData,
  syncSettings,
  syncStatus,
  updateSyncSetting,
  pullSync,
  pushSync,
  dataState,
  legacyKeysDetected,
  migrationNotice,
  migrateLegacyData,
  hiddenTags,
  unhideTag,
  clearHiddenTags,
}) {
  return (
    <main className="settings-page">
      <aside className="sidebar">
        <h2>Settings</h2>
        <button className="category-button active"><span>表示と安全性</span></button>
        <button className="category-button"><span>ローカルデータ</span></button>
        <button className="category-button"><span>バージョン</span></button>
      </aside>
      <section className="settings-content">
        <div className="settings-row">
          <div>
            <h2>センシティブ語彙</h2>
            <p>OFFの間はカテゴリと検索結果から除外します。</p>
          </div>
          <div className="segmented">
            <button className={!showSensitive ? "active" : ""} aria-pressed={!showSensitive} onClick={() => setShowSensitive(false)}>OFF</button>
            <button className={showSensitive ? "active" : ""} aria-pressed={showSensitive} onClick={() => setShowSensitive(true)}>ON</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h2>ローカルデータ</h2>
            <p>お気に入り、レシピ、Draft、Guide Blocks、ユーザー追加タグはこのブラウザに保存されます。</p>
          </div>
          <div className="button-group">
            <button onClick={exportLocalData}>Export all JSON</button>
            <label className="file-button">
              Import JSON
              <input type="file" accept="application/json,.json" onChange={importLocalData} />
            </label>
          </div>
        </div>
        <div className="settings-row sync-row">
          <div>
            <h2>Private cloud sync</h2>
            <p>{syncStatus.message}</p>
            <div className="sync-fields">
              <label>
                <span>Sync URL</span>
                <input
                  value={syncSettings.endpoint}
                  onChange={(event) => updateSyncSetting("endpoint", event.target.value)}
                  placeholder={SYNC_DEFAULT_ENDPOINT}
                />
              </label>
              <label>
                <span>User</span>
                <input
                  value={syncSettings.username}
                  onChange={(event) => updateSyncSetting("username", event.target.value)}
                  autoComplete="username"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={syncSettings.password}
                  onChange={(event) => updateSyncSetting("password", event.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </div>
          </div>
          <div className="sync-actions">
            <div className="segmented">
              <button
                className={syncSettings.enabled ? "active" : ""}
                aria-pressed={syncSettings.enabled}
                onClick={() => updateSyncSetting("enabled", true)}
              >
                ON
              </button>
              <button
                className={!syncSettings.enabled ? "active" : ""}
                aria-pressed={!syncSettings.enabled}
                onClick={() => updateSyncSetting("enabled", false)}
              >
                OFF
              </button>
            </div>
            <div className="button-group">
              <button onClick={pullSync} disabled={!syncSettings.enabled}>Pull</button>
              <button onClick={pushSync} disabled={!syncSettings.enabled}>Push now</button>
            </div>
            <span className={`pill sync-pill ${syncStatus.state}`}>{syncStatus.state}</span>
          </div>
        </div>
        <div className="settings-row danger-zone">
          <div>
            <h2>Danger zone</h2>
            <p>このブラウザに保存したレシピ、Draft、Guide Blocks、ユーザー追加タグをすべて削除します。</p>
          </div>
          <button className="danger-button" onClick={resetLocalData}>Reset local data</button>
        </div>
        <div className="settings-row">
          <div>
            <h2>表示密度</h2>
            <p>一覧と作業パネルの余白を切り替えます。</p>
          </div>
          <div className="segmented">
            <button className={density === "comfortable" ? "active" : ""} aria-pressed={density === "comfortable"} onClick={() => setDensity("comfortable")}>Comfortable</button>
            <button className={density === "compact" ? "active" : ""} aria-pressed={density === "compact"} onClick={() => setDensity("compact")}>Compact</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h2>表示言語</h2>
            <p>検索結果と詳細で、English tag と日本語説明のどちらを先に読むかを切り替えます。</p>
          </div>
          <div className="segmented">
            <button className={languageEmphasis === "en" ? "active" : ""} aria-pressed={languageEmphasis === "en"} onClick={() => setLanguageEmphasis("en")}>English first</button>
            <button className={languageEmphasis === "jp" ? "active" : ""} aria-pressed={languageEmphasis === "jp"} onClick={() => setLanguageEmphasis("jp")}>日本語優先</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h2>詳細ペイン</h2>
            <p>デスクトップ幅でタグ詳細や出力ペインを常時出すか、画面幅に合わせて下段へ逃がすかを切り替えます。</p>
          </div>
          <div className="segmented">
            <button className={inspectorMode === "auto" ? "active" : ""} aria-pressed={inspectorMode === "auto"} onClick={() => setInspectorMode("auto")}>Auto</button>
            <button className={inspectorMode === "always" ? "active" : ""} aria-pressed={inspectorMode === "always"} onClick={() => setInspectorMode("always")}>Always open</button>
          </div>
        </div>
        <div className="settings-row hidden-tags-row">
          <div>
            <h2>ローカル非表示タグ</h2>
            <p>{hiddenTags.length > 0 ? `${hiddenTags.length}件を検索結果とBuilder候補から除外しています。` : "非表示にしているタグはありません。"}</p>
            {hiddenTags.length > 0 && (
              <div className="hidden-tag-list">
                {hiddenTags.slice(0, 10).map((tag) => (
                  <button key={tag} onClick={() => unhideTag(tag)}>{tag} を解除</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={clearHiddenTags} disabled={hiddenTags.length === 0}>Clear hidden tags</button>
        </div>
        <div className="settings-row legacy-row">
          <div>
            <h2>旧PromptHubデータ</h2>
            <p>
              {legacyKeysDetected.length > 0
                ? `旧データ検出済み: ${legacyKeysDetected.join(", ")}`
                : "旧アプリの保存データは検出されていません。"}
            </p>
            {migrationNotice && <p className="small-note">{migrationNotice}</p>}
          </div>
          <button onClick={migrateLegacyData} disabled={legacyKeysDetected.length === 0}>Import legacy data</button>
        </div>
        <div className="settings-row">
          <div>
            <h2>データ状態</h2>
            <p>{dataState.source === "compiled" ? "compiled tags.json を読み込み中" : "サンプルデータで動作中"}</p>
            <p>
              {dataState.data.count ? `${dataState.data.count.toLocaleString()} tags` : `${(dataState.data.categories || []).length} categories`}
              {dataState.data.generated_at ? ` / generated ${dataState.data.generated_at}` : ""}
              {dataState.url ? ` / ${dataState.url}` : ""}
            </p>
          </div>
          <span className="pill">{dataState.status}</span>
        </div>
      </section>
    </main>
  );
}
