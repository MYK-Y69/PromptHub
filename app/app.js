/* PromptHub v2 – app.js */

// ---- データソース ----
const DATA_URL = "../data/v2/compiled/tags.json";

// ---- LocalStorage キー ----
const LS_DELETED    = "prompthub_deleted";
const LS_USER_TAGS  = "prompthub_user_tags";
const LS_SELECT_USAGE = "prompthub_select_builder_usage";
const LS_SELECT_BLOCKS = "prompthub_select_builder_blocks";

// ---- Selectable Builder data ----
const SELECT_CATEGORY_ORDER = [
  "character",
  "camera",
  "composition",
  "expression_face",
  "pose",
  "action",
  "outfit",
  "people_gender",
  "angle",
  "background",
  "quality_meta",
  "sensitive",
  "negative",
];
const SELECT_CATEGORY_LABELS = {
  character: "キャラクター",
  camera: "カメラ",
  composition: "構図",
  expression_face: "表情・顔",
  pose: "ポーズ",
  action: "動作・行動",
  outfit: "服装",
  people_gender: "人数・性別",
  angle: "アングル",
  background: "背景",
  quality_meta: "品質・メタ",
  sensitive: "Sensitive",
  negative: "Negative",
};

const DEFAULT_NEGATIVE_PROMPT =
  "low quality, worst quality, blurry, bad anatomy, bad hands, extra fingers, missing fingers, text, watermark, logo";

const SELECT_BLOCKS = [
  {
    id: "himesaki_rinami",
    category: "character",
    label: "姫崎莉波",
    prompt: "himesaki rinami, 1girl, long wavy hair, brown hair, brown eyes, idol outfit, ribbon accessory, slim body, soft facial features",
    negative_prompt: "",
    favorite: true,
    enabled: true,
  },
  {
    id: "original_blue_short_hair",
    category: "character",
    label: "青髪ショートの少女",
    prompt: "original character, 1girl, short blue hair, blue eyes, neat bangs, white blouse, pleated skirt, hairclip, petite body",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "original_silver_twin_tail",
    category: "character",
    label: "銀髪ツインテール",
    prompt: "original character, 1girl, silver twintails, violet eyes, black ribbon, frilled dress, delicate accessories, slim body",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "pose_standing_confident",
    category: "pose",
    label: "自信のある立ち姿",
    prompt: "standing, confident pose, hand on hip, relaxed shoulders",
    negative_prompt: "",
    favorite: true,
    enabled: true,
  },
  {
    id: "pose_sitting_sideways",
    category: "pose",
    label: "横向き座り",
    prompt: "sitting sideways, legs together, elegant posture",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "pose_reaching_hand",
    category: "pose",
    label: "手を差し伸べる",
    prompt: "reaching hand toward viewer, inviting gesture, dynamic pose",
    negative_prompt: "deformed hand, extra hands",
    favorite: false,
    enabled: true,
  },
  {
    id: "expression_gentle_smile",
    category: "expression_face",
    label: "やさしい笑顔",
    prompt: "gentle smile, soft eyes, warm expression",
    negative_prompt: "",
    favorite: true,
    enabled: true,
  },
  {
    id: "expression_serious",
    category: "expression_face",
    label: "真剣な表情",
    prompt: "serious expression, focused eyes, closed mouth",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "expression_surprised",
    category: "expression_face",
    label: "驚き",
    prompt: "surprised expression, wide eyes, slightly open mouth",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "angle_eye_level",
    category: "angle",
    label: "目線の高さ",
    prompt: "eye-level view, looking at viewer, balanced composition",
    negative_prompt: "",
    favorite: true,
    enabled: true,
  },
  {
    id: "angle_from_above",
    category: "angle",
    label: "上から",
    prompt: "from above, high angle, cinematic framing",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "angle_low_angle",
    category: "angle",
    label: "ローアングル",
    prompt: "from below, low angle, dramatic perspective",
    negative_prompt: "",
    favorite: false,
    enabled: true,
  },
  {
    id: "background_school_rooftop",
    category: "background",
    label: "学校の屋上",
    prompt: "school rooftop, blue sky, soft sunlight, clean background",
    negative_prompt: "",
    favorite: true,
    enabled: true,
  },
  {
    id: "background_city_night",
    category: "background",
    label: "夜の街",
    prompt: "city street at night, neon lights, depth of field, atmospheric background",
    negative_prompt: "messy background",
    favorite: false,
    enabled: true,
  },
  {
    id: "background_simple_studio",
    category: "background",
    label: "シンプルスタジオ",
    prompt: "simple studio background, soft gradient backdrop, professional lighting",
    negative_prompt: "cluttered background",
    favorite: false,
    enabled: true,
  },
];

