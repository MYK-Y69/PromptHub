/* PromptHub – app.js */

// ---- Config ----
const COMPILED = {
  safe: "../data/dictionary/compiled/safe.json?v=d1784f3",
  full: "../data/dictionary/compiled/full.json?v=d1784f3",
  tags: "../data/dictionary/compiled/tags.json?v=d1784f3",
};
const SENSITIVE_JSON = "../data/dictionary/compiled/tags_sensitive.json?v=d1784f3";
let activeMode = "safe";

// ---- State ----
let allCategories = [];      // [{ key, label, items }]
let activeCatKey = null;
let activeTag = null;
let searchQuery = "";
let selectedIds = new Set();
let groupOpenState = { neutral: false }; // accordion: false=closed, undefined/true=open
let builderTags = [];        // Prompt Builder: ordered list of en tags
let subcatJumpExpanded = false; // subcat jump bar: false=collapsed(1行), true=expanded(wrap)

// ---- Section → major mapping (used in sidebar grouping & jump-btn color coding) ----
const SECTION_TO_MAJOR = {
  // camera work
  camera: "camera", camera_comp: "camera", angle: "camera", pov: "camera",
  gaze: "camera", frame: "camera", tech2: "camera",

  // composition
  count: "comp", relationship: "comp", misc_people: "comp", layout: "comp",
  focus: "comp", orientation: "comp",

  // expressions / face parts / emotions
  expression: "expr", emotion: "expr", reaction: "expr",
  expr_misc: "expr", expr_evil: "expr", expr_smile: "expr",
  mood_bad: "expr", anger: "expr", sad: "expr", fear: "expr", tired: "expr",
  confusion: "expr", anxiety: "expr", trouble: "expr",
  eye: "expr", eye_empty: "expr", mouth: "expr", teeth: "expr", brow: "expr",
  nose: "expr", lip: "expr", face_feature: "expr", mark: "expr",

  // pose
  pose: "pose", pose_hand: "pose", pose_arm: "pose", misc_pose: "pose", other_pose: "pose",
  legs: "pose", feet: "pose", torso: "pose",

  // actions / motions
  action: "act", prep: "act", hold: "act", rest: "act", sit: "act", stand: "act",
  kneel: "act", shake: "act", point: "act", support: "act",
  touch_env: "act", touch_self: "act", legmove: "act",

  // pose / action (data2)
  pose_action: "act",

  // clothing / body (data2 SAFE/FULL + TAGS)
  body_features: "cloth", body: "cloth", accessories: "cloth",
  clothing: "cloth", clothes: "cloth",

  // furry / pony (data2)
  e621_pony: "style",

  // background
  background: "bg",

  // style / rendering / text / meta
  style: "style", style2: "style", quality: "style", quality2: "style",
  paint: "style", makeup: "style", artifact: "style", tech: "style",
  qc: "style", effect: "style", effect2: "style", meta_text: "style",
  manga_panel: "style", manga_read: "style", cover: "style", doc: "style",
  ui: "style", revision: "style", shape: "style", dup: "style",
  uncat: "style", sexpos: "style",
};

// ---- Section label (JP) for non-sensitive jump buttons ----
const SECTION_LABEL_JP = {
  "camera_comp": "カメラ構図",
  "camera":      "カメラ",
  "angle":       "アングル",
  "gaze":        "視線",
  "pov":         "視点",
  "focus":       "焦点",
  "layout":      "レイアウト",
  "frame":       "フレーミング",
  "composition": "構図",
  "relationship":"関係",
  "misc_people": "人物（その他）",
  "clothes":       "服装",
  "clothing":      "服装",
  "body_features": "身体特徴",
  "body":          "身体特徴",
  "accessories":   "アクセサリー",
  "pose_action":   "ポーズ・動作",
  "e621_pony":     "e621/Pony",
  "count":       "人数/数",
  "quality":     "品質",
  "effect":      "効果",
  "style":       "スタイル",
  "background":  "背景",
  "tech2":       "技術",
  "manga_panel": "漫画コマ",
  "manga_read":  "読み",
  "meta_text":   "文字/メタ",
  "orientation": "向き",
  "qc":          "QC",
  "artifact":    "アーティファクト",
  "revision":    "改稿",
  "dup":         "重複",
  "shape":       "形状",
  "ui":          "UI",
  "doc":         "ドキュメント",
  "cover":       "カバー",
  "effect2":     "効果2",
  "quality2":    "品質2",
  "style2":      "スタイル2",
  "uncat":       "未分類",
  "sexpos":      "体勢/姿勢",
  "pose_hand":   "手のポーズ",
  "pose_arm":    "腕のポーズ",
  "legs":        "脚",
  "feet":        "足",
  "torso":       "胴体",
  "other_pose":  "その他ポーズ",
  "misc_pose":   "ポーズ（その他）",
  "touch_self":  "自分に触れる",
  "touch_env":   "環境に触れる",
  "rest":        "休憩/横たわる",
  "sit":         "座る",
  "stand":       "立つ",
  "kneel":       "ひざ",
  "hold":        "持つ",
  "prep":        "準備",
  "point":       "指差し",
  "support":     "支える",
  "action":      "動作",
  "trouble":     "トラブル",
  "mouth":       "口",
  "eye":         "目",
  "brow":        "眉",
  "nose":        "鼻",
  "teeth":       "歯",
  "lip":         "唇",
  "face_feature":"顔特徴",
  "expr_smile":  "表情：笑い",
  "expr_evil":   "表情：悪い",
  "expr_misc":   "表情：その他",
  "eye_empty":   "目：空虚",
  "tired":       "疲れ",
  "mood_bad":    "不機嫌",
  "anger":       "怒り",
  "confusion":   "困惑",
  "anxiety":     "不安",
  "fear":        "恐怖",
  "sad":         "悲しみ",
  "shake":       "揺れ",
  "makeup":      "メイク",
  "paint":       "ペイント",
  "mark":        "マーク",
};

