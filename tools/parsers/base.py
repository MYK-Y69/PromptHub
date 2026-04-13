#!/usr/bin/env python3
"""
tools/parsers/base.py
パーサー共通インターフェース・ユーティリティ

各パーサーは BaseParser を継承し、supports() / parse() を実装する。
import_v2.py は get_parser(url) でパーサーを自動選択する。
"""

from __future__ import annotations
import re
import ssl
import time
import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import urllib.request


# ---------------------------------------------------------------------------
# データ構造
# ---------------------------------------------------------------------------

@dataclass
class Tag:
    en: str
    jp: str
    target: str | None = None
    target_note: str | None = None
    desc: str | None = None

    def to_dict(self) -> dict:
        d = {
            "en": self.en,
            "jp": self.jp,
            "target": self.target,
            "target_note": self.target_note,
        }
        if self.desc:
            d["desc"] = self.desc
        return d


@dataclass
class Section:
    id: str
    label: str
    tags: list[Tag] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "tags": [t.to_dict() for t in self.tags],
        }


@dataclass
class ParseResult:
    """パーサーが返す構造化データ。v2 categories 1件分に対応。"""
    category_id: str
    category_label: str
    source_url: str
    source_site: str
    sections: list[Section] = field(default_factory=list)

    @property
    def tag_count(self) -> int:
        return sum(len(s.tags) for s in self.sections)

    def to_category_dict(self) -> dict:
        """v2 JSON の 1 category エントリを返す。"""
        return {
            "id": self.category_id,
            "label": self.category_label,
            "source_url": self.source_url,
            "source_site": self.source_site,
            "imported_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "sections": [s.to_dict() for s in self.sections],
        }


# ---------------------------------------------------------------------------
# 日本語 / 英語 判定ユーティリティ（既存コードと同ロジック）
# ---------------------------------------------------------------------------

_JP_PAT = (
    r"\u3040-\u309F"   # Hiragana
    r"\u30A0-\u30FF"   # Katakana
    r"\u4E00-\u9FFF"   # CJK Unified
    r"\u3400-\u4DBF"   # CJK Ext-A
    r"\uF900-\uFAFF"   # CJK Compat
    r"\u3000-\u303F"   # CJK Symbols
    r"\uFF00-\uFFEF"   # Halfwidth/Fullwidth
)
JP_RE  = re.compile(f"[{_JP_PAT}]")
EN_OK  = re.compile(r"^[a-zA-Z][a-zA-Z0-9\s\-()',./\\+&!?_~:*%]*$")
NOISE  = re.compile(r"https?://|@|\bCopyright\b|\bCookie\b|[?？]{3,}")


def is_jp(text: str) -> bool:
    return bool(JP_RE.search(text))


def looks_en(text: str) -> bool:
    return bool(EN_OK.match(text.strip()))


def orient(a: str, b: str) -> tuple[str, str] | None:
    """(en, jp) を返す。どちらが EN か JP か判別できない場合は None。"""
    a, b = a.strip(), b.strip()
    if not a or not b:
        return None
    if is_jp(a) and not is_jp(b) and looks_en(b):
        return (b, a)
    if is_jp(b) and not is_jp(a) and looks_en(a):
        return (a, b)
    return None


# ---------------------------------------------------------------------------
# target 自動推定
# ---------------------------------------------------------------------------

_OTHER  = [r"\banother'?s\b", r"\bsomeone\b", r"\bpartner\b", r"\bpatting\b",
           r"\bhand on another\b", r"\bgrabbing another\b", r"\bhug from behind\b",
           r"\bfinger (in|to) another\b", r"\bcovering another\b", r"\bface grab\b"]
_MUTUAL = [r"\bholding hands\b", r"\barm.?link\b", r"\bsymmetrical docking\b",
           r"\bheart hands duo\b", r"\blocked arms\b", r"\bpinky swear\b",
           r"\binterlocked\b", r"\bface.?to.?face\b"]
_OBJECT = [r"\bholding\b", r"\bcarrying\b", r"\bwearing\b", r"\bwielding\b",
           r"\bgrabbing\b", r"\bphone\b", r"\bweapon\b", r"\bbottle\b",
           r"\bcup\b", r"\bbook\b", r"\bumbrella\b", r"\bsword\b", r"\bgun\b",
           r"\bwand\b", r"\bstaff\b", r"\bbat\b", r"\bchainsaw\b"]
_SELF   = [r"\bself\b", r"\bown\b", r"\bbehind head\b", r"\bbehind back\b",
           r"\barms crossed\b", r"\bhand on hip\b"]

_TARGET_CATS = {"pose", "action"}


def infer_target(en: str, cat_id: str) -> tuple[str | None, str | None]:
    """en タグ文字列と v2 カテゴリ id から (target, target_note) を推定。"""
    if cat_id not in _TARGET_CATS:
        return None, None
    s = en.lower()
    for pat in _MUTUAL:
        if re.search(pat, s):
            return "mutual", None
    for pat in _OTHER:
        if re.search(pat, s):
            return "other", None
    for pat in _OBJECT:
        if re.search(pat, s):
            return "object", None
    if cat_id == "pose":
        return "self", None
    for pat in _SELF:
        if re.search(pat, s):
            return "self", None
    return None, None


# ---------------------------------------------------------------------------
# slug ユーティリティ
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """日英混在ラベルを ID 用スラグに変換する。"""
    s = text.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "_", s)
    s = s.strip("_")
    return s or "section"


# ---------------------------------------------------------------------------
# HTTP fetch ユーティリティ
# ---------------------------------------------------------------------------

_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_html(url: str, retries: int = 3, delay: float = 2.0) -> str:
    """URL から HTML を取得して文字列で返す。失敗時は RuntimeError を送出。"""
    last_exc: Exception | None = None
    ctx = ssl._create_unverified_context()

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=_DEFAULT_HEADERS)
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                raw     = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace")
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                print(f"  [fetch] attempt {attempt} failed ({exc}), retrying in {delay}s …")
                time.sleep(delay)

    raise RuntimeError(f"Failed to fetch {url}: {last_exc}") from last_exc


# ---------------------------------------------------------------------------
# 抽象基底クラス
# ---------------------------------------------------------------------------

class BaseParser(ABC):
    """すべてのパーサーが実装すべき共通インターフェース。"""

    site_name: str = ""

    @abstractmethod
    def supports(self, url: str) -> bool:
        """このパーサーが指定 URL を処理できるかどうか。"""

    @abstractmethod
    def parse(self, html: str, url: str) -> ParseResult:
        """HTML → ParseResult に変換する。"""

    def run(self, url: str) -> ParseResult:
        """fetch → parse を一括実行するヘルパー。"""
        html = fetch_html(url)
        return self.parse(html, url)


# ---------------------------------------------------------------------------
# パーサー自動選択
# ---------------------------------------------------------------------------

_REGISTRY: list[type[BaseParser]] = []


def register(cls: type[BaseParser]) -> type[BaseParser]:
    """デコレータ: パーサークラスをレジストリに登録する。"""
    _REGISTRY.append(cls)
    return cls


def get_parser(url: str) -> BaseParser:
    """URL に対応するパーサーインスタンスを返す。"""
    # インポートを確実にトリガー（tools/ が sys.path に入っている前提）
    import importlib
    for mod_name in ["parsers.sorenuts", "parsers.memone_ro"]:
        try:
            importlib.import_module(mod_name)
        except ImportError:
            pass

    for cls in _REGISTRY:
        instance = cls()
        if instance.supports(url):
            return instance
    raise ValueError(f"No parser registered for URL: {url}")