// ---- State ----
let v2Data       = null;
let activeCatId  = null;
let searchQuery  = "";
let targetFilter = "";
let builderTags  = [];
let searchTimer  = null;
let indexItems   = [];
let selectActiveCategory = "character";
let selectSearchQuery = "";
let selectSelected = {};
let selectPositivePrompt = "";
let selectNegativePrompt = "";
let userSelectBlocks = [];
let editingBlockId = null;

// 削除済みタグ (en.toLowerCase() のセット)
let deletedTags  = new Set(JSON.parse(localStorage.getItem(LS_DELETED) || "[]"));

// コンテキストメニュー対象タグ
let ctxTargetTag = null;

// ユーザーが追加したタグ [{en,jp,catId,scId?,scLabel?,secId,secLabel,target,target_note?,addedAt}]
let userAddedTags = JSON.parse(localStorage.getItem(LS_USER_TAGS) || "[]");
let selectUsage = JSON.parse(localStorage.getItem(LS_SELECT_USAGE) || "{}");
try {
  userSelectBlocks = JSON.parse(localStorage.getItem(LS_SELECT_BLOCKS) || "[]");
  if (!Array.isArray(userSelectBlocks)) userSelectBlocks = [];
} catch {
  userSelectBlocks = [];
}

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
const builderBlockAdd = document.getElementById("builder-block-add");
const indexTree       = document.getElementById("index-tree");
const toast           = document.getElementById("toast");

const ctxMenu         = document.getElementById("ctx-menu");
const ctxDelete       = document.getElementById("ctx-delete");
const ctxCopy         = document.getElementById("ctx-copy");
const ctxAdd          = document.getElementById("ctx-add");

const blockDialog         = document.getElementById("block-dialog");
const blockNameInput      = document.getElementById("block-name-input");
const blockCategorySelect = document.getElementById("block-category-select");
const blockPositiveInput  = document.getElementById("block-positive-input");
const blockNegativeInput  = document.getElementById("block-negative-input");
const blockFavoriteInput  = document.getElementById("block-favorite-input");
const blockError          = document.getElementById("block-error");
const blockConfirm        = document.getElementById("block-confirm");
const blockCancel         = document.getElementById("block-cancel");

const tagAddBtn      = document.getElementById("tag-add-btn");
const tagAddDialog   = document.getElementById("tag-add-dialog");
const tadEn          = document.getElementById("tad-en");
const tadJp          = document.getElementById("tad-jp");
const tadCat         = document.getElementById("tad-cat");
const tadSc          = document.getElementById("tad-sc");
const tadScNew       = document.getElementById("tad-sc-new");
const tadSec         = document.getElementById("tad-sec");
const tadSecNew      = document.getElementById("tad-sec-new");
const tadTarget      = document.getElementById("tad-target");
const tadTnote       = document.getElementById("tad-tnote");
const tadError       = document.getElementById("tad-error");
const tadConfirm     = document.getElementById("tad-confirm");
const tadClose       = document.getElementById("tad-close");
const tadExportBtn   = document.getElementById("tad-export-btn");
const tadImportInput = document.getElementById("tad-import-input");
const tadUserCount   = document.getElementById("tad-user-count");
const tadScRow       = document.getElementById("tad-sc-row");
const tadSecRow      = document.getElementById("tad-sec-row");

