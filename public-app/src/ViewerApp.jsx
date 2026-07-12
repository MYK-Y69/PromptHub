import { useEffect, useMemo, useState } from "react";

function assetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path}`.replace(/^\/\//, "/");
}

const DATA_URL = assetUrl("data/tags.json");
const SEARCH_EXAMPLES = ["カメラ目線", "自然光", "full body", "笑顔", "背景"];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function flattenData(data) {
  const records = [];
  const categories = [];

  for (const category of data.categories || []) {
    const categoryEntry = {
      id: category.id,
      label: category.label,
      count: 0,
      subcategories: [],
    };

    for (const subcategory of category.subcategories || []) {
      const subcategoryEntry = {
        id: subcategory.id,
        label: subcategory.label,
        count: 0,
      };

      for (const section of subcategory.sections || []) {
        for (const [tagIndex, tag] of (section.tags || []).entries()) {
          const record = {
            id: `${category.id}/${subcategory.id}/${section.id}/${tagIndex}/${tag.en}`,
            en: tag.en,
            jp: tag.jp || "",
            target: tag.target || null,
            targetNote: tag.target_note || null,
            categoryId: category.id,
            categoryLabel: category.label,
            subcategoryId: subcategory.id,
            subcategoryLabel: subcategory.label,
            sectionId: section.id,
            sectionLabel: section.label,
            searchable: normalizeText([
              tag.en,
              tag.jp,
              category.label,
              subcategory.label,
              section.label,
              tag.target,
              tag.target_note,
            ].join(" ")),
          };
          records.push(record);
          categoryEntry.count += 1;
          subcategoryEntry.count += 1;
        }
      }

      if (subcategoryEntry.count > 0) {
        categoryEntry.subcategories.push(subcategoryEntry);
      }
    }

    if (categoryEntry.count > 0) {
      categories.push(categoryEntry);
    }
  }

  return { records, categories };
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
  return terms.length > 1 && terms.some((term) => searchable.includes(term));
}

export function ViewerApp() {
  const [dataState, setDataState] = useState({ status: "loading", data: null, error: "" });
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [showSensitive, setShowSensitive] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setDataState({ status: "ready", data, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setDataState({ status: "error", data: null, error: error.message || "Load failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dictionary = useMemo(() => flattenData(dataState.data || { categories: [] }), [dataState.data]);
  const activeCategory = dictionary.categories.find((category) => category.id === selectedCategory) || null;
  const activeSubcategory = activeCategory?.subcategories.find((subcategory) => subcategory.id === selectedSubcategory) || null;
  const visibleRecords = useMemo(() => {
    return dictionary.records.filter((record) => {
      if (!showSensitive && record.categoryId === "sensitive") return false;
      if (selectedCategory && record.categoryId !== selectedCategory) return false;
      if (selectedSubcategory && record.subcategoryId !== selectedSubcategory) return false;
      if (!matchesSearch(record.searchable, query)) return false;
      return true;
    });
  }, [dictionary.records, query, selectedCategory, selectedSubcategory, showSensitive]);

  const selectedRecord = visibleRecords.find((record) => record.id === selectedRecordId) || visibleRecords[0] || null;
  const totalVisible = dictionary.records.filter((record) => showSensitive || record.categoryId !== "sensitive").length;
  const displayedRecords = visibleRecords.slice(0, 120);

  function selectCategory(categoryId) {
    setSelectedCategory(categoryId);
    setSelectedSubcategory("");
    setSelectedRecordId("");
  }

  async function copyTag(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setCopied("コピーできませんでした");
    }
  }

  return (
    <div className="viewer-shell">
      <header className="topbar viewer-topbar">
        <div className="brand">
          <strong>PromptHub Viewer</strong>
          <span>read-only</span>
        </div>
        <div className="top-status">
          <span className="pill">{dataState.status === "ready" ? "compiled data" : dataState.status}</span>
          <button
            className={`pill pill-button ${showSensitive ? "active" : "muted"}`}
            aria-pressed={showSensitive}
            onClick={() => setShowSensitive((value) => !value)}
          >
            Sensitive {showSensitive ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      <main className="workspace explore viewer-workspace">
        <aside className="sidebar explore-sidebar">
          <h2>カテゴリ</h2>
          <button className={`category-button ${!selectedCategory ? "active" : ""}`} onClick={() => selectCategory("")}>
            <span>すべて</span><strong>{totalVisible.toLocaleString()}</strong>
          </button>
          {dictionary.categories.filter((category) => showSensitive || category.id !== "sensitive").map((category) => (
            <div key={category.id}>
              <button
                className={`category-button ${selectedCategory === category.id ? "active" : ""}`}
                onClick={() => selectCategory(category.id)}
              >
                <span>{category.label}</span><strong>{category.count.toLocaleString()}</strong>
              </button>
              {selectedCategory === category.id && (
                <div className="subcategory-list">
                  <button className={`subcategory-button ${!selectedSubcategory ? "active" : ""}`} onClick={() => setSelectedSubcategory("")}>
                    <span>カテゴリ内すべて</span><strong>{category.count.toLocaleString()}</strong>
                  </button>
                  {category.subcategories.map((subcategory) => (
                    <button
                      key={subcategory.id}
                      className={`subcategory-button ${selectedSubcategory === subcategory.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedSubcategory(subcategory.id);
                        setSelectedRecordId("");
                      }}
                    >
                      <span>{subcategory.label}</span><strong>{subcategory.count.toLocaleString()}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="notice">
            <strong>閲覧専用</strong>
            <p>この画面は検索とコピーだけに絞っています。</p>
          </div>
        </aside>

        <section className="content explore-content">
          <div className="search-hero">
            <label htmlFor="viewer-search">日本語・英語でタグ検索</label>
            <div className="search-row">
              <input
                id="viewer-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例: soft lighting, カメラ目線, full body"
              />
              <button onClick={() => setQuery("")}>Clear</button>
            </div>
            <div className="example-row" aria-label="検索例">
              {SEARCH_EXAMPLES.map((example) => (
                <button key={example} onClick={() => setQuery(example)}>{example}</button>
              ))}
            </div>
          </div>

          <div className="section-heading">
            <div>
              <h1>Explore</h1>
              <p>
                {visibleRecords.length.toLocaleString()} 件
                {activeCategory ? ` / ${activeCategory.label}` : ""}
                {activeSubcategory ? ` > ${activeSubcategory.label}` : ""}
              </p>
            </div>
            {copied && <span className="pill active">{copied === "コピーできませんでした" ? copied : "Copied"}</span>}
          </div>

          {dataState.status === "error" && (
            <div className="empty-state">
              <h2>データを読み込めませんでした</h2>
              <p>{dataState.error}</p>
            </div>
          )}

          {dataState.status === "loading" && (
            <div className="empty-state">
              <h2>読み込み中</h2>
              <p>タグデータを準備しています。</p>
            </div>
          )}

          {dataState.status === "ready" && displayedRecords.length === 0 && (
            <div className="empty-state">
              <h2>該当するタグがありません</h2>
              <p>検索語を短くするか、カテゴリを切り替えてください。</p>
            </div>
          )}

          {displayedRecords.length > 0 && (
            <table className="tag-table">
              <thead>
                <tr>
                  <th>English tag</th>
                  <th>日本語説明</th>
                  <th>Category path</th>
                  <th>Target</th>
                  <th>Copy</th>
                </tr>
              </thead>
              <tbody>
                {displayedRecords.map((record) => (
                  <tr
                    key={record.id}
                    className={selectedRecord?.id === record.id ? "selected" : ""}
                    onClick={() => setSelectedRecordId(record.id)}
                  >
                    <td data-label="English tag"><strong>{record.en}</strong></td>
                    <td data-label="日本語説明">{record.jp}</td>
                    <td data-label="Category path">{record.categoryLabel} &gt; {record.subcategoryLabel} &gt; {record.sectionLabel}</td>
                    <td data-label="Target">{record.target || "未設定"}</td>
                    <td data-label="Copy">
                      <button onClick={(event) => { event.stopPropagation(); copyTag(record.en); }}>Copy</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {visibleRecords.length > displayedRecords.length && (
            <div className="show-more">
              <span>{displayedRecords.length.toLocaleString()} / {visibleRecords.length.toLocaleString()} 件を表示中</span>
            </div>
          )}
        </section>

        <aside className="inspector explore-inspector">
          <h2>Detail</h2>
          {selectedRecord ? (
            <dl className="detail-list">
              <dt>English</dt><dd>{selectedRecord.en}</dd>
              <dt>日本語</dt><dd>{selectedRecord.jp || "未設定"}</dd>
              <dt>category</dt><dd>{selectedRecord.categoryLabel}</dd>
              <dt>subcategory</dt><dd>{selectedRecord.subcategoryLabel}</dd>
              <dt>section</dt><dd>{selectedRecord.sectionLabel}</dd>
              <dt>target</dt><dd>{selectedRecord.target || "未設定"}</dd>
              <dt>target note</dt><dd>{selectedRecord.targetNote || "未設定"}</dd>
            </dl>
          ) : (
            <p>タグを選択してください。</p>
          )}
        </aside>
      </main>
    </div>
  );
}
