/* PromptHub v2 – app.js */

// ---- データソース ----
const DATA_URL = "../data/v2/compiled/tags.json";

// ---- LocalStorage キー ----
const LS_DELETED = "prompthub_deleted";
const LS_SAVED   = "prompthub_saved";

// ---- State ----
let v2Data       = null;
let activeCatId  = null;
let searchQuery  = "";
let targetFilter = "";
let builderTags  = [];
let searchTimer  = null;
let indexItems   = [];

// 削除済みタグ (en.toLowerCase() のセット)
let deletedTags  = new Set(JSON.parse(localStorage.getItem(LS_DELETED) || "[]"));

// 保存済みプロンプト [{id, name, tags:[{en}], savedAt}]
let savedPrompts = JSON.parse(localStorage.getItem(LS_SAVED) || "[]");

// コンテキストメニュー対象タグ
let ctxTargetTag = null;

// ---- target ラベル定義 ----
const TARGET_LABEL = {
  self:   "self",
  other:  "other",
  mutual: "mutual",
  object: "obj",
};

// ---- DOM refs ----
const catNav          = document.getElementById("cat-nav");
const searchInput     = document.getElementById("search");
const recordList      = document.getElementById("record-list");
const emptyMsg        = document.getElementById("empty-msg");
const builderChips    = document.getElementById("builder-chips");
const builderCopy     = document.getElementById("builder-copy");
const builderClear    = document.getElementById("builder-clear");
const builderSave     = document.getElementById("builder-save");
const indexTree       = document.getElementById("index-tree");
const toast           = document.getElementById("toast");

const ctxMenu         = document.getElementById("ctx-menu");
const ctxDelete       = document.getElementById("ctx-delete");
const ctxCopy         = document.getElementById("ctx-copy");
const ctxAdd          = document.getElementById("ctx-add");

const saveDialog      = document.getElementById("save-dialog");
const saveNameInput   = document.getElementById("save-name-input");
const saveConfirm     = document.getElementById("save-confirm");
const saveCancel      = document.getElementById("save-cancel");

const savedBar        = document.getElementById("saved-bar");
const savedBarHeader  = document.getElementById("saved-bar-header");
const savedBarCount   = document.getElementById("saved-bar-count");
const savedList       = document.getElementById("saved-list");
const savedToggle     = document.getElementById("saved-toggle");
const savedExport     = document.getElementById("saved-export");
const savedImportInput = document.getElementById("saved-import-input");

// ---- 起動 ----
(async function init() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    v2Data = await resp.json();
  } catch (e) {
    recordList.innerHTML =
      `<p style="padding:40px;color:#888">データ読み込み失敗: ${e.message}</p>`;
    return;
  }

  // 削除済みタグをメモリから除去
  applyDeletions();

  buildSidebar();
  setupEventListeners();
  renderSavedList();

  if (v2Data.categories.length > 0) {
    selectCategory(v2Data.categories[0].id);
  }
})();

// ---- カテゴリのタグ数 ----
function catTagCount(cat) {
  if (cat.subcategories) {
    return cat.subcategories.reduce(
      (n, sc) => n + sc.sections.reduce((m, s) => m + s.tags.length, 0), 0);
  }
  return (cat.sections || []).reduce((n, s) => n + s.tags.length, 0);
}

// ---- サイドバー構築 ----
function buildSidebar() {
  catNav.innerHTML = "";
  for (const cat of v2Data.categories) {
    if (cat.id === "sensitive") {
      const divider = document.createElement("div");
      divider.className = "cat-divider";
      catNav.appendChild(divider);
    }
    const count = catTagCount(cat);
    const btn = document.createElement("button");
    btn.className = "cat-item" + (cat.id === "sensitive" ? " cat-sensitive" : "");
    btn.dataset.catId = cat.id;
    btn.innerHTML =
      `<span class="cat-label">${escHtml(cat.label)}</span>` +
      `<span class="cat-count">${count}</span>`;
    btn.addEventListener("click", () => selectCategory(cat.id));
    catNav.appendChild(btn);
  }
}

