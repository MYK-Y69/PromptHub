#!/usr/bin/env python3
"""
extract_expression_pairs_from_url.py
Fetch a webpage and extract JP/EN expression pairs, output as TSV to stdout.

Output format:  en<TAB>jp  (one pair per line, stderr = progress/stats)

Strategy:
  Primary   — table-aware: scan <td> cells in order; pair consecutive
              (JP-cell, EN-cell) and (EN-cell, JP-cell) siblings.
  Fallback  — line-by-line: slash, trailing-ascii, tab, colon patterns.

Usage:
  python3 tools/extract_expression_pairs_from_url.py <URL>
"""

from __future__ import annotations
import re
import sys
import ssl
import urllib.request
from html.parser import HTMLParser

# ── Japanese unicode ranges ───────────────────────────────────────────────────
_JP_PAT = (
    r"\u3040-\u309F"   # Hiragana
    r"\u30A0-\u30FF"   # Katakana
    r"\u4E00-\u9FFF"   # CJK Unified
    r"\u3400-\u4DBF"   # CJK Ext-A
    r"\uF900-\uFAFF"   # CJK Compat
)
JP_RE   = re.compile(f"[{_JP_PAT}]")
EN_OK   = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9\s\-()',./\\]*$")
NOISE   = re.compile(r"[?？]{3,}|https?://|@|\bCopyright\b|\bCookie\b")

MAX_EN = 60
MAX_JP = 40


def is_jp(text: str) -> bool:
    return bool(JP_RE.search(text))


def looks_en(text: str) -> bool:
    return bool(EN_OK.match(text.strip()))


