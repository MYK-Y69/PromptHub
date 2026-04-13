"""
tools/parsers/memone_ro.py
memone-ro.com 専用パーサー

ページ構造:
  - 各ページ: <div class="entry-content"> 内に H2 + <figure class="wp-block-table"> の繰り返し
  - テーブル3カラム: 日本語 | 単語(EN) | 説明
  - メインページ: H4 グループ → テーブル → リンク一覧

カテゴリ振り分け:
  - エロ関連・エロシチュエーション・露骨な身体部位 → sensitive
  - その他 → 通常カテゴリ（人の体→expression/pose, 服→clothing, etc.）
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

_TOOLS = Path(__file__).parent.parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from parsers.base import BaseParser, ParseResult, Section, Tag, register, slugify, infer_target

# ---------------------------------------------------------------------------
# カテゴリラベル（v2 既存カテゴリに合わせる）
# ---------------------------------------------------------------------------

_CAT_LABELS = {
    "camera":      "カメラ・構図",
    "expression":  "表情・顔",
    "pose":        "ポーズ",
    "action":      "動作・行動",
    "clothing":    "服装",
    "accessories": "アクセサリー",
    "people":      "人数・関係",
    "meta":        "メタ・品質",
    "sensitive":   "センシティブ",
}

# ---------------------------------------------------------------------------
# URL → (cat_id, page_label)  全104ページのマッピング
# ---------------------------------------------------------------------------

_URL_MAP: dict[str, tuple[str, str]] = {
    # ── 人の体関連 → expression ──────────────────────────────────────
    "https://memone-ro.com/archives/77":   ("expression",  "髪"),
    "https://memone-ro.com/archives/29":   ("expression",  "目"),
    "https://memone-ro.com/archives/5":    ("expression",  "表情"),
    "https://memone-ro.com/archives/994":  ("expression",  "眉毛"),
    "https://memone-ro.com/archives/1565": ("expression",  "鼻"),
    "https://memone-ro.com/archives/707":  ("expression",  "口"),
    "https://memone-ro.com/archives/274":  ("expression",  "肌の色"),
    # ── 人の体関連 → pose ────────────────────────────────────────────
    "https://memone-ro.com/archives/96":   ("pose",        "指"),
    "https://memone-ro.com/archives/982":  ("pose",        "腕"),
    "https://memone-ro.com/archives/93":   ("pose",        "姿勢"),
    "https://memone-ro.com/archives/710":  ("pose",        "足"),
    # ── 人の体関連 → sensitive（露骨な身体部位）────────────────────────
    "https://memone-ro.com/archives/62":   ("sensitive",   "女性の体"),
    "https://memone-ro.com/archives/166":  ("sensitive",   "男性の体"),
    "https://memone-ro.com/archives/647":  ("sensitive",   "乳・おっぱい"),
    "https://memone-ro.com/archives/668":  ("sensitive",   "マンコ"),
    "https://memone-ro.com/archives/670":  ("sensitive",   "チンコ"),
    "https://memone-ro.com/archives/1555": ("sensitive",   "陰毛"),
    "https://memone-ro.com/archives/1584": ("sensitive",   "アナル"),
    "https://memone-ro.com/archives/697":  ("sensitive",   "尻"),
    # ── 服・下着関連 → clothing ──────────────────────────────────────
    "https://memone-ro.com/archives/238":  ("clothing",    "女性用下着"),
    "https://memone-ro.com/archives/267":  ("clothing",    "男性用下着"),
    "https://memone-ro.com/archives/548":  ("clothing",    "パンスト"),
    "https://memone-ro.com/archives/546":  ("clothing",    "靴下"),
    "https://memone-ro.com/archives/588":  ("clothing",    "靴"),
    "https://memone-ro.com/archives/571":  ("clothing",    "水着"),
    "https://memone-ro.com/archives/838":  ("clothing",    "シャツ"),
    "https://memone-ro.com/archives/835":  ("clothing",    "ドレス"),
    "https://memone-ro.com/archives/882":  ("clothing",    "ベスト"),
    "https://memone-ro.com/archives/853":  ("clothing",    "スポーツ衣装"),
    "https://memone-ro.com/archives/857":  ("clothing",    "セーター"),
    "https://memone-ro.com/archives/866":  ("clothing",    "コート"),
    "https://memone-ro.com/archives/864":  ("clothing",    "ジャケット"),
    "https://memone-ro.com/archives/868":  ("clothing",    "雨具"),
    "https://memone-ro.com/archives/878":  ("clothing",    "レオタード"),
    "https://memone-ro.com/archives/903":  ("clothing",    "透けてる服"),
    "https://memone-ro.com/archives/1023": ("clothing",    "スーツ"),
    "https://memone-ro.com/archives/843":  ("clothing",    "ズボン"),
    "https://memone-ro.com/archives/880":  ("clothing",    "半ズボン"),
    "https://memone-ro.com/archives/855":  ("clothing",    "スカート"),
    "https://memone-ro.com/archives/1260": ("clothing",    "服のサイズ・ゆるさ"),
    "https://memone-ro.com/archives/1265": ("clothing",    "袖"),
    "https://memone-ro.com/archives/1550": ("clothing",    "着てるものが破れる"),
    # ── 服・下着関連 → accessories ───────────────────────────────────
    "https://memone-ro.com/archives/811":  ("accessories", "帽子"),
    "https://memone-ro.com/archives/768":  ("accessories", "メガネ"),
    "https://memone-ro.com/archives/1474": ("accessories", "髪飾り・髪留め"),
    "https://memone-ro.com/archives/805":  ("accessories", "首周り装飾品"),
    # ── キャラ属性 → people ──────────────────────────────────────────
    "https://memone-ro.com/archives/184":  ("people",      "ロリ"),
    "https://memone-ro.com/archives/350":  ("people",      "ムチムチ女"),
    "https://memone-ro.com/archives/147":  ("people",      "バニー"),
    "https://memone-ro.com/archives/368":  ("people",      "猫娘"),
    "https://memone-ro.com/archives/618":  ("people",      "メイド"),
    "https://memone-ro.com/archives/622":  ("people",      "魔女"),
    "https://memone-ro.com/archives/641":  ("people",      "エルフ"),
    "https://memone-ro.com/archives/643":  ("people",      "シスター"),
    "https://memone-ro.com/archives/645":  ("people",      "人魚"),
    "https://memone-ro.com/archives/657":  ("people",      "人形"),
    "https://memone-ro.com/archives/772":  ("people",      "ギャル"),
    "https://memone-ro.com/archives/752":  ("people",      "魔法少女"),
    "https://memone-ro.com/archives/754":  ("people",      "人型の魔物・モンスター娘"),
    "https://memone-ro.com/archives/1006": ("people",      "メスガキ"),
    "https://memone-ro.com/archives/1234": ("people",      "メカクレ"),
    "https://memone-ro.com/archives/1222": ("people",      "ナース"),
    # ── キャラ属性 → sensitive ───────────────────────────────────────
    "https://memone-ro.com/archives/374":  ("sensitive",   "ふたなり"),
    "https://memone-ro.com/archives/927":  ("sensitive",   "竿役"),
    # ── エロ関連 → sensitive ─────────────────────────────────────────
    "https://memone-ro.com/archives/198":  ("sensitive",   "フェラ"),
    "https://memone-ro.com/archives/473":  ("sensitive",   "セックス"),
    "https://memone-ro.com/archives/161":  ("sensitive",   "オナニー"),
    "https://memone-ro.com/archives/281":  ("sensitive",   "パイズリ"),
    "https://memone-ro.com/archives/118":  ("sensitive",   "種付けプレス"),
    "https://memone-ro.com/archives/135":  ("sensitive",   "精液関連"),
    "https://memone-ro.com/archives/750":  ("sensitive",   "おしっこ"),
    "https://memone-ro.com/archives/967":  ("sensitive",   "手コキ"),
    "https://memone-ro.com/archives/1001": ("sensitive",   "抱きつきフェラ"),
    "https://memone-ro.com/archives/1450": ("sensitive",   "大人の玩具"),
    # ── エロシチュエーション → sensitive ─────────────────────────────
    "https://memone-ro.com/archives/221":  ("sensitive",   "触手"),
    "https://memone-ro.com/archives/323":  ("sensitive",   "落とし穴"),
    "https://memone-ro.com/archives/343":  ("sensitive",   "睡眠姦"),
    "https://memone-ro.com/archives/363":  ("sensitive",   "ガラスに押し付ける"),
    "https://memone-ro.com/archives/360":  ("sensitive",   "催眠・常識変換"),
    "https://memone-ro.com/archives/332":  ("sensitive",   "壁尻"),
    "https://memone-ro.com/archives/1032": ("sensitive",   "縄・ロープ"),
    "https://memone-ro.com/archives/1033": ("sensitive",   "縛り・拘束"),
    "https://memone-ro.com/archives/1229": ("sensitive",   "女性支配"),
    "https://memone-ro.com/archives/1281": ("sensitive",   "レイプ"),
    # ── 背景 → camera ────────────────────────────────────────────────
    "https://memone-ro.com/archives/1328": ("camera",      "床"),
    "https://memone-ro.com/archives/1323": ("camera",      "壁"),
    "https://memone-ro.com/archives/1595": ("camera",      "カーテン"),
    "https://memone-ro.com/archives/787":  ("camera",      "自然環境"),
    "https://memone-ro.com/archives/791":  ("camera",      "建物・施設"),
    "https://memone-ro.com/archives/793":  ("camera",      "室内"),
    "https://memone-ro.com/archives/567":  ("camera",      "シンプル背景"),
    "https://memone-ro.com/archives/338":  ("camera",      "温泉・お風呂"),
    "https://memone-ro.com/archives/655":  ("camera",      "田舎"),
    # ── 動作 → action ────────────────────────────────────────────────
    "https://memone-ro.com/archives/915":  ("action",      "戦闘動作"),
    "https://memone-ro.com/archives/906":  ("action",      "体を隠す"),
    "https://memone-ro.com/archives/1296": ("action",      "移動動作"),
    # ── その他 → meta ────────────────────────────────────────────────
    "https://memone-ro.com/archives/196":  ("meta",        "二人の関係"),
    "https://memone-ro.com/archives/807":  ("meta",        "食品関連"),
    "https://memone-ro.com/archives/937":  ("meta",        "マンガ・コミック"),
    "https://memone-ro.com/archives/1217": ("meta",        "塗り"),
    "https://memone-ro.com/archives/1307": ("meta",        "描かないもの"),
    "https://memone-ro.com/archives/1304": ("meta",        "複数のビュー"),
    "https://memone-ro.com/archives/1341": ("meta",        "ネガティブプロンプト"),
    "https://memone-ro.com/archives/1375": ("meta",        "クリスマス"),
}

# 末尾スラッシュ正規化
_URL_MAP = {url.rstrip("/"): v for url, v in _URL_MAP.items()}

# 全 URL リスト（import_v2.py の --all-memone 用）
ALL_URLS: list[str] = list(_URL_MAP.keys())


# ---------------------------------------------------------------------------
# HTML ユーティリティ
# ---------------------------------------------------------------------------

_STRIP_TAGS = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")


def _clean(text: str) -> str:
    """HTML タグを除去してテキストを正規化する。"""
    text = _STRIP_TAGS.sub("", text)
    text = _WHITESPACE.sub(" ", text).strip()
    # 全角スペース・改行を半角スペースに統一
    text = text.replace("\u3000", " ").strip()
    return text


def _extract_content(html: str) -> str:
    """entry-content div を取得する。"""
    m = re.search(
        r'<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>(.*)',
        html, re.DOTALL
    )
    return m.group(1) if m else html


def _parse_table(table_html: str) -> list[tuple[str, str, str]]:
    """
    <table> HTML から (jp, en, desc) タプルのリストを返す。
    ヘッダ行（日本語/単語/説明）はスキップする。
    en が空・非英字のみの場合もスキップ。
    """
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, re.DOTALL)
    results = []
    _EN_OK = re.compile(r"^[a-zA-Z0-9]")

    for row in rows:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.DOTALL)
        if len(cells) < 2:
            continue
        jp   = _clean(cells[0])
        en   = _clean(cells[1])
        desc = _clean(cells[2]) if len(cells) > 2 else ""

        # ヘッダ行スキップ
        if jp in ("日本語",) or en in ("単語", "英語", "タグ"):
            continue
        # en が空 or 英字で始まらない場合スキップ
        if not en or not _EN_OK.match(en):
            continue
        results.append((jp, en, desc))
    return results


# ---------------------------------------------------------------------------
# ページ解析
# ---------------------------------------------------------------------------

def _archive_id(url: str) -> str:
    """https://memone-ro.com/archives/123 → '123'"""
    m = re.search(r"/archives/(\d+)", url)
    return m.group(1) if m else "unknown"