// ---- カテゴリ選択 ----
function selectCategory(catId) {
  activeCatId = catId;

  for (const btn of catNav.querySelectorAll(".cat-item")) {
    btn.classList.toggle("active", btn.dataset.catId === catId);
  }

  searchQuery  = "";
  targetFilter = "";
  searchInput.value = "";
  for (const b of document.querySelectorAll(".tf-btn")) {
    b.classList.toggle("active", b.dataset.target === "");
  }

  renderRecords();
  renderIndexPanel();
}

// ---- インデックスパネル構築 ----
function renderIndexPanel() {
  indexTree.innerHTML = "";

  if (searchQuery.trim().length > 0) {
    const msg = document.createElement("div");
    msg.className = "idx-search-msg";
    msg.textContent = "横断検索中…";
    indexTree.appendChild(msg);
    return;
  }

  const cat = currentCategory();
  if (!cat || !cat.subcategories) return;

  for (const sc of cat.subcategories) {
    const scBtn = document.createElement("button");
    scBtn.className = "idx-subcat";
    scBtn.dataset.scId = sc.id;
    scBtn.textContent = sc.label;
    scBtn.addEventListener("click", () => scrollToId("subcat-" + sc.id));
    indexTree.appendChild(scBtn);

    for (const sec of sc.sections) {
      const secBtn = document.createElement("button");
      secBtn.className = "idx-sec";
      secBtn.dataset.secId = sec.id;
      secBtn.textContent = sec.label;
      secBtn.addEventListener("click", () => scrollToId("sec-" + sec.id));
      indexTree.appendChild(secBtn);
    }
  }
}

// ---- スクロール ----
function scrollToId(elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const containerRect = recordList.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  recordList.scrollTop += elRect.top - containerRect.top;
}

function buildIndexItems() {
  indexItems = [];
  for (const el of recordList.querySelectorAll(".subcat-header, .sec-header")) {
    indexItems.push({
      type: el.classList.contains("subcat-header") ? "subcat" : "sec",
      id:   el.id.replace(/^subcat-|^sec-/, ""),
      el,
    });
  }
}

