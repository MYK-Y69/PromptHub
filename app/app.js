/* PromptHub – app.js */

// ---- Config ----
const COMPILED = {
  safe: "../data/dictionary/compiled/safe.json",
  full: "../data/dictionary/compiled/full.json",
};
let activeMode = "safe";

// ---- State ----
let allCategories = [];      // [{ key, label, items }]
let activeCatKey = null;
let activeTag = null;
let searchQuery = "";
let selectedIds = new Set();
let groupOpenState = { neutral: false }; // emotion accordion: false=closed, undefined/true=open
let activeTabKey = null; // "emotions" | "parts" | "facemakeup" | null

// ---- DOM refs ----
const categoryList  = document.getElementById("category-list");
const tagChips      = document.getElementById("tag-chips");
const cardGrid      = document.getElementById("card-grid");
const emptyMsg      = document.getElementById("empty-msg");
const searchInput   = document.getElementById("search");
const copySelected  = document.getElementById("copy-selected");
const selectedCount = document.getElementById("selected-count");
const toast         = document.getElementById("toast");

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
    cats = data.categories.map(cat => ({
      key:   cat.key   ?? "unknown",
      label: cat.label ?? cat.key ?? "Unknown",
      items: Array.isArray(cat.items) ? cat.items : [],
    }));
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
  selectCategory(allCategories[0].key);
  document.querySelectorAll(".mode-btn").forEach(btn => {
    const on = btn.dataset.mode === mode;
    btn.style.background  = on ? "#4a9eff" : "#2a2a3e";
    btn.style.color       = on ? "#fff"    : "#aaa";
    btn.style.borderColor = on ? "#4a9eff" : "#444";
  });
  modeLoading = false;
}

// ---- Tab constants ----
const TABS = [
  { key: "emotions",   label: "Emotions" },
  { key: "parts",      label: "Parts" },
  { key: "facemakeup", label: "Face & Makeup" },
];

const PARTS_GROUPS = [
  { key: "eye",          emoji: "👁",  label: "Eye" },
  { key: "mouth",        emoji: "👄",  label: "Mouth" },
  { key: "teeth",        emoji: "🦷",  label: "Teeth" },
  { key: "brow",         emoji: "〰️",  label: "Brow" },
  { key: "sweat",        emoji: "💧",  label: "Sweat" },
  { key: "blush_detail", emoji: "🌸",  label: "Blush Detail" },
];

const FACE_MAKEUP_GROUPS = [
  { key: "makeup",      emoji: "💄",  label: "Makeup" },
  { key: "lips",        emoji: "💋",  label: "Lips" },
  { key: "eyelashes",   emoji: "✨",  label: "Eyelashes" },
  { key: "freckles",    emoji: "🔴",  label: "Freckles" },
  { key: "mole",        emoji: "⚫",  label: "Mole" },
  { key: "facial_mark", emoji: "🎭",  label: "Facial Mark" },
  { key: "facepaint",   emoji: "🎨",  label: "Facepaint" },
  { key: "bodypaint",   emoji: "🖌️",  label: "Bodypaint" },
];

// ---- Boot ----
(async function init() {
  // SAFE / FULL toggle bar を body 先頭に挿入
  const modeBar = document.createElement("div");
  modeBar.style.cssText = "display:flex;gap:8px;padding:6px 14px;background:#111827;border-bottom:1px solid #2a2a3e;";
  ["safe", "full"].forEach(m => {
    const btn = document.createElement("button");
    btn.className = "mode-btn";
    btn.dataset.mode = m;
    btn.textContent = m.toUpperCase();
    btn.style.cssText = "padding:3px 14px;border:1px solid #444;background:#2a2a3e;color:#aaa;cursor:pointer;border-radius:4px;font-size:11px;font-weight:600;";
    btn.addEventListener("click", () => loadMode(m));
    modeBar.appendChild(btn);
  });
  document.body.insertBefore(modeBar, document.body.firstChild);

  // Tab bar を modeBar の直後に挿入
  const tabBar = document.createElement("div");
  tabBar.id = "tab-bar";
  tabBar.style.cssText = "display:flex;gap:0;background:#111827;border-bottom:2px solid #2a2a3e;padding:0 14px;";
  TABS.forEach(tab => {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.dataset.tab = tab.key;
    btn.textContent = tab.label;
    btn.style.cssText = "padding:8px 18px;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;background:transparent;color:#aaa;cursor:pointer;font-size:13px;font-weight:600;transition:color .15s,border-color .15s;";
    btn.addEventListener("click", () => selectTab(tab.key));
    btn.addEventListener("mouseenter", () => {
      if (btn.dataset.tab !== activeTabKey) btn.style.color = "#ccc";
    });
    btn.addEventListener("mouseleave", () => {
      if (btn.dataset.tab !== activeTabKey) btn.style.color = "#aaa";
    });
    tabBar.appendChild(btn);
  });
  document.body.insertBefore(tabBar, document.body.children[1]);

  await loadMode("safe");
  bindEvents();
})();