// ---- DOM refs ----
const categoryList  = document.getElementById("category-list");
const tagChips      = document.getElementById("tag-chips");
const cardGrid      = document.getElementById("card-grid");
const emptyMsg      = document.getElementById("empty-msg");
const searchInput   = document.getElementById("search");
const copySelected  = document.getElementById("copy-selected");
const selectedCount = document.getElementById("selected-count");
const toast         = document.getElementById("toast");
const subcatJumpContainer = document.getElementById("subcat-jump-container");
const builderChips  = document.getElementById("builder-chips");
const builderOutput = document.getElementById("builder-output");
const builderCopy   = document.getElementById("builder-copy");
const builderClear  = document.getElementById("builder-clear");

// ---- Group definitions ----
const EMOTION_GROUPS = [
  { key: "joy",        emoji: "😊", label: "Joy" },
  { key: "anger",      emoji: "😡", label: "Anger" },
  { key: "sadness",    emoji: "😢", label: "Sadness" },
  { key: "surprise",   emoji: "😲", label: "Surprise" },
  { key: "shy",        emoji: "😳", label: "Shy" },
  { key: "determined", emoji: "😤", label: "Determined" },
  { key: "smug",       emoji: "😏", label: "Smug" },
  { key: "tired",      emoji: "😴", label: "Tired" },
  { key: "confused",   emoji: "😵", label: "Confused" },
  { key: "neutral",    emoji: "😐", label: "Neutral" },
  { key: "other",      emoji: "📦", label: "Other" },
];

const PARTS_GROUPS = [
  { key: "eye",          emoji: "👁",  label: "Eye" },
  { key: "mouth",        emoji: "👄",  label: "Mouth" },
  { key: "teeth",        emoji: "🦷",  label: "Teeth" },
  { key: "brow",         emoji: "〰️",  label: "Brow" },
  { key: "sweat",        emoji: "💧",  label: "Sweat" },
  { key: "blush_detail", emoji: "🌸",  label: "Blush" },
];

const REACTION_GROUPS = [
  { key: "arousal",     emoji: "🔥",  label: "Arousal" },
  { key: "blush_detail",emoji: "🌸",  label: "Blush" },
  { key: "sweat",       emoji: "💧",  label: "Sweat" },
  { key: "breathing",   emoji: "💨",  label: "Breathing" },
  { key: "saliva",      emoji: "💦",  label: "Saliva" },
  { key: "heat_steam",  emoji: "♨️",  label: "Heat / Steam" },
  { key: "react_other", emoji: "💫",  label: "Other" },
];

const FACE_MAKEUP_GROUPS = [
  { key: "makeup",      emoji: "💄",  label: "Makeup" },
  { key: "lips",        emoji: "💋",  label: "Lips" },
  { key: "lipstick",    emoji: "💄",  label: "Lipstick" },
  { key: "lipgloss",    emoji: "✨",  label: "Lipgloss" },
  { key: "eyelashes",   emoji: "🪄",  label: "Eyelashes" },
  { key: "eyeliner",    emoji: "🖊️",  label: "Eyeliner" },
  { key: "eyeshadow",   emoji: "👁",  label: "Eyeshadow" },
  { key: "mascara",     emoji: "💫",  label: "Mascara" },
  { key: "freckles",    emoji: "🔴",  label: "Freckles" },
  { key: "mole",        emoji: "⚫",  label: "Mole" },
  { key: "facial_mark", emoji: "🎭",  label: "Facial Mark" },
  { key: "facepaint",   emoji: "🎨",  label: "Facepaint" },
  { key: "bodypaint",   emoji: "🖌️",  label: "Bodypaint" },
];

