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

async function loadMode(mode) {
  activeMode = mode;
  let data;
  try {
    data = await fetch(COMPILED[mode]).then(r => r.json());
  } catch (e) {
    console.warn(`Failed to load ${COMPILED[mode]}:`, e);
    cardGrid.innerHTML = "<p style='color:#888;padding:40px'>辞書ファイルが見つかりません。</p>";
    return;
  }
  allCategories = [normalizeCategory(data, mode)];
  renderSidebar();
  selectCategory(allCategories[0].key);
  document.querySelectorAll(".mode-btn").forEach(btn => {
    const on = btn.dataset.mode === mode;
    btn.style.background  = on ? "#4a9eff" : "#2a2a3e";
    btn.style.color       = on ? "#fff"    : "#aaa";
    btn.style.borderColor = on ? "#4a9eff" : "#444";
  });
}

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

  await loadMode("safe");
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
  const cat = currentCategory();
  if (!cat) return;

  const tagCounts = {};
  cat.items.forEach(item => {
    item.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });

  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  tagChips.innerHTML = "";

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
    items = items.filter(i => i.tags.includes(activeTag));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i =>
      i.jp.toLowerCase().includes(q) ||
      i.en.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  return items;
}

function renderCards() {
  const items = filteredItems();
  cardGrid.innerHTML = "";
  emptyMsg.hidden = items.length > 0;

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "card" + (selectedIds.has(item.id) ? " selected" : "");
    card.dataset.id = item.id;

    const tagsHtml = item.tags.length
      ? `<div class="card-tags">${item.tags.map(t => `<span class="card-tag">${t}</span>`).join("")}</div>`
      : "";

    card.innerHTML = `
      <div class="card-actions">
        <button class="btn-copy" title="en をコピー" data-en="${escHtml(item.en)}">📋</button>
      </div>
      <div class="card-en">${escHtml(item.en)}</div>
      <div class="card-jp">${escHtml(item.jp)}</div>
      ${tagsHtml}
    `;

    // Click card body to toggle selection
    card.addEventListener("click", e => {
      if (e.target.closest(".btn-copy")) return;
      toggleSelect(item.id);
      card.classList.toggle("selected", selectedIds.has(item.id));
    });

    // Copy button
    card.querySelector(".btn-copy").addEventListener("click", async e => {
      e.stopPropagation();
      await copyText(item.en);
    });

    cardGrid.appendChild(card);
  });
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
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
