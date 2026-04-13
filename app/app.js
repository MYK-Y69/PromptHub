/* PromptHub v2 – app.js */

// ---- データソース ----
const DATA_URL = "../data/v2/compiled/tags.json";

// ---- State ----
let v2Data       = null;   // ロード済み JSON
let activeCatId  = null;   // 表示中カテゴリ id
let searchQuery  = "";     // 検索文字列
let targetFilter = "";     // "self"|"other"|"mutual"|"object"|"__null__"|""
let builderTags  = [];     // Prompt Builder: [{en}]
let searchTimer  = null;

// スクロール追従用: {type:"subcat"|"sec", id, offsetTop} の配列
let indexItems   = [];

// ---- target ラベル定義 ----
const TARGET_LABEL = {
  self:   "self",
  other:  "other",
  mutual: "mutual",
  object: "obj",
};

// ---- DOM refs ----
const catNav        = document.getElementById("cat-nav");
const searchInput   = document.getElementById("search");
const recordList    = document.getElementById("record-list");
const emptyMsg      = document.getElementById("empty-msg");
const builderChips  = document.getElementById("builder-chips");
const builderCopy   = document.getElementById("builder-copy");
const builderClear  = document.getElementById("builder-clear");
const indexTree     = document.getElementById("index-tree");
const toast         = document.getElementById("toast");

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

  buildSidebar();
  setupEventListeners();

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

  // フィルタリセット
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

  // 検索中は検索モードメッセージ
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
    // サブカテゴリ行
    const scBtn = document.createElement("button");
    scBtn.className = "idx-subcat";
    scBtn.dataset.scId = sc.id;
    scBtn.textContent = sc.label;
    scBtn.addEventListener("click", () => scrollToId("subcat-" + sc.id));
    indexTree.appendChild(scBtn);

    // セクション行（インデント）
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

// ---- スクロール: 要素 id → record-list 内スクロール ----
function scrollToId(elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const containerRect = recordList.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  recordList.scrollTop += elRect.top - containerRect.top;
}

// ---- スクロール追従: indexItems 構築 ----
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

// ---- スクロール追従: アクティブ更新 ----
function updateScrollHighlight() {
  if (indexItems.length === 0) return;

  const st = recordList.scrollTop + 4; // 4px の余裕
  let activeScId = null, activeSecId = null;

  for (const item of indexItems) {
    if (item.el.offsetTop <= st) {
      if (item.type === "subcat") {
        activeScId  = item.id;
        activeSecId = null;
      } else {
        activeSecId = item.id;
      }
    }
  }

  // クラス更新
  for (const btn of indexTree.querySelectorAll(".idx-subcat")) {
    btn.classList.toggle("active", btn.dataset.scId === activeScId && !activeSecId);
  }
  for (const btn of indexTree.querySelectorAll(".idx-sec")) {
    btn.classList.toggle("active", btn.dataset.secId === activeSecId);
  }
  // アクティブなサブカテゴリ行も常に色付け（セクション active 中でも）
  for (const btn of indexTree.querySelectorAll(".idx-subcat")) {
    if (btn.dataset.scId === activeScId) btn.classList.add("active");
  }

  // インデックスパネル内でアクティブ項目を見えるようにスクロール
  const activeEl =
    indexTree.querySelector(`.idx-sec.active`) ||
    indexTree.querySelector(`.idx-subcat.active`);
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest" });
  }
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

  // スクロール追従: items 再構築
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
  builderCopy.disabled = (builderTags.length === 0);
}

// ---- イベント ----
function setupEventListeners() {
  // 検索（デバウンス 150ms）
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
