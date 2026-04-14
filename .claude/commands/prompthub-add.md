Google スプレッドシート（CSV 公開）からタグを取り込み `data/v2/tags.json` に追加する。

**引数 `$ARGUMENTS`:**
- 引数なし: 取り込み実行（JSON追加・コンパイルまで）
- `--deploy`: 取り込み後に git commit & push まで一気通貫で実行
- `--dry-run`: JSON を変更せず統計のみ表示
- `--force`: 重複 en タグの jp を上書き更新

以下の手順を **そのまま** 実行してください。

---

## Step 1: 設定確認

```python
import json
from pathlib import Path

cfg_path = Path("data/v2/sheets_config.json")
cfg = json.loads(cfg_path.read_text())
url = cfg.get("csv_url", "").strip()

if not url:
    print("エラー: sheets_config.json の csv_url が未設定です。")
    print()
    print("設定手順:")
    print("  1. Google スプレッドシートを開く")
    print("  2. ファイル → 共有 → ウェブに公開")
    print("  3. 「カンマ区切り形式 (.csv)」を選択して「公開」")
    print("  4. 表示された URL を data/v2/sheets_config.json の csv_url に設定")
    print()
    print("スプレッドシートのカラム構成（1行目はヘッダー）:")
    print("  en | jp | category | subcategory | section | target | target_note")
else:
    print(f"CSV URL: {url[:80]}...")
    print("設定 OK")
```

URL が未設定なら設定方法を案内して終了する。

---

## Step 2: 現在の v2 データ確認

```python
import json
from pathlib import Path

with open("data/v2/tags.json") as f:
    d = json.load(f)
print(f"v2/tags.json: {d['count']} tags / {len(d['categories'])} categories")
```

---

## Step 3: 取り込み実行

```bash
python3 tools/import_sheets.py $ARGUMENTS
```

- CSV 取得失敗: エラーを表示して終了
- `--dry-run` 時: 統計を表示して終了（JSON 変更なし）
- `--deploy` 時: import_sheets.py 内で commit & push まで完結する

---

## Step 4: 取り込み後の確認（--deploy なしの場合のみ）

`$ARGUMENTS` に `--deploy` が含まれる場合はこの Step をスキップする（import_sheets.py が完了レポートを出力済みのため）。

```python
import json
from pathlib import Path

with open("data/v2/tags.json") as f:
    d_src = json.load(f)
with open("data/v2/compiled/tags.json") as f:
    d_comp = json.load(f)

print()
print("━" * 50)
print("  取り込み完了")
print("━" * 50)
print(f"v2/tags.json:          {d_src['count']:5d} tags")
print(f"v2/compiled/tags.json: {d_comp['count']:5d} tags")
print()

# 最終ログ確認
log_path = Path("data/v2/sheets_import_log.jsonl")
if log_path.exists():
    lines = log_path.read_text().strip().splitlines()
    print(f"累計ログ件数: {len(lines)} 行")
    # 直近の added を表示
    added = [json.loads(l) for l in lines if '"added"' in l]
    print(f"  追加済み合計: {len(added)} タグ")
print("━" * 50)
print("次のステップ: /prompthub-deploy で push")
```

---

## 制約

- `--deploy` なしの場合: `git commit` / `git push` は **しない**（`/prompthub-deploy` で行う）
- `--deploy` の場合: import_sheets.py 内で commit & push まで完結する
- `data/v2/` 以外のファイルは変更しない