def _parse_page(html: str, url: str, cat_id: str, page_label: str) -> list[Section]:
    """
    1ページの HTML を解析して Section リストを返す。
    H2 ごとにセクションを分割する。
    """
    content = _extract_content(html)
    arc_id  = _archive_id(url)

    # H2 セクション区切りを使って分割
    # パターン: <h2 ...><span ...>セクション名</span></h2> の直後にテーブル
    parts = re.split(r"(<h2[^>]*>.*?</h2>)", content, flags=re.DOTALL)

    sections: list[Section] = []
    seen_sec_ids: set[str] = set()

    i = 1  # parts[0] はH2前のプロローグ
    while i < len(parts):
        h2_html = parts[i]
        body    = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        # H2 テキスト取得
        sec_label = _clean(re.sub(r"<[^>]+>", "", h2_html))
        if not sec_label:
            continue

        # body 内の最初のテーブルを取得
        tbl_m = re.search(r"<table[^>]*>(.*?)</table>", body, re.DOTALL)
        if not tbl_m:
            continue

        rows = _parse_table(tbl_m.group(0))
        if not rows:
            continue

        # セクション ID: mm_{arc_id}_{slug}
        slug = slugify(sec_label)
        sec_id = f"mm_{arc_id}_{slug}"
        # 重複防止
        if sec_id in seen_sec_ids:
            sec_id = f"{sec_id}_2"
        seen_sec_ids.add(sec_id)

        tags = []
        for jp, en, desc in rows:
            target, target_note = infer_target(en, cat_id)
            tags.append(Tag(
                en=en, jp=jp,
                target=target, target_note=target_note,
                desc=desc if desc else None,
            ))

        if tags:
            sections.append(Section(id=sec_id, label=sec_label, tags=tags))

    # H2 セクションが1つもなかった場合: ページ全体を1セクションとして扱う
    if not sections:
        all_tables = re.findall(r"<table[^>]*>(.*?)</table>", content, re.DOTALL)
        all_rows = []
        for tbl in all_tables:
            all_rows.extend(_parse_table(tbl))
        if all_rows:
            tags = []
            for jp, en, desc in all_rows:
                target, target_note = infer_target(en, cat_id)
                tags.append(Tag(
                    en=en, jp=jp,
                    target=target, target_note=target_note,
                    desc=desc if desc else None,
                ))
            if tags:
                sec_id = f"mm_{arc_id}_{slugify(page_label)}"
                sections.append(Section(id=sec_id, label=page_label, tags=tags))

    return sections


