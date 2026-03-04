"""
add_danbooru_tag.py
  Usage : python3 tools/add_danbooru_tag.py <danbooru_tag>
  Action:
    1. Query Danbooru API for an exact tag match.
    2. If found and not already in the TSV, append one row with section="misc".
    3. Print the appended row on success; exit with message on duplicate/error.

TSV target : data/inbox/2026-03-03_tags_fixed.tsv
Row format : section  jp_term  definition  danbooru_tag  notes
"""

from __future__ import annotations

import csv
import json
import ssl
import sys
import urllib.request
import urllib.parse
from pathlib import Path

ROOT    = Path(__file__).resolve().parent.parent
TARGET  = ROOT / "data/inbox/2026-03-03_tags_fixed.tsv"
COLUMNS = ["section", "jp_term", "definition", "danbooru_tag", "notes"]

DANBOORU_API = "https://danbooru.donmai.us/tags.json"


def _ssl_ctx() -> ssl.SSLContext:
    """Return an SSL context, falling back to unverified on macOS cert issues."""
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        try:
            ctx = ssl.create_default_context()
            # macOS: try system certs via /etc/ssl
            ctx.load_verify_locations("/etc/ssl/cert.pem")
        except Exception:
            ctx = ssl._create_unverified_context()
            print("[WARN] SSL certificate verification disabled (certifi not installed).",
                  file=sys.stderr)
    return ctx


def fetch_tag(name: str) -> dict | None:
    """Return Danbooru tag object for an exact name match, or None."""
    params = urllib.parse.urlencode({
        "search[name]": name,
        "limit": 1,
    })
    url = f"{DANBOORU_API}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "PromptHub/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx()) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[ERROR] Danbooru API request failed: {e}", file=sys.stderr)
        return None

    if not isinstance(data, list) or not data:
        return None

    # Exact match only
    tag = data[0]
    if tag.get("name") != name:
        return None
    return tag


def already_in_tsv(name: str) -> bool:
    """Return True if danbooru_tag column already contains `name`."""
    if not TARGET.exists():
        return False
    with open(TARGET, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if row.get("danbooru_tag", "").strip() == name:
                return True
    return False


def append_row(name: str) -> str:
    """Append one TSV row and return its text representation."""
    row = {
        "section":     "misc",
        "jp_term":     "",
        "definition":  "",
        "danbooru_tag": name,
        "notes":       "auto:danbooru",
    }
    line = "\t".join(row[c] for c in COLUMNS)

    # Ensure file ends with newline before appending
    content = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
    if content and not content.endswith("\n"):
        line = "\n" + line
    with open(TARGET, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    return line.strip()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 tools/add_danbooru_tag.py <danbooru_tag>")
        sys.exit(1)

    name = sys.argv[1].strip().lower().replace(" ", "_")
    print(f"[INFO] Looking up: {name!r}")

    if already_in_tsv(name):
        print(f"[SKIP] '{name}' is already in the TSV. Nothing written.")
        sys.exit(0)

    tag = fetch_tag(name)
    if tag is None:
        print(f"[ERROR] Tag '{name}' not found on Danbooru (or API error). TSV unchanged.")
        sys.exit(1)

    print(f"[OK]   Found on Danbooru: name={tag['name']!r}  "
          f"category={tag.get('category')}  count={tag.get('post_count')}")

    appended = append_row(name)
    print(f"[APPENDED] {appended}")


if __name__ == "__main__":
    main()