const selectBuilder       = document.getElementById("select-builder");
const selectSearch        = document.getElementById("select-search");
const selectCategoryTabs  = document.getElementById("select-category-tabs");
const selectBlockList     = document.getElementById("select-block-list");
const selectedBlocks      = document.getElementById("selected-blocks");
const selectGenerate      = document.getElementById("select-generate");
const selectCopyPositive  = document.getElementById("select-copy-positive");
const selectCopyNegative  = document.getElementById("select-copy-negative");
const selectClear         = document.getElementById("select-clear");
const positiveOutput      = document.getElementById("positive-output");
const negativeOutput      = document.getElementById("negative-output");

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

  // ユーザー追加タグをメモリに注入
  applyUserAddedTags();

  buildSidebar();
  setupEventListeners();
  renderSelectBuilder();
  updateTadUserCount();

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
  row.className = "record" + (tag._userAdded ? " user-added" : "");

  const enEl = document.createElement("span");
  enEl.className = "rec-en";
  if (tag._userAdded) {
    const badge = document.createElement("span");
    badge.className = "user-added-badge";
    badge.textContent = "追加";
    enEl.appendChild(badge);
  }
  enEl.appendChild(document.createTextNode(tag.en));

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
  builderBlockAdd.disabled = !hasChips;
}

function populateBlockCategorySelect() {
  blockCategorySelect.innerHTML = "";
  for (const category of SELECT_CATEGORY_ORDER) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = SELECT_CATEGORY_LABELS[category];
    blockCategorySelect.appendChild(opt);
  }
}

function openBlockDialog() {
  if (builderTags.length === 0) return;
  populateBlockCategorySelect();
  editingBlockId = null;
  document.getElementById("block-dialog-title").textContent = "選択式ブロックを追加";
  blockConfirm.textContent = "追加";
  blockNameInput.value = "";
  blockCategorySelect.value = selectActiveCategory || "character";
  blockPositiveInput.value = builderTags.map(t => t.en).join(", ");
  blockNegativeInput.value = "";
  blockFavoriteInput.checked = false;
  blockError.textContent = "";
  blockDialog.classList.add("show");
  setTimeout(() => blockNameInput.focus(), 50);
}

function openEditBlockDialog(blockId) {
  const block = userSelectBlocks.find(item => item.id === blockId);
  if (!block) return;
  populateBlockCategorySelect();
  editingBlockId = blockId;
  document.getElementById("block-dialog-title").textContent = "選択式ブロックを編集";
  blockConfirm.textContent = "保存";
  blockNameInput.value = block.label;
  blockCategorySelect.value = block.category;
  blockPositiveInput.value = block.prompt;
  blockNegativeInput.value = block.negative_prompt || "";
  blockFavoriteInput.checked = !!block.favorite;
  blockError.textContent = "";
  blockDialog.classList.add("show");
  setTimeout(() => blockNameInput.focus(), 50);
}

function closeBlockDialog() {
  blockDialog.classList.remove("show");
  editingBlockId = null;
}