// ---- Mode helpers ----
function normalizeCategory(data, mode) {
  return {
    key:   data.key   ?? "expression",
    label: data.label ?? (mode === "full" ? "Expression (FULL)" : "Expression (SAFE)"),
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function normalizeCategories(data, mode) {
  let cats;
  if (Array.isArray(data.categories) && data.categories.length > 0) {
    cats = data.categories.map(cat => {
    const start = Number.isInteger(cat.start) ? cat.start : null;
    const end   = Number.isInteger(cat.end)   ? cat.end   : null;

    // Prefer explicit cat.items if present, else rebuild from [start,end) over data.items
    let items = Array.isArray(cat.items) ? cat.items : [];
    if ((!items || items.length === 0) && start !== null && end !== null && Array.isArray(data.items)) {
      items = data.items.slice(start, end);
    }

    return {
      key:   cat.key   ?? "unknown",
      label: cat.label ?? cat.key ?? "Unknown",
      items,
    };
  });
  } else {
    cats = [normalizeCategory(data, mode)];
  }

  // ALL カテゴリ：全カテゴリの items を結合し id でユニーク化
  const seen = new Set();
  const allItems = cats
    .flatMap(c => c.items)
    .filter(x => x && x.id && !seen.has(x.id) && (seen.add(x.id), true));
  const allCat = { key: "__all__", label: `ALL (${mode.toUpperCase()})`, items: allItems };

  return [allCat, ...cats];
}

let modeLoading = false;

async function loadMode(mode) {
  if (modeLoading) return;
  modeLoading = true;
  let data;
  try {
    data = await fetch(COMPILED[mode]).then(r => r.json());
  } catch (e) {
    console.warn(`Failed to load ${COMPILED[mode]}:`, e);
    cardGrid.innerHTML = "<p style='color:#888;padding:40px'>辞書ファイルが見つかりません。</p>";
    modeLoading = false;
    return;
  }
  activeMode = mode;
  allCategories = normalizeCategories(data, mode);
  renderSidebar();
  // TAGSモードは renderSidebar が allCategories を再構築するので "__all__" で初期化
  const initKey = mode === "tags" ? "__all__" : allCategories[0].key;
  selectCategory(initKey);
  document.querySelectorAll(".mode-btn").forEach(btn => {
    const on = btn.dataset.mode === mode;
    btn.style.background  = on ? "#4a9eff" : "#2a2a3e";
    btn.style.color       = on ? "#fff"    : "#aaa";
    btn.style.borderColor = on ? "#4a9eff" : "#444";
  });
  modeLoading = false;
}

// ---- Boot ----
(async function init() {
  // SAFE / FULL toggle bar を body 先頭に挿入
  const modeBar = document.createElement("div");
  modeBar.style.cssText = "display:flex;gap:8px;padding:6px 14px;background:#111827;border-bottom:1px solid #2a2a3e;";
  ["safe", "full", "tags"].forEach(m => {
    const btn = document.createElement("button");
    btn.className = "mode-btn";
    btn.dataset.mode = m;
    btn.textContent = m.toUpperCase();
    btn.style.cssText = "padding:3px 14px;border:1px solid #444;background:#2a2a3e;color:#aaa;cursor:pointer;border-radius:4px;font-size:11px;font-weight:600;";
    btn.addEventListener("click", () => loadMode(m));
    modeBar.appendChild(btn);
  });
  document.body.insertBefore(modeBar, document.body.firstChild);

  await loadMode("tags");
  bindEvents();
  renderBuilder();
})();

// ---- Sidebar ----
function renderSidebar() {
  categoryList.innerHTML = "";

  // TAGS mode: "センシティブ" + normal major categories
  if (activeMode === "tags") {
    const MAJORS = [
      { key: "camera", label: "カメラワーク" },
      { key: "pose",   label: "ポーズ" },
      { key: "expr",   label: "表情" },
      { key: "act",    label: "動作" },
      { key: "cloth",  label: "服装" },
      { key: "comp",   label: "構図" },
      { key: "bg",     label: "背景" },
      { key: "style",  label: "スタイル" },
    ];

    const allCat = allCategories.find(c => c.key === "__all__") || { items: [] };

    // Build pseudo categories for majors
    const pseudoCats = MAJORS.map(m => ({ key: m.key, label: m.label, items: [] }));
    for (const it of (allCat.items || [])) {
      const ts = Array.isArray(it.tags) ? it.tags : [];
      let major = null;
      for (const t of ts) {
        if (SECTION_TO_MAJOR[t]) { major = SECTION_TO_MAJOR[t]; break; }
      }
      if (!major) major = "style";
      const cat = pseudoCats.find(c => c.key === major);
      if (cat) cat.items.push(it);
    }

    // allCategories に __sensitive__ と __all__ を含めた完全なリストを常に保持
    allCategories = [
      { key: "__sensitive__", label: "センシティブ", items: [] },
      { key: "__all__",       label: "ALL (TAGS)",   items: allCat.items },
      ...pseudoCats,
    ];

    // "センシティブ" — lazy load tags_sensitive.json on first click
    {
      const el = document.createElement("div");
      el.className = "cat-item";
      el.dataset.key = "__sensitive__";
      el.innerHTML = `<span>センシティブ</span><span class="cat-count" id="sensitive-count">…</span>`;
      el.addEventListener("click", async () => {
        const cat = allCategories.find(c => c.key === "__sensitive__");
        if (cat && cat.items.length === 0) {
          try {
            const data = await fetch(SENSITIVE_JSON).then(r => r.json());
            cat.items = data.items || [];
            const badge = document.getElementById("sensitive-count");
            if (badge) badge.textContent = cat.items.length;
          } catch (e) {
            console.warn("Failed to load tags_sensitive.json:", e);
          }
        }
        selectCategory("__sensitive__");
      });
      categoryList.appendChild(el);

      // Preload count on sidebar render
      fetch(SENSITIVE_JSON).then(r => r.json()).then(data => {
        const items = data.items || [];
        const cat = allCategories.find(c => c.key === "__sensitive__");
        if (cat) cat.items = items;
        const badge = document.getElementById("sensitive-count");
        if (badge) badge.textContent = items.length;
      }).catch(() => {
        const badge = document.getElementById("sensitive-count");
        if (badge) badge.textContent = "0";
      });
    }

    // "すべて" (__all__)
    {
      const el = document.createElement("div");
      el.className = "cat-item";
      el.dataset.key = "__all__";
      el.innerHTML = `<span>すべて</span><span class="cat-count">${allCat.items.length}</span>`;
      el.addEventListener("click", () => selectCategory("__all__"));
      categoryList.appendChild(el);
    }

    // Normal major categories
    pseudoCats.forEach(cat => {
      const el = document.createElement("div");
      el.className = "cat-item";
      el.dataset.key = cat.key;
      el.innerHTML = `<span>${cat.label}</span><span class="cat-count">${cat.items.length}</span>`;
      el.addEventListener("click", () => selectCategory(cat.key));
      categoryList.appendChild(el);
    });

    return;
  }

  // default (safe/full)
  allCategories.forEach(cat => {
    const el = document.createElement("div");
    el.className = "cat-item";
    el.dataset.key = cat.key;
    el.innerHTML = `<span>${cat.label}</span><span class="cat-count">${cat.items.length}</span>`;
    el.addEventListener("click", () => selectCategory(cat.key));
    categoryList.appendChild(el);
  });
}

function selectCategory(key) {
  subcatJumpExpanded = false;  // カテゴリ変更時はジャンプバーを折りたたみに戻す
  activeCatKey = key;
  activeTag = null;
  searchQuery = "";
  searchInput.value = "";
  selectedIds.clear();
  updateSelectedUI();

  document.querySelectorAll(".cat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });

  renderTagChips();
  renderCards();
}

// ---- Tag chips ----
function renderTagChips() {
  tagChips.innerHTML = "";

  // TAGSモードはセクション見出しで代替するのでチップ不要
  if (activeMode === "tags") return;

  const cat = currentCategory();
  if (!cat) return;

  // ---- settings ----
  const HIDE_SINGLETONS = true;   // hide tags with count=1 (noise)
  const DEFAULT_LIMIT   = 20;     // show top N by default
  const storageKey = `tagchips_expanded_${activeMode}_${activeCatKey}`;
  const expanded = localStorage.getItem(storageKey) === "1";

  // count tags
  const tagCounts = {};
  cat.items.forEach(item => {
    safeTags(item).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });

  let tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (HIDE_SINGLETONS) tags = tags.filter(([, c]) => c > 1);

  if (tags.length === 0) return;

  const total = tags.length;
  const shown = expanded ? tags : tags.slice(0, DEFAULT_LIMIT);

  // render chips
  shown.forEach(([tag, count]) => {
    const el = document.createElement("span");
    el.className = "chip" + (tag === activeTag ? " active" : "");
    el.textContent = `${tag} (${count})`;
    el.addEventListener("click", () => toggleTag(tag));
    tagChips.appendChild(el);
  });

  // more/less toggle (only if there are hidden chips)
  if (total > shown.length) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-more";
    btn.textContent = expanded ? "閉じる" : `もっと見る (+${total - shown.length})`;
    btn.style.cssText = "margin-left:8px;padding:4px 10px;border:1px solid #d1d5db;border-radius:999px;background:#fff;color:#111;cursor:pointer;font-size:12px;";
    btn.addEventListener("click", () => {
      localStorage.setItem(storageKey, expanded ? "0" : "1");
      renderTagChips();
    });
    tagChips.appendChild(btn);
  } else if (expanded && total > DEFAULT_LIMIT) {
    // expanded but nothing hidden due to filters → still allow collapsing
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-more";
    btn.textContent = "閉じる";
    btn.style.cssText = "margin-left:8px;padding:4px 10px;border:1px solid #d1d5db;border-radius:999px;background:#fff;color:#111;cursor:pointer;font-size:12px;";
    btn.addEventListener("click", () => {
      localStorage.setItem(storageKey, "0");
      renderTagChips();
    });
    tagChips.appendChild(btn);
  }
}

function toggleTag(tag) {
  activeTag = activeTag === tag ? null : tag;
  document.querySelectorAll(".chip").forEach(el => {
    const chipTag = el.textContent.replace(/\s*\(\d+\)$/, "");
    el.classList.toggle("active", chipTag === activeTag);
  });
  renderCards();
}

// ---- Cards ----
function currentCategory() {
  return allCategories.find(c => c.key === activeCatKey);
}

function filteredItems() {
  const cat = currentCategory();
  if (!cat) return [];

  let items = cat.items;

  if (activeTag) {
    items = items.filter(i => safeTags(i).includes(activeTag));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i =>
      safeText(i.jp).toLowerCase().includes(q) ||
      safeText(i.en).toLowerCase().includes(q) ||
      safeTags(i).some(t => t.toLowerCase().includes(q))
    );
  }

  return items;
}

// ---- Expression unified grouping ----
// Priority: reaction → emotion subtag → parts → face/makeup → neutral → other
function groupAllExpression(items) {
  const emotionBuckets   = Object.fromEntries(EMOTION_GROUPS.map(g => [g.key, []]));
  const reactionBuckets  = Object.fromEntries(REACTION_GROUPS.map(g => [g.key, []]));
  const partsBuckets     = Object.fromEntries(PARTS_GROUPS.map(g => [g.key, []]));
  const faceBuckets      = Object.fromEntries(FACE_MAKEUP_GROUPS.map(g => [g.key, []]));

  const emotionSubtags = EMOTION_GROUPS
    .filter(g => g.key !== "neutral" && g.key !== "other")
    .map(g => g.key);

  for (const item of items) {
    const tags = safeTags(item);

    // 0. tags.json 形式: tags[0] が直接 emotion key（またはエイリアス）の場合（"emotion" タグなし）
    const SECTION_EMOTION_MAP = { sad: "sadness", confusion: "confused", fear: "other" };
    const sectionKey = tags[0];
    const emotionKey = SECTION_EMOTION_MAP[sectionKey] ?? sectionKey;
    if (emotionBuckets.hasOwnProperty(emotionKey)) {
      emotionBuckets[emotionKey].push(item);
      continue;
    }

    // 1. reaction タグあり → Reaction セクション
    if (tags.includes("reaction")) {
      const match = REACTION_GROUPS.find(g => g.key !== "react_other" && tags.includes(g.key));
      reactionBuckets[match ? match.key : "react_other"].push(item);
      continue;
    }

    // 2. emotion タグあり → Emotion セクション
    if (tags.includes("emotion")) {
      const match = EMOTION_GROUPS.find(g => g.key !== "neutral" && g.key !== "other" && tags.includes(g.key));
      if (match) { emotionBuckets[match.key].push(item); continue; }
      emotionBuckets[tags.includes("neutral") ? "neutral" : "other"].push(item);
      continue;
    }

    // 3. parts タグ（emotion サブタグを持たないもの）
    if (!tags.some(t => emotionSubtags.includes(t))) {
      const partsMatch = PARTS_GROUPS.find(g => tags.includes(g.key));
      if (partsMatch) { partsBuckets[partsMatch.key].push(item); continue; }
    }

    // 4. face/makeup タグ
    const faceMatch = FACE_MAKEUP_GROUPS.find(g => tags.includes(g.key));
    if (faceMatch) { faceBuckets[faceMatch.key].push(item); continue; }

    // 5. その他
    emotionBuckets.other.push(item);
  }

  return {
    emotionGroups: EMOTION_GROUPS
      .map(g => ({ ...g, items: emotionBuckets[g.key] }))
      .filter(g => g.items.length > 0),
    reactionGroups: REACTION_GROUPS
      .map(g => ({ ...g, items: reactionBuckets[g.key] }))
      .filter(g => g.items.length > 0),
    partsGroups: PARTS_GROUPS
      .map(g => ({ ...g, items: partsBuckets[g.key] }))
      .filter(g => g.items.length > 0),
    faceGroups: FACE_MAKEUP_GROUPS
      .map(g => ({ ...g, items: faceBuckets[g.key] }))
      .filter(g => g.items.length > 0),
  };
}

// ---- Expression rendering (unified agenda + accordion groups) ----
function renderExpressionCards(items, searching) {
  const { emotionGroups, reactionGroups, partsGroups, faceGroups } = groupAllExpression(items);

  const sections = [
    { label: "Emotion",      groups: emotionGroups },
    { label: "Reaction",     groups: reactionGroups },
    { label: "Parts",        groups: partsGroups },
    { label: "Face & Makeup", groups: faceGroups },
  ].filter(s => s.groups.length > 0);

  if (sections.length === 0) return;

  // Unified agenda with section labels
  const agenda = document.createElement("div");
  agenda.className = "emotion-agenda";

  sections.forEach((section, si) => {
    // セクションブロック（見出し行 + ボタン行を縦に並べる）
    const block = document.createElement("div");
    block.style.cssText = si > 0 ? "margin-top:16px;" : "";

    // 見出し行（単独行）
    const lbl = document.createElement("div");
    lbl.textContent = section.label;
    lbl.style.cssText = [
      "display:block",
      "padding:2px 4px",
      "font-size:10px",
      "font-weight:700",
      "color:#4a9eff",
      "text-transform:uppercase",
      "letter-spacing:.08em",
      "margin-bottom:4px",
    ].join(";");
    block.appendChild(lbl);

    // ボタン行（見出しの下に別行）
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";

    section.groups.forEach(({ key, emoji, label }) => {
      const btn = document.createElement("button");
      btn.className = "emotion-agenda-item";
      btn.textContent = `${emoji} ${label}`;
      btn.addEventListener("click", () => {
        const id = "grp-" + key;
        if (!searching && groupOpenState[key] === false) {
          groupOpenState[key] = true;
          renderCards();
          requestAnimationFrame(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        } else {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      btnRow.appendChild(btn);
    });

    block.appendChild(btnRow);
    agenda.appendChild(block);
  });

  cardGrid.appendChild(agenda);

  // Section headers + accordion groups
  sections.forEach(section => {
    const sectionEl = document.createElement("div");
    sectionEl.style.cssText = [
      "padding:8px 12px 4px",
      "font-size:11px",
      "font-weight:700",
      "color:#4a9eff",
      "text-transform:uppercase",
      "letter-spacing:.08em",
      "border-bottom:1px solid #2a2a3e",
      "margin-top:8px",
    ].join(";");
    sectionEl.textContent = section.label;
    cardGrid.appendChild(sectionEl);

    section.groups.forEach(({ key, emoji, label, items: gItems }) => {
      const isOpen = searching || groupOpenState[key] !== false;

      const header = document.createElement("div");
      header.className = "emotion-group-header";
      header.id = "grp-" + key;

      const title = document.createElement("span");
      title.textContent = `${emoji} ${label}`;

      const toggle = document.createElement("span");
      toggle.className = "emotion-group-toggle";
      toggle.textContent = isOpen ? "▼" : "▶";

      header.appendChild(title);
      header.appendChild(toggle);

      header.addEventListener("click", () => {
        if (searching) return;
        groupOpenState[key] = !(groupOpenState[key] !== false);
        renderCards();
      });

      cardGrid.appendChild(header);
      if (isOpen) {
        gItems.forEach(item => cardGrid.appendChild(createCard(item)));
      }
    });
  });
}

function createCard(item) {
  const card = document.createElement("div");
  card.className = "card" + (selectedIds.has(item.id) ? " selected" : "");
  card.dataset.id = item.id;

  const tags = safeTags(item);
  const tagsHtml = tags.length
    ? `<div class="card-tags">${tags.map(t => `<span class="card-tag">${t}</span>`).join("")}</div>`
    : "";

  card.innerHTML = `
    <div class="card-actions">
      <button class="btn-copy" title="en をコピー" data-en="${escHtml(safeText(item.en))}">📋</button>
    </div>
    <div class="card-en">${escHtml(safeText(item.en))}</div>
    <div class="card-jp">${escHtml(safeText(item.jp))}</div>
    ${tagsHtml}
  `;

  card.addEventListener("click", e => {
    if (e.target.closest(".btn-copy")) return;
    addToBuilder(safeText(item.en));
    toggleSelect(item.id);
    card.classList.toggle("selected", selectedIds.has(item.id));
  });

  card.querySelector(".btn-copy").addEventListener("click", async e => {
    e.stopPropagation();
    await copyText(safeText(item.en));
  });

  return card;
}

// ---- TAGSモード共通: tags[0] をサブカテゴリとして折りたたみ表示 ----
// expr カテゴリのみ一部セクションをデフォルト折りたたみ、他は全展開
const EXPR_DEFAULT_CLOSED = new Set([
  "expr_evil", "mood_bad", "anger", "sad", "fear", "tired",
  "confusion", "anxiety", "trouble", "eye_empty", "face_feature", "mark", "nose",
]);

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderTagsSectionCards(items, searching, catKey) {
  // tags[0] でグループ化（出現順を維持）
  const sectionMap = new Map();
  for (const item of items) {
    const key = (safeTags(item)[0]) || "other";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key).push(item);
  }

  if (sectionMap.size === 0) return;

  // 目次バー（サブカテゴリジャンプボタン）— #card-grid の外に描画
  subcatJumpContainer.innerHTML = "";
  if (sectionMap.size > 1) {
    const bar = document.createElement("div");
    bar.className = "subcat-jump-bar " + (subcatJumpExpanded ? "is-expanded" : "is-collapsed");

    // チップ群をラップするコンテナ（overflow はここに適用）
    const chips = document.createElement("div");
    chips.className = "subcat-jump-chips";

    const MAJOR_ORDER = ["camera","pose","expr","act","cloth","comp","bg","style"];
    const sortedKeys = Array.from(sectionMap.keys()).sort((a, b) => {
      const ai = MAJOR_ORDER.indexOf(SECTION_TO_MAJOR[a] || "style");
      const bi = MAJOR_ORDER.indexOf(SECTION_TO_MAJOR[b] || "style");
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      const anchorId = `subcat-${catKey}-${slugify(key)}`;
      const btn = document.createElement("button");
      btn.className = "subcat-jump-btn";
      if (catKey === "__sensitive__") {
        btn.textContent = key.toUpperCase(); // センシティブは英語
      } else {
        btn.textContent = SECTION_LABEL_JP[key] || key.toUpperCase(); // 通常は日本語優先
      }
      btn.dataset.major = SECTION_TO_MAJOR[key] || "style";
      btn.addEventListener("click", () => {
        const target = document.getElementById(anchorId);
        if (!target) return;
        cardGrid.scrollTop = target.offsetTop - cardGrid.offsetTop;
      });
      chips.appendChild(btn);
    }
    bar.appendChild(chips);

    // 折りたたみ/展開トグルボタン（chips の外 → overflow の影響を受けない）
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "subcat-jump-toggle";
    toggleBtn.type = "button";
    toggleBtn.textContent = subcatJumpExpanded ? "折りたたむ" : "もっと見る";
    toggleBtn.addEventListener("click", () => {
      subcatJumpExpanded = !subcatJumpExpanded;
      renderTagsSectionCards(items, searching, catKey);
    });
    bar.appendChild(toggleBtn);

    subcatJumpContainer.appendChild(bar);

    // 溢れ判定：DOM 挿入後に判定（toggle を隠した状態で chips 幅を測る）
    requestAnimationFrame(() => {
      if (subcatJumpExpanded) {
        toggleBtn.style.display = "";
        toggleBtn.textContent = "折りたたむ";
        return;
      }
      // collapsed: toggle を一旦隠して chips の実幅を正確に測る
      toggleBtn.style.display = "none";
      requestAnimationFrame(() => {
        const overflowed = chips.scrollWidth > chips.clientWidth;
        toggleBtn.style.display = overflowed ? "" : "none";
        toggleBtn.textContent = "もっと見る";
      });
    });
  }

  for (const [key, sectionItems] of sectionMap) {
    const stateKey = `tags_${catKey}_${key}`;
    const anchorId = `subcat-${catKey}-${slugify(key)}`;

    // 検索中は強制展開。それ以外は groupOpenState → カテゴリ別デフォルト
    let isOpen;
    if (searching) {
      isOpen = true;
    } else {
      const stored = groupOpenState[stateKey];
      if (stored === undefined) {
        // expr: 一部デフォルト折りたたみ、他カテゴリ: 全展開
        isOpen = catKey === "expr" ? !EXPR_DEFAULT_CLOSED.has(key) : true;
      } else {
        isOpen = stored !== false;
      }
    }

    // セクション見出し（アコーディオンヘッダー）
    const header = document.createElement("div");
    header.className = "emotion-group-header";
    header.id = anchorId;

    const title = document.createElement("span");
    title.textContent = `${key.toUpperCase()}  (${sectionItems.length})`;

    const toggle = document.createElement("span");
    toggle.className = "emotion-group-toggle";
    toggle.textContent = isOpen ? "▼" : "▶";

    header.appendChild(title);
    header.appendChild(toggle);

    header.addEventListener("click", () => {
      if (searching) return;
      const stored = groupOpenState[stateKey];
      const def = catKey === "expr" ? !EXPR_DEFAULT_CLOSED.has(key) : true;
      const cur = stored === undefined ? def : stored !== false;
      groupOpenState[stateKey] = !cur;
      renderCards();
    });

    cardGrid.appendChild(header);

    if (isOpen) {
      sectionItems.forEach(item => cardGrid.appendChild(createCard(item)));
    }
  }
}

function renderCards() {
  const items = filteredItems();
  cardGrid.innerHTML = "";
  emptyMsg.hidden = items.length > 0;

  // TAGSモード以外ではジャンプバーを消す
  if (activeMode !== "tags") subcatJumpContainer.innerHTML = "";

  if (activeCatKey === "expression") {
    renderExpressionCards(items, searchQuery !== "");
  } else if (activeMode === "tags") {
    renderTagsSectionCards(items, searchQuery !== "", activeCatKey);
  } else {
    items.forEach(item => cardGrid.appendChild(createCard(item)));
  }

  // スクロール末尾の余白
  const spacer = document.createElement("div");
  spacer.className = "bottom-spacer";
  cardGrid.appendChild(spacer);
}

// ---- Selection ----
function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectedUI();
}

function updateSelectedUI() {
  const n = selectedIds.size;
  selectedCount.textContent = n;
  copySelected.disabled = n === 0;
}

// ---- Copy helpers ----
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure context
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showToast(`コピーしました: ${text}`);
  } catch (err) {
    showToast("コピーに失敗しました");
    console.error(err);
  }
}

// ---- Events ----
// ---- Prompt Builder ----
function addToBuilder(tag) {
  if (!tag || builderTags.includes(tag)) return;
  builderTags.push(tag);
  renderBuilder();
}

function removeFromBuilder(tag) {
  builderTags = builderTags.filter(t => t !== tag);
  renderBuilder();
}

function renderBuilder() {
  builderChips.innerHTML = "";
  builderTags.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "builder-chip";
    chip.title = "クリックで削除";
    chip.innerHTML = `${escHtml(tag)} <span class="builder-chip-x">×</span>`;
    chip.addEventListener("click", () => removeFromBuilder(tag));
    builderChips.appendChild(chip);
  });
  const output = builderTags.join(", ");
  builderOutput.textContent = output || "(empty)";
  builderCopy.disabled = builderTags.length === 0;
}

async function copyBuilderPrompt() {
  const text = builderTags.join(", ");
  if (!text) return;
  await copyText(text);
  showToast("Copied!");
}

function bindEvents() {
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value.trim();
    renderCards();
  });

  builderCopy.addEventListener("click", copyBuilderPrompt);
  builderClear.addEventListener("click", () => { builderTags = []; renderBuilder(); });

  copySelected.addEventListener("click", async () => {
    const items = filteredItems();

    const texts = items
      .filter(i => selectedIds.has(i.id))
      .map(i => {
        // EN-only: prefer danbooru_tag (tags=[section, danbooru_tag]) then i.en
        const ts = safeTags(i);
        const dan = ts.length >= 2 ? ts[1] : "";
        if (dan) return dan;
        if (i.en) return String(i.en);
        return ""; // skip JP-only
      })
      .map(t => t.trim())
      .filter(Boolean);

    if (texts.length === 0) return;
    await copyText(texts.join(", "));
  });
}

// ---- Toast ----
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---- Utils ----
function escHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function safeText(v) { return v == null ? "" : String(v); }
function safeTags(item) { return Array.isArray(item.tags) ? item.tags : []; }
