#!/usr/bin/env python3
"""
extract_to_tsv.py - Parse pasted jp/en pairs → imports/inbox/<category>_<timestamp>.tsv

Supported line formats:
  日本語（english）     full-width parentheses
  日本語(english)      half-width parentheses
  日本語 - english     dash separator
  日本語\tenglish      tab separator
  english : 日本語     colon, reversed (absorbed)

Options:
  --echo-path   Print only the generated TSV path to stdout (for shell capture)

Usage:
  echo "怒り（anger）" | python tools/extract_to_tsv.py
  cat pairs.txt   | python tools/extract_to_tsv.py --echo-path
"""
from __future__ import annotations

import sys
import re
import csv
import argparse
from datetime import datetime
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent
INBOX_DIR = REPO_DIR / "imports" / "inbox"
CATEGORY = "expression"

_JP_RE = re.compile(
    r"[\u3040-\u309F"   # Hiragana
    r"\u30A0-\u30FF"    # Katakana
    r"\u4E00-\u9FFF"    # CJK Unified Ideographs
    r"\u3400-\u4DBF"    # CJK Extension A
    r"\uF900-\uFAFF]"   # CJK Compatibility Ideographs
)


def is_japanese(text: str) -> bool:
    return bool(_JP_RE.search(text))


def normalize_en(text: str) -> str:
    """Lowercase + strip; remove chars that aren't word/space/hyphen."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s\-]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _orient(a: str, b: str) -> tuple[str, str] | None:
    """Return (jp, en) if the two fragments can be oriented, else None."""
    if not a or not b:
        return None
    if is_japanese(a) and not is_japanese(b):
        return (a, normalize_en(b))
    if is_japanese(b) and not is_japanese(a):
        return (b, normalize_en(a))
    return None


def parse_line(line: str) -> tuple[str, str] | None:
    """Parse one line into a (jp, en) pair, or return None."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None

    # 1. Parentheses: 日本語（english）or 日本語(english)
    m = re.match(r"^(.+?)[\(（]([^)）]+)[\)）]\s*$", line)
    if m:
        r = _orient(m.group(1).strip(), m.group(2).strip())
        if r:
            return r

    # 2. Tab: 日本語\tenglish
    if "\t" in line:
        parts = line.split("\t", 1)
        r = _orient(parts[0].strip(), parts[1].strip())
        if r:
            return r

    # 3. Colon (full/half-width): 日本語：english or english：日本語
    m = re.match(r"^(.+?)\s*[：:]\s*(.+)$", line)
    if m:
        r = _orient(m.group(1).strip(), m.group(2).strip())
        if r:
            return r

    # 4. Dash: 日本語 - english or english - 日本語
    m = re.match(r"^(.+?)\s*[-–—]\s*(.+)$", line)
    if m:
        r = _orient(m.group(1).strip(), m.group(2).strip())
        if r:
            return r

    return None


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Parse pasted jp/en pairs → TSV in imports/inbox/"
    )
    ap.add_argument(
        "--echo-path",
        action="store_true",
        help="Print only the generated TSV path to stdout (for shell capture)",
    )
    args = ap.parse_args()

    text = sys.stdin.read()
    if not text.strip():
        print("ERROR: empty input", file=sys.stderr)
        sys.exit(1)

    pairs: list[tuple[str, str]] = []
    skipped = 0
    for raw_line in text.splitlines():
        result = parse_line(raw_line)
        if result:
            pairs.append(result)
        elif raw_line.strip() and not raw_line.strip().startswith("#"):
            skipped += 1
            print(f"  SKIP: {raw_line.strip()!r}", file=sys.stderr)

    if not pairs:
        print("ERROR: no jp/en pairs found in input", file=sys.stderr)
        sys.exit(1)

    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tsv_path = INBOX_DIR / f"{CATEGORY}_{timestamp}.tsv"

    with open(tsv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["category", "jp", "en", "tags", "source"])
        for jp, en in pairs:
            w.writerow([CATEGORY, jp, en, "", ""])

    print(
        f"[extract_to_tsv] {len(pairs)} pair(s) extracted, "
        f"{skipped} line(s) skipped → {tsv_path}",
        file=sys.stderr,
    )

    if args.echo_path:
        print(tsv_path)
    else:
        print(f"Generated: {tsv_path}")


if __name__ == "__main__":
    main()
