現在の変更を commit して v2 ブランチへ push し、GitHub Actions の完了を待つ。

**引数 `$ARGUMENTS`:** コミットメッセージを指定可能（省略時は自動生成）

以下の手順を **そのまま** 実行してください。push の前にユーザーへ確認を取ること。

---

## Step 1: ブランチ・状態確認

```bash
git branch --show-current
git status --short
git diff --stat HEAD
git log --oneline -3
```

- `main` ブランチにいる場合: 「v2 ブランチで実行してください」と伝えて終了する
- 未コミットの変更がない場合: 「コミットする変更がありません」と伝えて終了する

---

## Step 2: 変更内容の確認

```python
import subprocess, json
from pathlib import Path

# 変更ファイル一覧
result = subprocess.run(["git", "status", "--short"], capture_output=True, text=True)
changed = [line.strip() for line in result.stdout.strip().splitlines() if line.strip()]
print("変更ファイル:")
for f in changed:
    print(f"  {f}")

# v2 compiled の状態
if Path("data/v2/compiled/tags.json").exists():
    with open("data/v2/compiled/tags.json") as f:
        d = json.load(f)
    print(f"\nv2/compiled/tags.json: {d['count']} tags  ({d['generated_at']})")
```

---

## Step 3: ユーザーへ確認（必須）

以下の形式で push 内容を明示してユーザーに確認する:

```
以下の内容を v2 ブランチへ push します:

  変更ファイル: <変更ファイル一覧>
  tags 件数   : N tags
  push 先     : origin/v2

push してよいですか？
```

**ユーザーが承認した場合のみ** Step 4 以降を実行する。

---

## Step 4: commit

コミットメッセージの決定:
- `$ARGUMENTS` が空でない場合: そのままコミットメッセージに使用する
- `$ARGUMENTS` が空の場合: 変更内容から自動生成する（例: `feat(v2): update tags data`）

```bash
git add data/v2/ app/
git status --short
git commit -m "<コミットメッセージ>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

`app/` 配下の変更がない場合は `app/` を `git add` に含めない。

---

## Step 5: push

```bash
git push origin v2
```

push 後に出力されるリモート URL を表示する。

---

## Step 6: GitHub Actions 確認

```bash
sleep 15
gh run list --branch v2 --limit 3 2>/dev/null || echo "gh コマンドが使えません。GitHub Actions の状態はブラウザで確認してください。"
```

`gh` が使える場合: 実行中の Actions を表示する。
使えない場合: 「push 後 約1分待ってからブラウザをリロードしてください」と案内する。

---

## Step 7: 完了レポート

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  prompthub-deploy 完了
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
commit  : <コミットハッシュ> <メッセージ>
push    : ✅ origin/v2
tags    : N tags
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actions 完了後（約1分）に通常リロードで最新が表示されます。
```

---

## 制約

- **必ずユーザーに確認してから push する**
- `main` ブランチへの push は **絶対にしない**（Phase 5 の `/prompthub-merge` で行う）
- `git reset --hard` / `git push --force` は **しない**