// ---- Tab selection ----
function selectTab(key) {
  activeTabKey = activeTabKey === key ? null : key;
  searchQuery = "";
  searchInput.value = "";
  activeTag = null;
  selectedIds.clear();
  updateSelectedUI();
  updateTabBar();
  renderTagChips();
  renderCards();
}

function updateTabBar() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const on = btn.dataset.tab === activeTabKey;
    btn.style.color = on ? "#4a9eff" : "#aaa";
    btn.style.borderBottomColor = on ? "#4a9eff" : "transparent";
  });
}

// ---- Sidebar ----
function renderSidebar() {
  categoryList.innerHTML = "";
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
  activeCatKey = key;
  activeTag = null;
  activeTabKey = null;
  searchQuery = "";
  searchInput.value = "";
  selectedIds.clear();
  updateSelectedUI();
  updateTabBar();

  document.querySelectorAll(".cat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });

  renderTagChips();
  renderCards();
}

// ---- Tag chips ----
function renderTagChips() {
  tagChips.innerHTML = "";
  if (activeTabKey) return;

  const cat = currentCategory();
  if (!cat) return;

  const tagCounts = {};
  cat.items.forEach(item => {
    safeTags(item).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });

  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (tags.length === 0) return;

  tags.forEach(([tag, count]) => {
    const el = document.createElement("span");
    el.className = "chip" + (tag === activeTag ? " active" : "");
    el.textContent = `${tag} (${count})`;
    el.addEventListener("click", () => toggleTag(tag));
    tagChips.appendChild(el);
  });
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

function allItemsPool() {
  const allCat = allCategories.find(c => c.key === "__all__");
  return allCat ? allCat.items : [];
}

// emotion サブタグ（neutral 以外）: このいずれかを持つアイテムは Emotions タブ扱い
const EMOTION_SUBTAGS = ["joy", "anger", "sadness", "surprise", "shy", "determined", "smug", "tired", "confused"];

function hasEmotionSubtag(tags) {
  return EMOTION_SUBTAGS.some(t => tags.includes(t));
}

function filteredItems() {
  let items;

  if (activeTabKey === "emotions") {
    // emotion タグを持ち、かつ非 neutral の感情サブタグを持つもの
    items = allItemsPool().filter(i => {
      const tags = safeTags(i);
      return tags.includes("emotion") && hasEmotionSubtag(tags);
    });
  } else if (activeTabKey === "parts") {
    // parts タグを持ち、かつ非 neutral 感情サブタグを持たないもの（= neutral 寄り）
    const partsKeys = PARTS_GROUPS.map(g => g.key);
    items = allItemsPool().filter(i => {
      const tags = safeTags(i);
      return tags.some(t => partsKeys.includes(t)) && !hasEmotionSubtag(tags);
    });
  } else if (activeTabKey === "facemakeup") {
    const keys = FACE_MAKEUP_GROUPS.map(g => g.key);
    items = allItemsPool().filter(i => safeTags(i).some(t => keys.includes(t)));
  } else {
    const cat = currentCategory();
    if (!cat) return [];
    items = cat.items;
  }

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

// ---- Emotion grouping ----
const EMOTION_GROUPS = [
  { key: "joy",      emoji: "😊", label: "Joy" },
  { key: "anger",    emoji: "😡", label: "Anger" },
  { key: "sadness",  emoji: "😢", label: "Sadness" },
  { key: "surprise", emoji: "😲", label: "Surprise" },
  { key: "shy",      emoji: "😳", label: "Shy" },
  { key: "neutral",  emoji: "😐", label: "Neutral" },
  { key: "other",    emoji: "📦", label: "Other" },
];

function groupByEmotion(items) {
  const buckets = Object.fromEntries(EMOTION_GROUPS.map(g => [g.key, []]));
  for (const item of items) {
    const tags = safeTags(item);
    if (!tags.includes("emotion")) { buckets.other.push(item); continue; }
    const match = EMOTION_GROUPS.find(g => g.key !== "other" && tags.includes(g.key));
    (match ? buckets[match.key] : buckets.other).push(item);
  }
  return EMOTION_GROUPS
    .map(g => ({ ...g, items: buckets[g.key] }))
    .filter(g => g.items.length > 0);
}

// ---- Generic tag grouping (Parts / Face & Makeup) ----
function groupByTag(items, groups) {
  const buckets = Object.fromEntries(groups.map(g => [g.key, []]));
  for (const item of items) {
    const tags = safeTags(item);
    for (const g of groups) {
      if (tags.includes(g.key)) buckets[g.key].push(item);
    }
  }
  return groups
    .map(g => ({ ...g, items: buckets[g.key] }))
    .filter(g => g.items.length > 0);
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
    toggleSelect(item.id);
    card.classList.toggle("selected", selectedIds.has(item.id));
  });

  card.querySelector(".btn-copy").addEventListener("click", async e => {
    e.stopPropagation();
    await copyText(safeText(item.en));
  });

  return card;
}

// ---- Grouped card rendering (shared by emotion/parts/facemakeup) ----
function renderGroupedCards(groups, searching) {
  // Agenda (jump menu)
  if (groups.length > 0) {
    const agenda = document.createElement("div");
    agenda.className = "emotion-agenda";
    groups.forEach(({ key, emoji, label }) => {
      const btn = document.createElement("button");
      btn.className = "emotion-agenda-item";
      btn.textContent = emoji ? `${emoji} ${label}` : label;
      btn.addEventListener("click", () => {
        if (!searching && groupOpenState[key] === false) {
          groupOpenState[key] = true;
          renderCards();
          requestAnimationFrame(() => {
            document.getElementById("emotion-" + key)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        } else {
          document.getElementById("emotion-" + key)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      agenda.appendChild(btn);
    });
    cardGrid.appendChild(agenda);
  }

  // Accordion groups
  groups.forEach(({ key, emoji, label, items: gItems }) => {
    const isOpen = searching || groupOpenState[key] !== false;

    const header = document.createElement("div");
    header.className = "emotion-group-header";
    header.id = "emotion-" + key;

    const title = document.createElement("span");
    title.textContent = emoji ? `${emoji} ${label}` : label;

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
}

function renderCards() {
  const items = filteredItems();
  cardGrid.innerHTML = "";
  emptyMsg.hidden = items.length > 0;

  const searching = searchQuery !== "";

  if (activeTabKey === "emotions") {
    renderGroupedCards(groupByEmotion(items), searching);
  } else if (activeTabKey === "parts") {
    renderGroupedCards(groupByTag(items, PARTS_GROUPS), searching);
  } else if (activeTabKey === "facemakeup") {
    renderGroupedCards(groupByTag(items, FACE_MAKEUP_GROUPS), searching);
  } else if (activeCatKey === "expression") {
    renderGroupedCards(groupByEmotion(items), searching);
  } else {
    items.forEach(item => cardGrid.appendChild(createCard(item)));
  }
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
function bindEvents() {
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value.trim();
    renderCards();
  });

  copySelected.addEventListener("click", async () => {
    const items = filteredItems();
    const texts = items
      .filter(i => selectedIds.has(i.id))
      .map(i => i.en);
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