function slugFromText(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function saveCustomBlock() {
  const label = blockNameInput.value.trim();
  const category = blockCategorySelect.value;
  const prompt = blockPositiveInput.value.trim();
  const negativePrompt = blockNegativeInput.value.trim();

  if (!label) { blockError.textContent = "ブロック名を入力してください"; blockNameInput.focus(); return; }
  if (!category) { blockError.textContent = "カテゴリを選択してください"; blockCategorySelect.focus(); return; }
  if (!prompt) { blockError.textContent = "Positive prompt が空です"; blockPositiveInput.focus(); return; }

  const existingBlock = editingBlockId
    ? userSelectBlocks.find(item => item.id === editingBlockId)
    : null;

  const baseId = slugFromText(label) || "custom_block";
  const usedIds = new Set(allSelectBlocks()
    .filter(block => block.id !== editingBlockId)
    .map(block => block.id));
  let id = `custom_${category}_${baseId}`;
  let suffix = 2;
  if (existingBlock) id = existingBlock.id;
  while (!existingBlock && usedIds.has(id)) {
    id = `custom_${category}_${baseId}_${suffix}`;
    suffix++;
  }

  const block = {
    id,
    category,
    label,
    prompt,
    negative_prompt: negativePrompt,
    favorite: blockFavoriteInput.checked,
    enabled: true,
    user_created: true,
    created_at: existingBlock?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existingBlock) {
    userSelectBlocks = userSelectBlocks.map(item => item.id === existingBlock.id ? block : item);
    if (selectSelected[existingBlock.category] === existingBlock.id && existingBlock.category !== category) {
      delete selectSelected[existingBlock.category];
      selectSelected[category] = existingBlock.id;
    }
  } else {
    userSelectBlocks.unshift(block);
    selectSelected[category] = id;
  }
  localStorage.setItem(LS_SELECT_BLOCKS, JSON.stringify(userSelectBlocks));
  selectActiveCategory = category;
  selectPositivePrompt = "";
  selectNegativePrompt = "";
  closeBlockDialog();
  renderSelectBuilder();
  showToast(existingBlock ? `ブロック更新: ${label}` : `ブロック追加: ${label}`);
}

function deleteCustomBlock(blockId) {
  const block = userSelectBlocks.find(item => item.id === blockId);
  if (!block) return;
  userSelectBlocks = userSelectBlocks.filter(item => item.id !== blockId);
  localStorage.setItem(LS_SELECT_BLOCKS, JSON.stringify(userSelectBlocks));
  if (selectSelected[block.category] === blockId) delete selectSelected[block.category];
  renderSelectBuilder();
  showToast(`ブロック削除: ${block.label}`);
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

// ---- タグ追加: LocalStorage → メモリ注入 ----
function applyUserAddedTags() {
  for (const entry of userAddedTags) {
    injectUserTagEntry(entry);
  }
}

function injectUserTagEntry(entry) {
  const cat = v2Data.categories.find(c => c.id === entry.catId);
  if (!cat) return;

  const tag = { en: entry.en, jp: entry.jp, target: entry.target || null, _userAdded: true };
  if (entry.target_note) tag.target_note = entry.target_note;

  if (cat.subcategories && entry.scId) {
    let sc = cat.subcategories.find(s => s.id === entry.scId);
    if (!sc) {
      sc = { id: entry.scId, label: entry.scLabel || "ユーザー追加", sections: [] };
      cat.subcategories.push(sc);
    }
    let sec = (sc.sections || []).find(s => s.id === entry.secId);
    if (!sec) {
      sec = { id: entry.secId, label: entry.secLabel || "ユーザー追加", tags: [] };
      if (!sc.sections) sc.sections = [];
      sc.sections.push(sec);
    }
    sec.tags.push(tag);
  } else {
    if (!cat.sections) cat.sections = [];
    let sec = cat.sections.find(s => s.id === entry.secId);
    if (!sec) {
      sec = { id: entry.secId, label: entry.secLabel || "ユーザー追加", tags: [] };
      cat.sections.push(sec);
    }
    sec.tags.push(tag);
  }
}

function checkDuplicateEn(enKey) {
  for (const cat of v2Data.categories) {
    for (const sc of (cat.subcategories || [])) {
      for (const sec of (sc.sections || [])) {
        if (sec.tags.some(t => t.en.toLowerCase().trim() === enKey)) return true;
      }
    }
    for (const sec of (cat.sections || [])) {
      if (sec.tags.some(t => t.en.toLowerCase().trim() === enKey)) return true;
    }
  }
  return false;
}

// ---- タグ追加ダイアログ ----
function openAddTagDialog() {
  showTadError("");
  tadEn.value = "";
  tadJp.value = "";
  tadTarget.value = "";
  tadTnote.value = "";
  populateCatSelect();
  tagAddDialog.classList.add("show");
  setTimeout(() => tadEn.focus(), 50);
}

function closeAddTagDialog() {
  tagAddDialog.classList.remove("show");
}

function showTadError(msg) {
  tadError.textContent = msg;
}

function updateTadUserCount() {
  tadUserCount.textContent = userAddedTags.length > 0 ? `${userAddedTags.length} 件` : "";
}

function populateCatSelect() {
  tadCat.innerHTML = "";
  for (const cat of v2Data.categories) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label;
    tadCat.appendChild(opt);
  }
  onTadCatChange();
}

function onTadCatChange() {
  const cat = v2Data.categories.find(c => c.id === tadCat.value);
  if (!cat) return;

  if (cat.subcategories && cat.subcategories.length > 0) {
    tadScRow.style.display = "";
    populateTadScSelect(cat);
  } else {
    tadScRow.style.display = "none";
    tadScNew.style.display = "none";
    tadSecRow.style.display = "";
    populateTadSecSelect(cat.sections || []);
  }
}

function populateTadScSelect(cat) {
  tadSc.innerHTML = "";
  for (const sc of cat.subcategories) {
    const opt = document.createElement("option");
    opt.value = sc.id;
    opt.textContent = sc.label;
    tadSc.appendChild(opt);
  }
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "── 新規作成 ──";
  tadSc.appendChild(newOpt);
  onTadScChange();
}

function onTadScChange() {
  const cat = v2Data.categories.find(c => c.id === tadCat.value);
  if (!cat || !cat.subcategories) return;

  if (tadSc.value === "__new__") {
    tadScNew.style.display = "";
    tadScNew.value = "";
    // 新規sc時はセクションも新規
    tadSecRow.style.display = "";
    tadSec.innerHTML = '<option value="__new__">── 新規作成 ──</option>';
    tadSecNew.style.display = "";
    tadSecNew.value = "";
  } else {
    tadScNew.style.display = "none";
    const sc = cat.subcategories.find(s => s.id === tadSc.value);
    if (sc) {
      tadSecRow.style.display = "";
      populateTadSecSelect(sc.sections || []);
    }
  }
}

function populateTadSecSelect(sections) {
  tadSec.innerHTML = "";
  for (const sec of sections) {
    const opt = document.createElement("option");
    opt.value = sec.id;
    opt.textContent = sec.label;
    tadSec.appendChild(opt);
  }
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "── 新規作成 ──";
  tadSec.appendChild(newOpt);
  onTadSecChange();
}

function onTadSecChange() {
  if (tadSec.value === "__new__") {
    tadSecNew.style.display = "";
    tadSecNew.value = "";
  } else {
    tadSecNew.style.display = "none";
  }
}

function commitAddTag() {
  const en = tadEn.value.trim();
  const jp = tadJp.value.trim();

  if (!en) { showTadError("EN は必須です"); tadEn.focus(); return; }
  if (!jp) { showTadError("JP は必須です"); tadJp.focus(); return; }

  const enKey = en.toLowerCase();
  if (checkDuplicateEn(enKey)) {
    showTadError(`"${en}" は既に存在します`);
    return;
  }

  const cat = v2Data.categories.find(c => c.id === tadCat.value);
  if (!cat) { showTadError("カテゴリを選択してください"); return; }

  const tag = {
    en, jp,
    target:     tadTarget.value || null,
    _userAdded: true,
  };
  if (tadTnote.value.trim()) tag.target_note = tadTnote.value.trim();

  const entry = {
    en, jp, catId: cat.id,
    target:      tag.target,
    target_note: tag.target_note,
    addedAt:     new Date().toISOString(),
  };

  let targetSec = null;

  if (cat.subcategories && cat.subcategories.length > 0) {
    if (tadSc.value === "__new__") {
      const scLabel = tadScNew.value.trim();
      if (!scLabel) { showTadError("サブカテゴリ名を入力してください"); tadScNew.focus(); return; }
      const secLabel = tadSecNew.value.trim();
      if (!secLabel) { showTadError("セクション名を入力してください"); tadSecNew.focus(); return; }
      const scId  = "user_sc_"  + Date.now();
      const secId = "user_sec_" + Date.now();
      const newSc  = { id: scId,  label: scLabel,  sections: [] };
      targetSec = { id: secId, label: secLabel, tags: [] };
      newSc.sections.push(targetSec);
      cat.subcategories.push(newSc);
      entry.scId = scId; entry.scLabel = scLabel;
      entry.secId = secId; entry.secLabel = secLabel;
    } else {
      const sc = cat.subcategories.find(s => s.id === tadSc.value);
      entry.scId = sc.id; entry.scLabel = sc.label;
      if (tadSec.value === "__new__") {
        const secLabel = tadSecNew.value.trim();
        if (!secLabel) { showTadError("セクション名を入力してください"); tadSecNew.focus(); return; }
        const secId = "user_sec_" + Date.now();
        targetSec = { id: secId, label: secLabel, tags: [] };
        if (!sc.sections) sc.sections = [];
        sc.sections.push(targetSec);
        entry.secId = secId; entry.secLabel = secLabel;
      } else {
        targetSec = sc.sections.find(s => s.id === tadSec.value);
        entry.secId = targetSec.id; entry.secLabel = targetSec.label;
      }
    }
  } else {
    if (!cat.sections) cat.sections = [];
    if (tadSec.value === "__new__") {
      const secLabel = tadSecNew.value.trim();
      if (!secLabel) { showTadError("セクション名を入力してください"); tadSecNew.focus(); return; }
      const secId = "user_sec_" + Date.now();
      targetSec = { id: secId, label: secLabel, tags: [] };
      cat.sections.push(targetSec);
      entry.secId = secId; entry.secLabel = secLabel;
    } else {
      targetSec = cat.sections.find(s => s.id === tadSec.value);
      entry.secId = targetSec.id; entry.secLabel = targetSec.label;
    }
  }

  targetSec.tags.push(tag);
  userAddedTags.push(entry);
  localStorage.setItem(LS_USER_TAGS, JSON.stringify(userAddedTags));

  renderRecords();
  buildSidebar();
  renderIndexPanel();
  updateTadUserCount();

  // 連続追加できるようフォームクリア・モーダル維持
  tadEn.value = "";
  tadJp.value = "";
  tadTarget.value = "";
  tadTnote.value = "";
  showTadError("");
  tadEn.focus();
  showToast(`追加: ${en}`);
}

// ---- ユーザー追加タグ エクスポート / インポート ----
function exportUserTags() {
  if (userAddedTags.length === 0) { showToast("追加済みタグがありません"); return; }
  const json = JSON.stringify(userAddedTags, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `prompthub_user_tags_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importUserTags(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error("invalid");
      let added = 0;
      for (const entry of data) {
        if (!entry.en || !entry.jp || !entry.catId) continue;
        const enKey = entry.en.toLowerCase().trim();
        if (userAddedTags.some(t => t.en.toLowerCase().trim() === enKey)) continue;
        if (checkDuplicateEn(enKey)) continue;
        userAddedTags.push(entry);
        injectUserTagEntry(entry);
        added++;
      }
      localStorage.setItem(LS_USER_TAGS, JSON.stringify(userAddedTags));
      renderRecords();
      buildSidebar();
      renderIndexPanel();
      updateTadUserCount();
      showToast(`インポート: ${added} 件追加`);
    } catch {
      showToast("インポート失敗: 無効なファイル形式");
    }
    tadImportInput.value = "";
  };
  reader.readAsText(file);
}

// ---- 選択式 Prompt Builder ----
function allSelectBlocks() {
  return [...userSelectBlocks, ...SELECT_BLOCKS];
}

function getSelectBlock(id) {
  return allSelectBlocks().find(block => block.id === id) || null;
}

function getSelectedSelectBlocks() {
  return SELECT_CATEGORY_ORDER
    .map(category => getSelectBlock(selectSelected[category]))
    .filter(Boolean);
}

function getSelectUsage(blockId) {
  return selectUsage[blockId] || { usage_count: 0, last_used_at: null };
}

function saveSelectUsage() {
  localStorage.setItem(LS_SELECT_USAGE, JSON.stringify(selectUsage));
}

function incrementSelectUsage() {
  const now = new Date().toISOString();
  for (const block of getSelectedSelectBlocks()) {
    const current = getSelectUsage(block.id);
    selectUsage[block.id] = {
      usage_count: (current.usage_count || 0) + 1,
      last_used_at: now,
    };
  }
  saveSelectUsage();
  renderSelectBuilder();
}

function buildSelectablePrompt() {
  const selected = getSelectedSelectBlocks();
  const positive = selected
    .filter(block => block.category !== "negative")
    .map(block => block.prompt)
    .filter(Boolean)
    .join(", ");
  const negatives = [
    DEFAULT_NEGATIVE_PROMPT,
    ...selected.filter(block => block.category === "negative").map(block => block.prompt).filter(Boolean),
    ...selected.map(block => block.negative_prompt).filter(Boolean),
  ];
  const negative = [...new Set(negatives.join(", ").split(",").map(x => x.trim()).filter(Boolean))]
    .join(", ");
  return { positive, negative };
}

function generateSelectablePrompt() {
  const { positive, negative } = buildSelectablePrompt();
  selectPositivePrompt = positive;
  selectNegativePrompt = negative;
  if (positive) incrementSelectUsage();
  renderGeneratedPrompts();
  showToast(positive ? "生成しました" : "ブロックを選択してください");
}

function clearSelectableBuilder() {
  selectSelected = {};
  selectPositivePrompt = "";
  selectNegativePrompt = "";
  renderSelectBuilder();
  showToast("選択式Builderをクリアしました");
}

function selectPromptBlock(blockId) {
  const block = getSelectBlock(blockId);
  if (!block) return;
  if (selectSelected[block.category] === block.id) {
    delete selectSelected[block.category];
  } else {
    selectSelected[block.category] = block.id;
  }
  selectPositivePrompt = "";
  selectNegativePrompt = "";
  renderSelectBuilder();
}

function selectableBlocksForActiveCategory() {
  const q = selectSearchQuery.trim().toLowerCase();
  return allSelectBlocks()
    .filter(block => block.enabled !== false && block.category === selectActiveCategory)
    .filter(block => {
      if (!q) return true;
      return (
        block.label.toLowerCase().includes(q) ||
        block.prompt.toLowerCase().includes(q) ||
        block.id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const au = getSelectUsage(a.id).usage_count || 0;
      const bu = getSelectUsage(b.id).usage_count || 0;
      if (bu !== au) return bu - au;
      if ((b.favorite ? 1 : 0) !== (a.favorite ? 1 : 0)) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      return a.label.localeCompare(b.label, "ja");
    });
}

function renderSelectBuilder() {
  if (!selectBuilder) return;
  renderSelectCategoryTabs();
  renderSelectBlocks();
  renderSelectedBlocks();
  renderGeneratedPrompts();
}

function renderSelectCategoryTabs() {
  selectCategoryTabs.innerHTML = "";
  for (const category of SELECT_CATEGORY_ORDER) {
    const total = allSelectBlocks().filter(block => block.enabled !== false && block.category === category).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "select-cat-tab" + (selectActiveCategory === category ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", selectActiveCategory === category ? "true" : "false");
    btn.dataset.category = category;
    btn.textContent = `${SELECT_CATEGORY_LABELS[category]} ${selectSelected[category] ? "✓" : ""} (${total})`;
    btn.addEventListener("click", () => {
      selectActiveCategory = category;
      renderSelectBuilder();
    });
    selectCategoryTabs.appendChild(btn);
  }
}

function renderSelectBlocks() {
  selectBlockList.innerHTML = "";
  const blocks = selectableBlocksForActiveCategory();
  if (blocks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "select-empty";
    empty.textContent = "該当するブロックがありません。";
    selectBlockList.appendChild(empty);
    return;
  }

  for (const block of blocks) {
    const usage = getSelectUsage(block.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "select-block-card" + (selectSelected[block.category] === block.id ? " selected" : "");
    btn.dataset.blockId = block.id;
    btn.innerHTML =
      `<span class="select-block-top">` +
        `<span class="select-block-label">${escHtml(block.label)}</span>` +
        `<span class="select-block-meta">${block.favorite ? "★ " : ""}${usage.usage_count || 0} uses</span>` +
      `</span>` +
      `<span class="select-block-prompt">${escHtml(block.prompt)}</span>` +
      (block.user_created ? `<span class="select-block-user">ユーザー作成</span>` : "");
    btn.addEventListener("click", () => selectPromptBlock(block.id));
    if (block.user_created) {
      const edit = document.createElement("span");
      edit.className = "select-block-edit";
      edit.textContent = "編集";
      edit.title = "このブロックを編集";
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditBlockDialog(block.id);
      });
      btn.appendChild(edit);

      const del = document.createElement("span");
      del.className = "select-block-delete";
      del.textContent = "削除";
      del.title = "このブロックを削除";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCustomBlock(block.id);
      });
      btn.appendChild(del);
    }
    selectBlockList.appendChild(btn);
  }
}

function renderSelectedBlocks() {
  selectedBlocks.innerHTML = "";
  const selected = getSelectedSelectBlocks();
  if (selected.length === 0) {
    const empty = document.createElement("div");
    empty.className = "selected-empty";
    empty.textContent = "未選択";
    selectedBlocks.appendChild(empty);
    return;
  }

  for (const block of selected) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selected-block-chip";
    chip.title = "クリックで解除";
    chip.innerHTML =
      `<span>${escHtml(SELECT_CATEGORY_LABELS[block.category])}: ${escHtml(block.label)}</span>` +
      `<span aria-hidden="true">×</span>`;
    chip.addEventListener("click", () => selectPromptBlock(block.id));
    selectedBlocks.appendChild(chip);
  }
}

function renderGeneratedPrompts() {
  positiveOutput.value = selectPositivePrompt;
  negativeOutput.value = selectNegativePrompt;
  selectCopyPositive.disabled = !selectPositivePrompt;
  selectCopyNegative.disabled = !selectNegativePrompt;
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
  builderBlockAdd.addEventListener("click", openBlockDialog);
  builderCopy.addEventListener("click", () => {
    const prompt = builderTags.map(t => t.en).join(", ");
    copyToClipboard(prompt);
  });
  builderClear.addEventListener("click", () => {
    builderTags = [];
    renderBuilder();
  });

  // ブロック追加ダイアログ
  blockConfirm.addEventListener("click", saveCustomBlock);
  blockCancel.addEventListener("click", closeBlockDialog);
  blockDialog.addEventListener("click", (e) => {
    if (e.target === blockDialog) closeBlockDialog();
  });
  blockNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBlockDialog();
  });
  blockPositiveInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBlockDialog();
  });
  blockNegativeInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBlockDialog();
  });

  // 選択式 Prompt Builder
  selectSearch.addEventListener("input", () => {
    selectSearchQuery = selectSearch.value;
    renderSelectBlocks();
  });
  selectGenerate.addEventListener("click", generateSelectablePrompt);
  selectCopyPositive.addEventListener("click", () => {
    if (!selectPositivePrompt) return;
    copyToClipboard(selectPositivePrompt);
    incrementSelectUsage();
  });
  selectCopyNegative.addEventListener("click", () => {
    if (!selectNegativePrompt) return;
    copyToClipboard(selectNegativePrompt);
    incrementSelectUsage();
  });
  selectClear.addEventListener("click", clearSelectableBuilder);

  // タグ追加ダイアログ
  tagAddBtn.addEventListener("click", openAddTagDialog);
  tadClose.addEventListener("click", closeAddTagDialog);
  tagAddDialog.addEventListener("click", (e) => {
    if (e.target === tagAddDialog) closeAddTagDialog();
  });
  tadConfirm.addEventListener("click", commitAddTag);
  tadEn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitAddTag(); }
    if (e.key === "Escape") closeAddTagDialog();
  });
  tadJp.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddTagDialog();
  });
  tadCat.addEventListener("change", onTadCatChange);
  tadSc.addEventListener("change", onTadScChange);
  tadSec.addEventListener("change", onTadSecChange);
  tadExportBtn.addEventListener("click", (e) => { e.stopPropagation(); exportUserTags(); });
  tadImportInput.addEventListener("change", (e) => {
    if (e.target.files[0]) importUserTags(e.target.files[0]);
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
  const fallbackCopy = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(`コピー: ${text}`);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`コピー: ${text}`),
      fallbackCopy
    );
  } else {
    fallbackCopy();
  }
}