# ── Table-aware HTML parser ───────────────────────────────────────────────────
class TableParser(HTMLParser):
    """Collect <td> and <th> cell texts in document order."""

    _SKIP = frozenset(["script", "style", "head", "noscript"])

    def __init__(self):
        super().__init__()
        self._skip       = False
        self._in_cell    = False
        self._cell_parts: list[str] = []
        self.cells: list[tuple[str, str]] = []  # (tag, text)  tag∈{td,th}

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skip = True
        if tag in ("td", "th") and not self._skip:
            self._in_cell    = True
            self._cell_parts = []
        if tag == "br" and self._in_cell:
            self._cell_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._skip = False
        if tag in ("td", "th") and self._in_cell:
            self._in_cell = False
            raw  = "".join(self._cell_parts)
            # Keep only the first line (before first <br>)
            text = raw.split("\n")[0].strip()
            # Strip HTML entities & extra whitespace
            text = re.sub(r"&[a-z]+;", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                self.cells.append((tag, text))

    def handle_data(self, data):
        if self._in_cell and not self._skip:
            self._cell_parts.append(data)


# ── Pair extraction: table mode ───────────────────────────────────────────────
def pairs_from_cells(
    cells: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    """Scan td cells in order; yield (en, jp) for adjacent JP/EN pairs."""
    # Only look at <td> cells (skip <th> headers)
    tds = [text for tag, text in cells if tag == "td"]
    results: list[tuple[str, str]] = []
    i = 0
    while i < len(tds) - 1:
        a, b = tds[i], tds[i + 1]
        pair = _orient(a, b)
        if pair:
            results.append(pair)
            i += 2
        else:
            i += 1
    return results


# ── Pair extraction: line mode (fallback) ────────────────────────────────────
class LineParser(HTMLParser):
    """Plain text extractor (skip tags, insert newlines at block boundaries)."""

    _SKIP  = frozenset(["script", "style", "head", "noscript"])
    _BREAK = frozenset(["li", "p", "div", "br", "tr", "td", "th",
                         "h1", "h2", "h3", "h4", "h5", "h6"])

    def __init__(self):
        super().__init__()
        self._buf:  list[str] = []
        self._skip: bool      = False

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skip = True
        if tag in self._BREAK:
            self._buf.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._skip = False
        if tag in self._BREAK:
            self._buf.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._buf.append(data)

    def text(self) -> str:
        return "".join(self._buf)


def pairs_from_lines(html_text: str) -> list[tuple[str, str]]:
    parser = LineParser()
    parser.feed(html_text)
    results: list[tuple[str, str]] = []

    for line in parser.text().splitlines():
        line = line.strip()
        if not line or NOISE.search(line):
            continue

        pair: tuple[str, str] | None = None

        # slash: "JP / EN"
        if pair is None and re.search(r"[/／]", line):
            parts = re.split(r"\s*[/／]\s*", line, maxsplit=1)
            if len(parts) == 2:
                pair = _orient(parts[0], parts[1])

        # trailing ASCII on JP line: "日本語 english"
        if pair is None:
            m = re.match(
                f"^([{_JP_PAT}ー・、。々〜！？「」『』【】]+)"
                r"\s+([a-zA-Z][a-zA-Z0-9\s\-()',./\\]{0,58})$",
                line,
            )
            if m:
                jp, en = m.group(1).strip(), m.group(2).strip()
                if is_jp(jp) and looks_en(en):
                    pair = (en, jp)

        # tab
        if pair is None and "\t" in line:
            parts = line.split("\t", 1)
            pair = _orient(parts[0], parts[1])

        # colon
        if pair is None:
            m = re.match(r"^(.+?)\s*[：:]\s*(.+)$", line)
            if m:
                pair = _orient(m.group(1), m.group(2))

        if pair:
            results.append(pair)

    return results


# ── Shared helpers ────────────────────────────────────────────────────────────
def _orient(a: str, b: str) -> tuple[str, str] | None:
    """Return (en, jp) if one side is JP and the other looks like EN."""
    a, b = a.strip(), b.strip()
    if not a or not b:
        return None
    if is_jp(a) and not is_jp(b) and looks_en(b):
        return (b, a)
    if is_jp(b) and not is_jp(a) and looks_en(a):
        return (a, b)
    return None


def _filter(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out:  list[tuple[str, str]] = []
    for en, jp in pairs:
        if len(en) > MAX_EN or len(jp) > MAX_JP:
            continue
        if not is_jp(jp):
            continue
        if NOISE.search(en) or NOISE.search(jp):
            continue
        key = en.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append((en, jp))
    return out


# ── HTTP fetch ────────────────────────────────────────────────────────────────
def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for ctx in (None, ssl._create_unverified_context()):
        try:
            kw: dict = {"timeout": 20}
            if ctx is not None:
                kw["context"] = ctx
            with urllib.request.urlopen(req, **kw) as resp:
                raw     = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace")
        except urllib.error.URLError as exc:
            if ctx is not None:
                raise
            if "CERTIFICATE" not in str(exc).upper():
                raise
            print("[extract] SSL verify failed — retrying without verification …",
                  file=sys.stderr)
    raise RuntimeError("unreachable")


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python3 tools/extract_expression_pairs_from_url.py <URL>",
            file=sys.stderr,
        )
        sys.exit(1)

    url = sys.argv[1]
    print(f"[extract] Fetching {url} …", file=sys.stderr)

    try:
        html_text = fetch_html(url)
    except Exception as exc:
        print(f"[extract] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    # Primary: table-aware
    tparser = TableParser()
    tparser.feed(html_text)
    pairs = _filter(pairs_from_cells(tparser.cells))

    # Fallback: line-based (merge if table gave nothing useful)
    if len(pairs) < 5:
        print("[extract] Table mode yielded few results — trying line mode …",
              file=sys.stderr)
        line_pairs = _filter(pairs_from_lines(html_text))
        # Merge, dedup by EN key
        seen = {en.lower() for en, _ in pairs}
        for p in line_pairs:
            if p[0].lower() not in seen:
                pairs.append(p)
                seen.add(p[0].lower())

    print(f"[extract] {len(pairs)} pair(s) extracted", file=sys.stderr)

    for en, jp in pairs:
        print(f"{en}\t{jp}")


if __name__ == "__main__":
    main()
