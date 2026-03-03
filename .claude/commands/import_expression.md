Expression プロンプトを貼り付けてください。
**1行=英文** または **TSV（タブ区切り）** の両方に対応しています。

以下の手順を **そのまま** 実行してください（ユーザーに確認は取らない）:

---

## Step 1: 入力受け取り

`AskUserQuestion` ツールでテキストボックスを出すか、会話テキストをそのまま受け取る。
既にユーザーがテキストを貼り付けている場合はそれを使う。

---

## Step 2: モード判定 & パース

行にタブ文字（`\t`）が含まれるかどうかで **自動的に** モードを判定する。
1行ずつ独立して判定してよい（混在OK）。

以下の Python コードをインラインで実行して items を生成する。

```python
import re

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
    # (keywords, tag) — 順序は eye→mouth→teeth→brow→sweat→blush_detail
    (["eye", "eyes", "eyelid", "pupil", "gaze", "stare"],   "eye"),
    (["mouth", "lip", "lips", "tongue"],                     "mouth"),
    (["teeth", "tooth", "fang", "fangs", "clenched teeth"],  "teeth"),   # mouth も追加される
    (["brow", "eyebrow", "eyebrows"],                        "brow"),
    (["sweat", "sweating", "sweatdrop"],                     "sweat"),
    (["blush", "blushing", "flushed"],                       "blush_detail"),
]

def infer_emotion(en: str) -> str:
    lower = en.lower()
    for keywords, tag in EMOTION_RULES:
        if any(kw in lower for kw in keywords):
            return tag
    return "neutral"

def infer_parts(en: str) -> list[str]:
    """enからパーツタグを推定して返す（eye→mouth→teeth→brow→sweat→blush_detail 順）。"""
    lower = en.lower()
    parts = []
    for keywords, tag in PART_RULES:
        if any(kw in lower for kw in keywords):
            if tag == "teeth" and "mouth" not in parts:
                parts.append("mouth")   # teeth は mouth も含む
            if tag not in parts:
                parts.append(tag)
    return parts

def to_snake(en: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", en.lower().strip())
    return "expression_" + s.strip("_")

def merge_tags(*tag_lists) -> list[str]:
    """重複を除去しながらタグをマージ。順序: expression > emotion > emotion_tag > parts > extra."""
    seen, result = set(), []
    for tags in tag_lists:
        for t in tags:
            t = t.strip()
            if t and t not in seen:
                seen.add(t)
                result.append(t)
    return result

def parse_extra_tags(raw: str) -> list[str]:
    """col3のタグ列をカンマ or 空白で分割して返す。"""
    return [t.strip() for t in re.split(r"[,\s]+", raw) if t.strip()]

def parse_lines(raw: str) -> list[dict]:
    items = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue

        if "\t" in line:
            # ── Mode B: TSV ──────────────────────────────────────────
            cols = [c.strip() for c in line.split("\t")]
            en   = cols[0] if len(cols) > 0 else ""
            jp   = cols[1] if len(cols) > 1 else ""
            extra_tags = parse_extra_tags(cols[2]) if len(cols) > 2 else []
            # col4以降は無視
        else:
            # ── Mode A: 1行=英文 ──────────────────────────────────────
            en, jp, extra_tags = line, "", []

        if not en:
            continue

        emotion = infer_emotion(en)
        parts   = infer_parts(en)
        tags = merge_tags(["expression", "emotion", emotion], parts, extra_tags)

        items.append({
            "id":     to_snake(en),
            "en":     en,
            "jp":     jp,
            "tags":   tags,
            "source": "",
        })
    return items
```

---

## Step 3: 重複チェック & マージ

`data/dictionary/categories/expression.json` を読み込む。

- 既存 `id` と一致 → スキップ（ログ出力）
- 既存 `en`（大文字小文字無視）と一致 → スキップ（ログ出力）
- それ以外 → `items` リスト末尾に追加

**既存アイテムは絶対に削除・上書きしない。**

---

## Step 4: 書き戻し & コンパイル

1. `expression.json` を書き戻す（`json.dumps(..., ensure_ascii=False, indent=2)`）
2. 以下を実行:
   ```bash
   python3 tools/compile_dictionary.py
   ```

---

## Step 5: 結果レポート

以下の形式で表示する:

```
✅ 追加: N 件
⏭  スキップ: M 件（重複）
📦 expression 合計: T 件

追加された項目:
  - <id>: <en> → tags: [<tag1>, <tag2>, ...]

スキップされた項目:
  - <id>: <en>（理由: id重複 or en重複）
```

---

## 対応フォーマット早見表

| 入力例 | 判定 | en | jp | emotion推定 | parts推定 |
|---|---|---|---|---|---|
| `smiling` | Mode A | smiling | "" | joy | — |
| `smirk\tニヤリ` | Mode B | smirk | ニヤリ | neutral | — |
| `crying face\t泣き顔\temotion,sadness` | Mode B | crying face | 泣き顔 | sadness | — |
| `vacant eyes\tうつろな目\temotion,tired` | Mode B | vacant eyes | うつろな目 | tired | eye |
| `clenched teeth` | Mode A | clenched teeth | "" | determined | mouth, teeth |
| `angry eyes` | Mode A | angry eyes | "" | anger | eye |
| `blushing cheeks` | Mode A | blushing cheeks | "" | shy | blush_detail |

---

## 制約

- commit / push は **絶対にしない**
- 他カテゴリ（focus.json, pov.json 等）は **触らない**
- `expression.json` 以外のファイルを直接編集しない（compile は OK）
