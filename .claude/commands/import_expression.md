Expression プロンプトを1行1件の形式で貼り付けてください。

以下の手順を **そのまま** 実行してください（ユーザーに確認は取らない）:

---

## Step 1: 入力受け取り

`AskUserQuestion` ツールでテキストボックスを出すか、会話テキストをそのまま受け取る。
既にユーザーがテキストを貼り付けている場合はそれを使う。

---

## Step 2: パース & 推論

以下の Python コードをインラインで実行して items を生成する。

```python
import re

EMOTION_RULES = [
    (["smile", "happy", "laugh", "grin", "joy"],            "joy"),
    (["angry", "anger", "rage", "fury", "furious", "glare"],"anger"),
    (["cry", "sad", "tear", "grief", "sob", "sorrow"],      "sadness"),
    (["surprise", "shocked", "startled"],                   "surprise"),
    (["blush", "embarrassed", "shy", "flushed"],            "shy"),
    (["determined", "clench", "stern"],                     "determined"),
    (["smug", "proud", "confident"],                        "smug"),
    (["tired", "sleepy", "drowsy", "vacant"],               "tired"),
    (["confused", "troubled", "worried", "anxious"],        "confused"),
    (["neutral", "blank", "expressionless", "calm"],        "neutral"),
]

def infer_emotion(en: str) -> str:
    lower = en.lower()
    for keywords, tag in EMOTION_RULES:
        if any(kw in lower for kw in keywords):
            return tag
    return "neutral"

def to_snake(en: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", en.lower().strip())
    return "expression_" + s.strip("_")

def parse_lines(raw: str) -> list[dict]:
    items = []
    for line in raw.splitlines():
        en = line.strip()
        if not en:
            continue
        emotion = infer_emotion(en)
        tags = ["expression", "emotion", emotion]
        items.append({
            "id":  to_snake(en),
            "en":  en,
            "jp":  "",
            "tags": tags,
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

スキップされた項目:
  - <id>: <en>（理由: id重複 or en重複）
```

---

## 制約

- commit / push は **絶対にしない**
- 他カテゴリ（focus.json, pov.json 等）は **触らない**
- `expression.json` 以外のファイルを直接編集しない（compile は OK）