function updateScrollHighlight() {
  if (indexItems.length === 0) return;

  const st = recordList.scrollTop + 4;
  let activeScId = null, activeSecId = null;

  for (const item of indexItems) {
    if (item.el.offsetTop <= st) {
      if (item.type === "subcat") { activeScId = item.id; activeSecId = null; }
      else { activeSecId = item.id; }
    }
  }

  for (const btn of indexTree.querySelectorAll(".idx-subcat")) {
    btn.classList.toggle("active", btn.dataset.scId === activeScId && !activeSecId);
  }
  for (const btn of indexTree.querySelectorAll(".idx-sec")) {
    btn.classList.toggle("active", btn.dataset.secId === activeSecId);
  }
  for (const btn of indexTree.querySelectorAll(".idx-subcat")) {
    if (btn.dataset.scId === activeScId) btn.classList.add("active");
  }

  const activeEl =
    indexTree.querySelector(`.idx-sec.active`) ||
    indexTree.querySelector(`.idx-subcat.active`);
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

// ---- レコード一覧レンダリング ----
function renderRecords() {
  const q          = searchQuery.trim().toLowerCase();
  const tf         = targetFilter;
  const globalMode = q.length > 0;

  const cats = globalMode
    ? v2Data.categories
    : [currentCategory()].filter(Boolean);

  const frag = document.createDocumentFragment();
  let totalVisible = 0;

  for (const cat of cats) {
    const catFrag = document.createDocumentFragment();
    let catVisible = 0;

    if (cat.subcategories) {
      for (const sc of cat.subcategories) {
        let scVisible = 0;
        const scFrag = document.createDocumentFragment();

        for (const sec of sc.sections) {
          const filtered = sec.tags.filter(tag => matchesFilter(tag, q, tf));
          if (filtered.length === 0) continue;
          scVisible += filtered.length;

          const header = document.createElement("div");
          header.className = "sec-header";
          header.id = "sec-" + sec.id;
          header.textContent = sec.label;
          scFrag.appendChild(header);

          for (const tag of filtered) {
            scFrag.appendChild(makeRecord(tag));
          }
        }
        if (scVisible === 0) continue;
        catVisible += scVisible;

        const scHeader = document.createElement("div");
        scHeader.className = "subcat-header";
        scHeader.id = "subcat-" + sc.id;
        scHeader.textContent = sc.label;
        catFrag.appendChild(scHeader);
        catFrag.appendChild(scFrag);
      }
    } else {
      for (const sec of (cat.sections || [])) {
        const filtered = sec.tags.filter(tag => matchesFilter(tag, q, tf));
        if (filtered.length === 0) continue;
        catVisible += filtered.length;

        const header = document.createElement("div");
        header.className = "sec-header";
        header.id = "sec-" + sec.id;
        header.textContent = sec.label;
        catFrag.appendChild(header);

        for (const tag of filtered) {
          catFrag.appendChild(makeRecord(tag));
        }
      }
    }

    if (catVisible === 0) continue;
    totalVisible += catVisible;

    if (globalMode) {
      const catHeader = document.createElement("div");
      catHeader.className = "cat-search-header";
      catHeader.textContent = `${cat.label}  (${catVisible})`;
      frag.appendChild(catHeader);
    }
    frag.appendChild(catFrag);
  }

  recordList.innerHTML = "";
  recordList.appendChild(frag);
  emptyMsg.hidden = (totalVisible > 0);

  buildIndexItems();
  updateScrollHighlight();
}

function matchesFilter(tag, q, tf) {
  if (tf) {
    if (tf === "__null__") {
      if (tag.target !== null && tag.target !== undefined && tag.target !== "") return false;
    } else {
      if (tag.target !== tf) return false;
    }
  }
  if (q) {
    const enOk = tag.en.toLowerCase().includes(q);
    const jpOk = tag.jp.toLowerCase().includes(q);
    if (!enOk && !jpOk) return false;
  }
  return true;
}

// ---- レコード DOM 生成 ----
function makeRecord(tag) {
  const row = document.createElement("div");
  row.className = "record";

  const enEl = document.createElement("span");
  enEl.className = "rec-en";
  enEl.textContent = tag.en;

  const jpEl = document.createElement("span");
  jpEl.className = "rec-jp";
  jpEl.textContent = tag.jp;

  const tbEl = document.createElement("span");
  if (tag.target) {
    tbEl.className = "rec-target tgt-" + tag.target;
    tbEl.textContent = TARGET_LABEL[tag.target] ?? tag.target;
  } else {
    tbEl.className = "rec-target";
  }

  const copyBtn = document.createElement("button");
  copyBtn.className = "rec-btn btn-copy";
  copyBtn.title = "en をコピー";
  copyBtn.textContent = "コピー";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyToClipboard(tag.en);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "rec-btn btn-add";
  addBtn.title = "Prompt Builder に追加";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addToBuilder(tag.en);
  });

  // 右クリック: コンテキストメニュー
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showCtxMenu(e, tag);
  });

  row.appendChild(enEl);
  row.appendChild(jpEl);
  row.appendChild(tbEl);
  row.appendChild(copyBtn);
  row.appendChild(addBtn);

  return row;
}

// ---- Prompt Builder ----
function addToBuilder(en) {
  if (builderTags.find(t => t.en === en)) {
    showToast(`既に追加済み: ${en}`);
    return;
  }
  builderTags.push({ en });
  renderBuilder();
  showToast(`追加: ${en}`);
}

function removeFromBuilder(en) {
  builderTags = builderTags.filter(t => t.en !== en);
  renderBuilder();
}

