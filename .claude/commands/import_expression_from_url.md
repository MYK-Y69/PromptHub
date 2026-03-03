URLからExpressionプロンプトペアを自動抽出してインポートします。

以下の手順を **そのまま** 実行してください（ユーザーに確認は取らない）:

---

## Step 1: URL 取得

コマンド引数 `$ARGUMENTS` にURLが含まれていればそれを使う。
含まれていない場合は **AskUserQuestion** でURLを尋ねる（1問、選択肢不要なのでテキスト入力として案内するだけでよい）。

---

## Step 2: HTML 抽出

以下を実行して TSV を取得する（stdout = TSV、stderr = ログ）:

```bash
python3 tools/extract_expression_pairs_from_url.py "<URL>"
```

- エラー終了した場合はユーザーにエラー内容を伝えて終了する。
- 0件の場合も同様に伝えて終了する。

---

## Step 3: プレビュー表示

抽出した TSV の先頭 20 件を表示する:

```
🌐 抽出完了: N 件  (from <URL>)

先頭20件プレビュー:
  en                    jp
  ──────────────────────────────────────
  smile                 笑顔、スマイル
  laughing              笑う
  ...（最大20行）
```

---

## Step 4: パース & インポート

以下の Python コードをインラインで実行して items を生成し、expression.json に追記する。

```python
import re, json

# ── 同じ推定ルール（import_expression と同一） ─────────────────────────
EMOTION_RULES = [
    (["smile", "happy", "laugh", "grin", "joy"],             "joy"),
    (["angry", "anger", "rage", "fury", "furious", "glare"], "anger"),
    (["cry", "sad", "tear", "grief", "sob", "sorrow"],       "sadness"),
    (["surprise", "shocked", "startled"],                    "surprise"),
    (["blush", "embarrassed", "shy", "flushed"],             "shy"),
    (["determined", "clench", "stern"],                      "determined"),
    (["smug", "proud", "confident"],                         "smug"),
    (["tired", "sleepy", "drowsy", "vacant"],                "tired"),
    (["confused", "troubled", "worried", "anxious"],         "confused"),
    (["neutral", "blank", "expressionless", "calm"],         "neutral"),
]

PART_RULES = [
    (["eye", "eyes", "eyelid", "pupil", "gaze", "stare"],   "eye"),
    (["mouth", "lip", "lips", "tongue"],                     "mouth"),
    (["teeth", "tooth", "fang", "fangs", "clenched teeth"],  "teeth"),
    (["brow", "eyebrow", "eyebrows"],                        "brow"),
    (["sweat", "sweating", "sweatdrop"],                     "sweat"),
    (["blush", "blushing", "flushed"],                       "blush_detail"),
]

def infer_emotion(en):
    lower = en.lower()
    for keywords, tag in EMOTION_RULES:
        if any(kw in lower for kw in keywords):
            return tag
    return "neutral"

def infer_parts(en):
    lower = en.lower()
    parts = []
    for keywords, tag in PART_RULES:
        if any(kw in lower for kw in keywords):
            if tag == "teeth" and "mouth" not in parts:
                parts.append("mouth")
            if tag not in parts:
                parts.append(tag)
    return parts

def to_snake(en):
    s = re.sub(r"[^a-z0-9]+", "_", en.lower().strip())
    return "expression_" + s.strip("_")

def merge_tags(*tag_lists):
    seen, result = set(), []
    for tags in tag_lists:
        for t in tags:
            t = t.strip()
            if t and t not in seen:
                seen.add(t)
                result.append(t)
    return result

# ── TSV → items ──────────────────────────────────────────────────────────────
# `tsv_text` には Step 2 で取得した TSV 文字列を渡す（en\tjp 形式）
def parse_tsv(tsv_text, source_url=""):
    items = []
    for line in tsv_text.splitlines():
        line = line.strip()
        if not line:
            continue
        cols = line.split("\t", 1)
        if len(cols) < 2:
            continue
        en, jp = cols[0].strip(), cols[1].strip()
        if not en or not jp:
            continue
        emotion = infer_emotion(en)
        parts   = infer_parts(en)
        tags    = merge_tags(["expression", "emotion", emotion], parts)
        items.append({
            "id":     to_snake(en),
            "en":     en,
            "jp":     jp,
            "tags":   tags,
            "source": source_url,
        })
    return items

# ── 重複チェック & マージ ─────────────────────────────────────────────────────
# expression.json を読み込んで重複排除し、新規のみ追記する
EXPR_PATH = "data/dictionary/categories/expression.json"

with open(EXPR_PATH, encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {item["id"] for item in data["items"]}
existing_ens = {item["en"].lower() for item in data["items"]}

new_items = parse_tsv(tsv_text, source_url=url)

added   = []
skipped = []
for item in new_items:
    if item["id"] in existing_ids:
        skipped.append((item["id"], item["en"], "id重複"))
    elif item["en"].lower() in existing_ens:
        skipped.append((item["id"], item["en"], "en重複"))
    else:
        data["items"].append(item)
        existing_ids.add(item["id"])
        existing_ens.add(item["en"].lower())
        added.append(item)

with open(EXPR_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
```

---

## Step 5: コンパイル

```bash
python3 tools/compile_dictionary.py
```

---

## Step 6: 結果レポート

```
✅ 追加: N 件
⏭  スキップ: M 件（重複）
📦 expression 合計: T 件

追加された項目（先頭20件）:
  - expression_smile: smile → tags: [expression, emotion, joy]
  - ...

スキップ（重複）: M 件
```

スキップ件数が多い場合は全件ではなく件数のみ表示してよい（10件以下は全表示）。

---

## 制約

- commit / push は **絶対にしない**
- 他カテゴリ（focus.json, pov.json 等）は **触らない**
- `expression.json` 以外のファイルを直接編集しない（compile は OK）
- source フィールドには取得元 URL を記録する
