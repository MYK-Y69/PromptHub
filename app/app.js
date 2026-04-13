/* PromptHub v2 – app.js */

// ---- データソース ----
const DATA_URL = "../data/v2/compiled/tags.json";

// ---- State ----
let v2Data       = null;   // ロード済み JSON { schema_version, count, categories }
let activeCatId  = null;   // 表示中カテゴリ id
let searchQuery  = "";     // 検索文字列
let targetFilter = "";     // "self"|"other"|"mutual"|"object"|"__null__"|""
let builderTags  = [];     // Prompt Builder: [{en}]
let searchTimer  = null;

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
const jumpbar       = document.getElementById("jumpbar");
const recordList    = document.getElementById("record-list");
const emptyMsg      = document.getElementById("empty-msg");
const builderTagsEl = document.getElementById("builder-tags");
const builderOutput = document.getElementById("builder-output");
const builderCopy   = document.getElementById("builder-copy");
const builderClear  = document.getElementById("builder-clear");
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

  // 最初のカテゴリを表示
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
    // センシティブカテゴリの前に区切り線を挿入
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

  // サイドバーのアクティブ状態
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

  renderJumpbar();
  renderRecords();
}

// ---- ジャンプバー（サブカテゴリ単位） ----
function renderJumpbar() {
  // 検索中はジャンプバー非表示
  if (searchQuery.trim().length > 0) {
    jumpbar.innerHTML = "";
    jumpbar.hidden = true;
    return;
  }
  jumpbar.hidden = false;

  const cat = currentCategory();
  if (!cat) { jumpbar.innerHTML = ""; return; }

  jumpbar.innerHTML = "";

  if (cat.subcategories) {
    for (const sc of cat.subcategories) {
      const btn = document.createElement("button");
      btn.className = "jump-btn";
      btn.dataset.scId = sc.id;
      btn.textContent = sc.label;
      btn.addEventListener("click", () => {
        const el = document.getElementById("subcat-" + sc.id);
        if (el) scrollToEl(el);
      });
      jumpbar.appendChild(btn);
    }
  } else {
    for (const sec of (cat.sections || [])) {
      const btn = document.createElement("button");
      btn.className = "jump-btn";
      btn.textContent = sec.label;
      btn.addEventListener("click", () => {
        const el = document.getElementById("sec-" + sec.id);
        if (el) scrollToEl(el);
      });
      jumpbar.appendChild(btn);
    }
  }
}

// スクロール修正: sticky 要素の offsetTop を使って record-list コンテナをスクロール
function scrollToEl(el) {
  const containerRect = recordList.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  recordList.scrollTop += elRect.top - containerRect.top;
}

// ---- レコード一覧レンダリング ----
function renderRecords() {
  const q          = searchQuery.trim().toLowerCase();
  const tf         = targetFilter;
  const globalMode = q.length > 0;

  // 対象カテゴリ: 検索中は全カテゴリ、それ以外は選択中のみ
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

    // 検索モード: カテゴリ区切りヘッダを挿入
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

  // EN
  const enEl = document.createElement("span");
  enEl.className = "rec-en";
  enEl.textContent = tag.en;

  // JP
  const jpEl = document.createElement("span");
  jpEl.className = "rec-jp";
  jpEl.textContent = tag.jp;

  // target badge（あれば）
  const tbEl = document.createElement("span");
  if (tag.target) {
    tbEl.className = "rec-target tgt-" + tag.target;
    tbEl.textContent = TARGET_LABEL[tag.target] ?? tag.target;
  } else {
    tbEl.className = "rec-target";
  }

  // コピーボタン
  const copyBtn = document.createElement("button");
  copyBtn.className = "rec-btn btn-copy";
  copyBtn.title = "en をコピー";
  copyBtn.textContent = "コピー";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyToClipboard(tag.en);
  });

  // Prompt Builder 追加ボタン
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
  builderTagsEl.innerHTML = "";
  for (const t of builderTags) {
    const chip = document.createElement("div");
    chip.className = "builder-chip";
    chip.innerHTML =
      `<span class="chip-en">${escHtml(t.en)}</span>` +
      `<button class="chip-remove" data-en="${escHtml(t.en)}">×</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      removeFromBuilder(t.en);
    });
    builderTagsEl.appendChild(chip);
  }

  const prompt = builderTags.map(t => t.en).join(", ");
  builderOutput.value = prompt;
  builderCopy.disabled = (builderTags.length === 0);
}

// ---- イベント ----
function setupEventListeners() {
  // 検索（デバウンス 150ms）
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value;
      renderJumpbar();
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

  // Prompt Builder
  builderCopy.addEventListener("click", () => {
    copyToClipboard(builderOutput.value);
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
      // フォールバック
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
