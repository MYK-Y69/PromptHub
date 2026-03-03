/* PromptHub – app.js */

// ---- Config ----
const COMPILED = {
  safe: "../data/dictionary/compiled/safe.json",
  full: "../data/dictionary/compiled/full.json",
  tags: "../data/dictionary/compiled/tags.json",
};
let activeMode = "safe";

// ---- State ----
let allCategories = [];      // [{ key, label, items }]
let activeCatKey = null;
let activeTag = null;
let searchQuery = "";
let selectedIds = new Set();
let groupOpenState = { neutral: false }; // accordion: false=closed, undefined/true=open

// ---- DOM refs ----
const categoryList  = document.getElementById("category-list");
const tagChips      = document.getElementById("tag-chips");
const cardGrid      = document.getElementById("card-grid");
const emptyMsg      = document.getElementById("empty-msg");
const searchInput   = document.getElementById("search");
const copySelected  = document.getElementById("copy-selected");
const selectedCount = document.getElementById("selected-count");
const toast         = document.getElementById("toast");

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
  selectCategory(allCategories[0].key);
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
})();

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
    toggleSelect(item.id);
    card.classList.toggle("selected", selectedIds.has(item.id));
  });

  card.querySelector(".btn-copy").addEventListener("click", async e => {
    e.stopPropagation();
    await copyText(safeText(item.en));
  });

  return card;
}

function renderCards() {
  const items = filteredItems();
  cardGrid.innerHTML = "";
  emptyMsg.hidden = items.length > 0;

  if (activeCatKey === "expression") {
    renderExpressionCards(items, searchQuery !== "");
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
