#!/usr/bin/env python3
"""
tools/parsers/sorenuts.py
sorenuts.jp 専用パーサー

ページ構造:
  WordPress 記事ページ。本文中に HTML テーブルが並ぶ。
  テーブル構造パターン A（主）:
    <table>
      <tr><td><strong>セクション見出し</strong></td><td></td></tr>  ← 見出し行
      <tr><td>日本語説明</td><td>english_tag</td></tr>              ← タグ行
      ...
    </table>

  パターン B（補助）:
    <h2>/<h3> 見出し + <table>（見出し行なし）の組み合わせ。

  パターン C（フォールバック）:
    テーブルなし。<p> や <li> に "日本語 / english" 形式で記述。

解析戦略:
  1. <article> または .entry-content 内の要素を走査
  2. <h2>/<h3> を見つけたら現在のセクションを確定して新セクション開始
  3. <table> 内の各 <tr> を確認:
       - td が 1 つで <strong> を含む → セクション見出し行
       - td が 2 つ → JP/EN ペア候補
  4. フォールバック: テーブルがゼロなら LineParser モードで JP/EN 抽出
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

# tools/ を sys.path に追加（直接実行時用）
_TOOLS = Path(__file__).parent.parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from bs4 import BeautifulSoup, Tag as BsTag

from parsers.base import (
    BaseParser, ParseResult, Section, Tag,
    is_jp, looks_en, orient, infer_target, slugify,
    register,
)

# ---------------------------------------------------------------------------
# セクションラベルベースの target 上書きルール
# ---------------------------------------------------------------------------

def _section_target_override(sec_label: str) -> str | None:
    """
    セクションラベルから target を上書きする。
    例: "他者への接触" → "other", "自分への接触" → "self"
    """
    label = sec_label
    # 他者系
    if re.search(r"他者|相手|パートナー|another|other", label):
        return "other"
    # 相互系
    if re.search(r"相互|互い|お互い|mutual|symmetrical", label):
        return "mutual"
    # 自己系
    if re.search(r"自分|自己|自身|自分(への|に対する)|self", label):
        return "self"
    # 物体系
    if re.search(r"持[つつ]|把持|武器|道具|アイテム|holding|object", label):
        return "object"
    return None

# ---------------------------------------------------------------------------
# URL → (category_id, category_label) マッピング
# ---------------------------------------------------------------------------

_URL_MAP: dict[str, tuple[str, str]] = {
    "1954": ("expression",   "表情・目の形"),
    "4566": ("pose",         "ポーズ・体の特徴"),
    "4580": ("clothing",     "服装"),
    "2420": ("environment",  "環境・背景・場所"),
    "2908": ("camera",       "カメラ・構図"),
    "6667": ("hair",         "髪型"),
    "4507": ("action",       "動作・行動"),
    "2187": ("occupation",   "職業・種族"),
    "3602": ("art_style",    "画風"),
}


def _url_to_category(url: str) -> tuple[str, str]:
    """URL から (category_id, category_label) を返す。不明なら汎用 id を生成。"""
    for key, val in _URL_MAP.items():
        if f"/{key}/" in url or url.rstrip("/").endswith(key):
            return val
    # フォールバック: URL末尾の数字をそのまま使う
    m = re.search(r"/(\d+)/?$", url)
    slug = f"page_{m.group(1)}" if m else "unknown"
    return (slug, slug)


# ---------------------------------------------------------------------------
# パース本体
# ---------------------------------------------------------------------------

def _text(el) -> str:
    """BeautifulSoup 要素のテキストをクリーンアップして返す。"""
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


def _is_section_row(tr) -> str | None:
    """
    <tr> がセクション見出し行なら見出しテキストを返す。
    該当しない場合は None。
    """
    tds = tr.find_all("td", recursive=False)
    if not tds:
        return None

    # パターン A-1: td が 1〜2 つで、最初の td に <strong> や <b>
    first = tds[0]
    if first.find(["strong", "b"]):
        label = _text(first)
        # 空 or 非日本語でも見出しとして許容
        if label and len(label) < 60:
            return label

    # パターン A-2: <th> 単独行
    ths = tr.find_all("th", recursive=False)
    if ths:
        label = _text(ths[0])
        if label:
            return label

    return None


def _parse_table(table, default_section_label: str, cat_id: str) -> list[Section]:
    """
    <table> 要素を解析して Section のリストを返す。
    テーブル内にセクション見出し行がなければ default_section_label を使う。
    """
    sections: list[Section] = []
    current_label = default_section_label
    current_tags: list[Tag] = []
    seen_en: set[str] = set()

    for tr in table.find_all("tr", recursive=False):
        # ヘッダ行チェック
        header = _is_section_row(tr)
        if header:
            if current_tags:
                sec_id = slugify(current_label)
                sections.append(Section(id=sec_id, label=current_label, tags=current_tags))
                current_tags = []
            current_label = header
            continue

        # タグ行: td が 2 つ（JP + EN）を期待
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 2:
            continue

        col0 = _text(tds[0])
        col1 = _text(tds[1])

        pair = orient(col0, col1)
        if pair is None:
            # 3列以上あるケース（説明列など）も試す
            for i in range(len(tds) - 1):
                pair = orient(_text(tds[i]), _text(tds[i + 1]))
                if pair:
                    break
        if pair is None:
            continue

        en, jp = pair
        en_key = en.lower().strip()
        if en_key in seen_en:
            continue
        seen_en.add(en_key)

        # セクション名ベースの上書きを優先
        override = _section_target_override(current_label)
        if override:
            target, target_note = override, None
        else:
            target, target_note = infer_target(en, cat_id)
        current_tags.append(Tag(en=en, jp=jp, target=target, target_note=target_note))

    # 末尾セクション
    if current_tags:
        sec_id = slugify(current_label)
        sections.append(Section(id=sec_id, label=current_label, tags=current_tags))

    return sections


def _content_area(soup: BeautifulSoup):
    """記事本文要素を返す。なければ <body>。"""
    for sel in ["article", ".entry-content", ".post-content",
                "#main", ".content", "main"]:
        el = soup.select_one(sel)
        if el:
            return el
    return soup.body or soup


def parse_sorenuts(html: str, url: str) -> ParseResult:
    """sorenuts.jp HTML → ParseResult"""
    cat_id, cat_label = _url_to_category(url)
    soup = BeautifulSoup(html, "html.parser")

    # ページタイトルで category_label を上書き（より正確）
    title_el = soup.find("h1") or soup.find("title")
    if title_el:
        raw_title = _text(title_el)
        # "| sorenuts" などサイト名サフィックスを除去
        raw_title = re.sub(r"\s*[|｜]\s*.*$", "", raw_title).strip()
        if raw_title and len(raw_title) < 50:
            cat_label = raw_title

    content = _content_area(soup)
    tables = content.find_all("table")

    sections: list[Section] = []
    seen_en: set[str] = set()

    if tables:
        # ---- テーブルありモード ----
        # content 内の要素を順番に走査して h2/h3 と table を組み合わせる
        current_h = cat_label
        for el in content.children:
            if not isinstance(el, BsTag):
                continue
            tag_name = el.name
            if tag_name in ("h2", "h3", "h4"):
                current_h = _text(el)
            elif tag_name == "table":
                parsed = _parse_table(el, current_h, cat_id)
                for sec in parsed:
                    # セクション内重複を除去しつつ追加
                    clean_tags = []
                    for t in sec.tags:
                        if t.en.lower().strip() not in seen_en:
                            clean_tags.append(t)
                            seen_en.add(t.en.lower().strip())
                    if clean_tags:
                        # 同 id のセクションがあればマージ
                        existing = next(
                            (s for s in sections if s.id == sec.id), None
                        )
                        if existing:
                            existing.tags.extend(clean_tags)
                        else:
                            sections.append(
                                Section(id=sec.id, label=sec.label, tags=clean_tags)
                            )
                # h2/h3 が table-内セクションとして既に処理されたのでリセット
                current_h = cat_label

    if not sections:
        # ---- フォールバック: テキストライン解析 ----
        print("  [sorenuts] テーブル未検出 → ライン解析フォールバック")
        sections = _fallback_line_parse(html, cat_id, cat_label)

    return ParseResult(
        category_id=cat_id,
        category_label=cat_label,
        source_url=url,
        source_site="sorenuts",
        sections=sections,
    )


def _fallback_line_parse(html: str, cat_id: str, cat_label: str) -> list[Section]:
    """
    テーブルが存在しない場合のフォールバック。
    既存 extract_expression_pairs_from_url.py と同ロジック。
    """
    from html.parser import HTMLParser as _HTMLParser

    class _LineParser(_HTMLParser):
        _SKIP  = frozenset(["script", "style", "head"])
        _BREAK = frozenset(["li", "p", "div", "br", "tr", "td", "th",
                             "h1", "h2", "h3", "h4", "h5"])

        def __init__(self):
            super().__init__()
            self._buf: list[str] = []
            self._skip = False

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

    lp = _LineParser()
    lp.feed(html)
    raw_text = "".join(lp._buf)

    tags_list: list[Tag] = []
    seen: set[str] = set()

    for line in raw_text.splitlines():
        line = line.strip()
        if not line:
            continue
        pair = None
        if re.search(r"[/／]", line):
            parts = re.split(r"\s*[/／]\s*", line, maxsplit=1)
            if len(parts) == 2:
                pair = orient(parts[0], parts[1])
        if pair is None and "\t" in line:
            parts = line.split("\t", 1)
            pair = orient(parts[0], parts[1])
        if pair is None:
            continue
        en, jp = pair
        if en.lower().strip() in seen:
            continue
        seen.add(en.lower().strip())
        target, tn = infer_target(en, cat_id)
        tags_list.append(Tag(en=en, jp=jp, target=target, target_note=tn))

    if not tags_list:
        return []

    return [Section(id=slugify(cat_label), label=cat_label, tags=tags_list)]


# ---------------------------------------------------------------------------
# パーサークラス（登録）
# ---------------------------------------------------------------------------

@register
class SorenutsParser(BaseParser):
    site_name = "sorenuts"

    def supports(self, url: str) -> bool:
        return "sorenuts.jp" in url

    def parse(self, html: str, url: str) -> ParseResult:
        return parse_sorenuts(html, url)


# ---------------------------------------------------------------------------
# 単体テスト用エントリポイント
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print("Usage: python3 tools/parsers/sorenuts.py <URL>")
        sys.exit(1)

    from parsers.base import fetch_html

    target_url = sys.argv[1]
    print(f"Fetching {target_url} …")
    html_content = fetch_html(target_url)
    result = parse_sorenuts(html_content, target_url)

    print(f"\n=== {result.category_label} ({result.category_id}) ===")
    print(f"Source : {result.source_url}")
    print(f"Sections: {len(result.sections)}")
    print(f"Total tags: {result.tag_count}")
    for sec in result.sections:
        print(f"\n  [{sec.id}] {sec.label} ({len(sec.tags)} tags)")
        for t in sec.tags[:3]:
            print(f"    {t.en!r:35s} | {t.jp!r:30s} | target={t.target}")
        if len(sec.tags) > 3:
            print(f"    … and {len(sec.tags)-3} more")