# ---------------------------------------------------------------------------
# パーサークラス
# ---------------------------------------------------------------------------

@register
class MemoneRoParser(BaseParser):
    """memone-ro.com 専用パーサー。"""

    site_name = "memone-ro.com"

    def supports(self, url: str) -> bool:
        return "memone-ro.com" in url

    def parse(self, html: str, url: str) -> ParseResult:
        # URL 正規化（末尾スラッシュ除去）
        url_norm = url.rstrip("/")

        # カテゴリ決定
        if url_norm in _URL_MAP:
            cat_id, page_label = _URL_MAP[url_norm]
        else:
            # 未知 URL: メインページなら一覧を返すだけ
            if url_norm.rstrip("/") in ("https://memone-ro.com", "https://memone-ro.com/"):
                raise ValueError(
                    "メインページは直接インポートできません。"
                    "個別ページの URL を指定するか --all-memone を使ってください。"
                )
            # archives/N 形式なら meta として取り込み
            cat_id, page_label = "meta", f"memone-ro {_archive_id(url_norm)}"
            print(f"  [warn] 未知URL {url_norm} → meta カテゴリに格納")

        cat_label = _CAT_LABELS.get(cat_id, cat_id)
        sections  = _parse_page(html, url_norm, cat_id, page_label)

        return ParseResult(
            category_id=cat_id,
            category_label=cat_label,
            source_url=url_norm,
            source_site=self.site_name,
            sections=sections,
        )
