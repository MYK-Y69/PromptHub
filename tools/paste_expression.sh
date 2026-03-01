#!/usr/bin/env bash
# paste_expression.sh - stdin (jp/en text) → TSV → import → commit/push
#
# Safety guards (all mandatory; any failure aborts before commit/push):
#   [2] rows (excl. header) < 10        → abort
#   [3] any empty en/key                → abort
#   [4] duplicate rate > 50%            → abort
#   [6] expression.json not valid JSON  → abort
#   [7] unexpected changed files        → abort
#
# Usage:
#   cat pairs.txt | bash tools/paste_expression.sh
#   <<'EOF' | bash tools/paste_expression.sh
#   怒り（anger）
#   ...
#   EOF

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

PYTHON="${PYTHON:-python3}"

# Only these paths may appear in git status after the import
readonly ALLOWED_PATTERN='^(data/dictionary/expression\.json|imports/inbox/[^/]+\.tsv)$'

# ─────────────────────────────────────────────────────────────────────────────
die() { echo ""; echo "ABORT: $*" >&2; exit 1; }
banner() { echo ""; echo "── $* ──────────────────────────────────────────────"; }
# ─────────────────────────────────────────────────────────────────────────────

banner "paste_expression.sh"

# ── 1. Parse stdin → TSV ─────────────────────────────────────────────────────
echo "[1/7] Extracting jp/en pairs from stdin..."
TSV_PATH=$("${PYTHON}" tools/extract_to_tsv.py --echo-path)
[[ -z "${TSV_PATH}" ]] && die "No TSV path returned from extract_to_tsv.py"
echo "      TSV: ${TSV_PATH}"

# ── 2. Row count ≥ 10 ────────────────────────────────────────────────────────
echo "[2/7] Checking row count..."
ROW_COUNT=$(tail -n +2 "${TSV_PATH}" | wc -l | tr -d ' ')
echo "      Rows (excl. header): ${ROW_COUNT}"
[[ "${ROW_COUNT}" -lt 10 ]] && die "Too few rows (${ROW_COUNT} < 10 minimum)"

# ── 3. No empty en/key ───────────────────────────────────────────────────────
echo "[3/7] Checking for empty en/key values..."
EMPTY_KEY_COUNT=$(
  tail -n +2 "${TSV_PATH}" \
  | awk -F'\t' '{ if ($3 == "") count++ } END { print count+0 }'
)
echo "      Empty en/key count: ${EMPTY_KEY_COUNT}"
[[ "${EMPTY_KEY_COUNT}" -gt 0 ]] && die "${EMPTY_KEY_COUNT} row(s) have an empty en/key"

# ── 4. Duplicate rate ≤ 50% ──────────────────────────────────────────────────
echo "[4/7] Checking duplicate rate against existing data..."
DUP_OUTPUT=$(
  TSV_PATH="${TSV_PATH}" "${PYTHON}" - <<'PYEOF'
import json, csv, os, sys
from pathlib import Path

tsv_path = os.environ["TSV_PATH"]
expr_path = Path("data/dictionary/expression.json")

if not expr_path.exists():
    print("0 0")
    sys.exit(0)

with open(expr_path, encoding="utf-8") as f:
    existing = {item["en"] for item in json.load(f)["items"]}

with open(tsv_path, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f, delimiter="\t"))

total = len(rows)
dups = sum(1 for r in rows if r.get("en", "").strip() in existing)
print(f"{dups} {total}")
PYEOF
)
DUPS=$(echo "${DUP_OUTPUT}" | awk '{print $1}')
TOTAL=$(echo "${DUP_OUTPUT}" | awk '{print $2}')
echo "      Duplicates: ${DUPS} / ${TOTAL}"
if [[ "${TOTAL}" -gt 0 ]]; then
  DUP_PCT=$(( DUPS * 100 / TOTAL ))
  echo "      Duplicate rate: ${DUP_PCT}%"
  [[ "${DUP_PCT}" -gt 50 ]] && die "Duplicate rate too high (${DUP_PCT}% > 50%)"
fi

# ── 5. Import into expression.json ───────────────────────────────────────────
echo "[5/7] Running import_tsv.py..."
"${PYTHON}" tools/import_tsv.py "${TSV_PATH}"

# ── 6. Validate expression.json ──────────────────────────────────────────────
echo "[6/7] Validating expression.json is valid JSON..."
"${PYTHON}" -c "
import json, sys
try:
    json.load(open('data/dictionary/expression.json', encoding='utf-8'))
    print('      JSON OK')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" || die "expression.json failed JSON validation after import"

# ── 7. git status: only expected files ───────────────────────────────────────
echo "[7/7] Checking git status for unexpected changed files..."
GIT_STATUS=$(git status --porcelain)
if [[ -n "${GIT_STATUS}" ]]; then
  while IFS= read -r status_line; do
    [[ -z "${status_line}" ]] && continue
    FPATH="${status_line:3}"  # strip "XY " (3 chars) prefix
    if ! echo "${FPATH}" | grep -qE "${ALLOWED_PATTERN}"; then
      die "Unexpected changed file: '${FPATH}' — aborting before commit"
    fi
  done <<< "${GIT_STATUS}"
  echo "      Changed files (all allowed):"
  echo "${GIT_STATUS}" | awk '{print "        " substr($0,4)}'
else
  echo "      No changes detected (nothing to commit)"
  exit 0
fi

# ── Commit & push ─────────────────────────────────────────────────────────────
banner "Committing and pushing"
git add data/dictionary/expression.json "${TSV_PATH}"
COMMIT_MSG="feat(expression): import entries from $(basename "${TSV_PATH}")"
git commit -m "${COMMIT_MSG}"
git push

banner "Done"
echo "TSV    : ${TSV_PATH}"
echo "Commit : ${COMMIT_MSG}"