function renderBuilder() {
  builderChips.innerHTML = "";
  for (const t of builderTags) {
    const chip = document.createElement("div");
    chip.className = "builder-chip";
    chip.innerHTML =
      `<span class="chip-en">${escHtml(t.en)}</span>` +
      `<button class="chip-remove" title="削除">×</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      removeFromBuilder(t.en);
    });
    builderChips.appendChild(chip);
  }
  const hasChips = builderTags.length > 0;
  builderCopy.disabled = !hasChips;
  builderSave.disabled = !hasChips;
}

// ---- コンテキストメニュー ----
function showCtxMenu(e, tag) {
  ctxTargetTag = tag;
  // ビューポート端のはみ出し防止
  const x = Math.min(e.clientX, window.innerWidth  - 170);
  const y = Math.min(e.clientY, window.innerHeight - 120);
  ctxMenu.style.left = x + "px";
  ctxMenu.style.top  = y + "px";
  ctxMenu.classList.add("show");
}

function hideCtxMenu() {
  ctxMenu.classList.remove("show");
  ctxTargetTag = null;
}

// ---- タグ削除 ----
function applyDeletions() {
  if (deletedTags.size === 0) return;
  for (const cat of v2Data.categories) {
    for (const sc of (cat.subcategories || [])) {
      for (const sec of (sc.sections || [])) {
        sec.tags = sec.tags.filter(t => !deletedTags.has(t.en.toLowerCase().trim()));
      }
    }
    for (const sec of (cat.sections || [])) {
      sec.tags = sec.tags.filter(t => !deletedTags.has(t.en.toLowerCase().trim()));
    }
  }
}

function deleteTag(tag) {
  const key = tag.en.toLowerCase().trim();
  deletedTags.add(key);
  localStorage.setItem(LS_DELETED, JSON.stringify([...deletedTags]));

  // メモリから除去
  for (const cat of v2Data.categories) {
    for (const sc of (cat.subcategories || [])) {
      for (const sec of (sc.sections || [])) {
        sec.tags = sec.tags.filter(t => t.en.toLowerCase().trim() !== key);
      }
    }
    for (const sec of (cat.sections || [])) {
      sec.tags = sec.tags.filter(t => t.en.toLowerCase().trim() !== key);
    }
  }

  renderRecords();
  buildSidebar();
  showToast(`削除: ${tag.en}（LocalStorage に記録済み）`);
}

// ---- 保存済みプロンプト ----
function openSaveDialog() {
  saveNameInput.value = "";
  saveDialog.classList.add("show");
  setTimeout(() => saveNameInput.focus(), 50);
}

function closeSaveDialog() {
  saveDialog.classList.remove("show");
}

function commitSave() {
  const name = saveNameInput.value.trim();
  if (!name) { saveNameInput.focus(); return; }

  const entry = {
    id:      Date.now().toString(),
    name,
    tags:    [...builderTags],
    savedAt: new Date().toISOString(),
  };
  savedPrompts.unshift(entry);
  localStorage.setItem(LS_SAVED, JSON.stringify(savedPrompts));
  renderSavedList();
  closeSaveDialog();
  showToast(`保存: ${name}`);
}

function loadPrompt(id) {
  const entry = savedPrompts.find(p => p.id === id);
  if (!entry) return;
  builderTags = [...entry.tags];
  renderBuilder();
  showToast(`読み込み: ${entry.name}`);
}

function deleteSaved(id) {
  const entry = savedPrompts.find(p => p.id === id);
  if (!entry) return;
  if (!confirm(`「${entry.name}」を削除しますか？`)) return;
  savedPrompts = savedPrompts.filter(p => p.id !== id);
  localStorage.setItem(LS_SAVED, JSON.stringify(savedPrompts));
  renderSavedList();
}

function renderSavedList() {
  // カウントバッジ
  if (savedPrompts.length > 0) {
    savedBarCount.textContent = savedPrompts.length;
    savedBarCount.classList.add("visible");
  } else {
    savedBarCount.classList.remove("visible");
  }

  if (!savedPrompts.length) {
    savedList.innerHTML = '<div class="saved-empty">保存済みなし</div>';
    return;
  }

  savedList.innerHTML = "";
  for (const p of savedPrompts) {
    const date = new Date(p.savedAt).toLocaleDateString("ja-JP", {month:"numeric", day:"numeric"});
    const preview = p.tags.map(t => t.en).join(", ");

    const item = document.createElement("div");
    item.className = "saved-item";
    item.innerHTML =
      `<div class="saved-item-info">` +
        `<span class="saved-name">${escHtml(p.name)}</span>` +
        `<span class="saved-tags-preview">${escHtml(preview)}</span>` +
        `<span class="saved-meta">${p.tags.length} tags · ${date}</span>` +
      `</div>` +
      `<div class="saved-item-btns">` +
        `<button class="saved-load" data-id="${p.id}">読込</button>` +
        `<button class="saved-del"  data-id="${p.id}">削除</button>` +
      `</div>`;

    item.querySelector(".saved-load").addEventListener("click", () => loadPrompt(p.id));
    item.querySelector(".saved-del").addEventListener("click",  () => deleteSaved(p.id));
    savedList.appendChild(item);
  }
}

function exportSaved() {
  const json = JSON.stringify(savedPrompts, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `prompthub_saved_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSaved(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error("invalid format");
      const existingIds = new Set(savedPrompts.map(p => p.id));
      let added = 0;
      for (const p of data) {
        if (p.id && p.name && Array.isArray(p.tags) && !existingIds.has(p.id)) {
          savedPrompts.push(p);
          added++;
        }
      }
      savedPrompts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      localStorage.setItem(LS_SAVED, JSON.stringify(savedPrompts));
      renderSavedList();
      showToast(`インポート: ${added} 件追加`);
    } catch {
      showToast("インポート失敗: 無効なファイル形式");
    }
    savedImportInput.value = "";
  };
  reader.readAsText(file);
}

// ---- イベント ----
function setupEventListeners() {
  // 検索
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value;
      renderIndexPanel();
      renderRecords();
    }, 150);
  });

  // target フィルタ
  for (const btn of document.querySelectorAll(".tf-btn")) {
    btn.addEventListener("click", () => {
      targetFilter = btn.dataset.target;
      for (const b of document.querySelectorAll(".tf-btn")) {
        b.classList.toggle("active", b.dataset.target === targetFilter);
      }
      renderRecords();
    });
  }

  // スクロール追従
  recordList.addEventListener("scroll", updateScrollHighlight);

  // Prompt Builder
  builderCopy.addEventListener("click", () => {
    const prompt = builderTags.map(t => t.en).join(", ");
    copyToClipboard(prompt);
  });
  builderClear.addEventListener("click", () => {
    builderTags = [];
    renderBuilder();
  });
  builderSave.addEventListener("click", openSaveDialog);

  // 保存ダイアログ
  saveConfirm.addEventListener("click", commitSave);
  saveCancel.addEventListener("click",  closeSaveDialog);
  saveDialog.addEventListener("click", (e) => {
    if (e.target === saveDialog) closeSaveDialog();
  });
  saveNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  commitSave();
    if (e.key === "Escape") closeSaveDialog();
  });

  // 保存済みパネル開閉（ヘッダークリック）
  savedBarHeader.addEventListener("click", (e) => {
    // ボタン類はクリックイベントが伝播するので除外
    if (e.target.closest("button, label")) return;
    savedBar.classList.toggle("open");
  });
  savedToggle.addEventListener("click", () => savedBar.classList.toggle("open"));

  // エクスポート / インポート
  savedExport.addEventListener("click", (e) => { e.stopPropagation(); exportSaved(); });
  savedImportInput.addEventListener("change", (e) => {
    if (e.target.files[0]) importSaved(e.target.files[0]);
  });

  // コンテキストメニュー
  document.addEventListener("click", (e) => {
    if (!ctxMenu.contains(e.target)) hideCtxMenu();
  });
  document.addEventListener("contextmenu", (e) => {
    // record 以外での右クリックはメニューを隠す
    if (!e.target.closest(".record")) hideCtxMenu();
  });

  ctxDelete.addEventListener("click", () => {
    if (!ctxTargetTag) return;
    const tag = ctxTargetTag;
    hideCtxMenu();
    if (!confirm(
      `「${tag.en}」を削除しますか？\n\n` +
      `注意: この削除はブラウザのLocalStorageに記録されます。\n` +
      `次回デプロイ後も非表示にするには削除リストのエクスポートが必要です。`
    )) return;
    deleteTag(tag);
  });

  ctxCopy.addEventListener("click", () => {
    if (!ctxTargetTag) return;
    const tag = ctxTargetTag;
    hideCtxMenu();
    copyToClipboard(tag.en);
  });

  ctxAdd.addEventListener("click", () => {
    if (!ctxTargetTag) return;
    const tag = ctxTargetTag;
    hideCtxMenu();
    addToBuilder(tag.en);
  });
}

// ---- ユーティリティ ----
function currentCategory() {
  if (!v2Data) return null;
  return v2Data.categories.find(c => c.id === activeCatId) ?? null;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast(`コピー: ${text}`),
    () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(`コピー: ${text}`);
    }
  );
}
