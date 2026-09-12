#!/usr/bin/env python3
"""Generate data/related/<lang>.json — precomputed "Read next" cards for
templates/partials/related-content.html in the bifrost theme.

Why this is precomputed
-----------------------
The partial used to call get_section() on every page and scan the section's
pages twice to pick four related entries. Zola serialises the whole section on
each get_section() call — every sibling page including its rendered HTML — so
on the 148-entry wiki that cost roughly 150 ms of CPU per page, half of the
build. A lookup in a small per-locale JSON file costs nothing measurable.

Selection rule (unchanged from the template it replaces)
--------------------------------------------------------
Walk the section's pages in Zola's order for that section (`sort_by` in its
_index.md); take siblings that share the page's `extra.category` first, then
fill the remaining slots with the next siblings in section order, up to
MAX_ITEMS. Drafts are skipped, as Zola skips them without --drafts.

Output
------
One file per locale, so a page only ever loads the entries for its own
language. Keys are page paths without surrounding slashes ("wiki/abraham",
"de/wiki/abraham"), derived the way Zola derives them (frontmatter `path`,
else the directory plus `slug` or the file stem). Values carry only what the
cards render: path, title, category, and a prefix of the description long
enough for the partial's truncate(length=120).

Sort order mirrors components/content/src/sorting.rs in Zola: `date` newest
first (pages without a date are left out of the ordered list, as Zola does),
`title` and `slug` natural and case-insensitive, `weight` ascending, ties
broken by path. Zola transliterates non-ASCII letters before comparing
titles; this script only strips diacritics, so in CJK locales the fallback
fill can occasionally pick a different fourth card than the section scan did.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import tomllib
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT_DIR = ROOT / "data" / "related"

# Sections whose page templates include partials/related-content.html, plus
# the two the relatedness graph also covers, so the file is ready if the
# partial is added to their templates later.
SECTIONS = ("wiki", "articles", "news", "timeline")
LOCALES = ("de", "es", "fr", "he", "ja", "ko", "ru", "zh", "zh-Hant")
DEFAULT_LANG = "en"

MAX_ITEMS = 4              # matches the partial
DESCRIPTION_CHARS = 160    # the partial truncates to 120 chars; keep a prefix

# Zola strips a leading date from file names unless slugify.paths_keep_dates.
DATED_FILENAME_RE = re.compile(
    r"^(?P<datetime>\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?)(_|-)(?P<slug>.+$)"
)


@dataclass
class Page:
    path: str
    title: str | None
    description: str | None
    category: str | None
    date: dt.datetime | None
    updated: dt.datetime | None
    weight: int | None
    slug: str
    section_dir: Path = field(repr=False)


# --- frontmatter -----------------------------------------------------------

def frontmatter(md: Path) -> dict:
    text = md.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("+++"):
        return {}
    end = text.find("+++", 3)
    if end < 0:
        return {}
    try:
        return tomllib.loads(text[3:end])
    except tomllib.TOMLDecodeError:
        return {}


def fold(s: str) -> str:
    """Case-insensitive, diacritics stripped — an approximation of the
    transliteration lexical_sort applies inside Zola."""
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).casefold()


def slugify(s: str) -> str:
    """Zola's default `slugify.paths = "on"` for the ASCII slugs this corpus
    uses; the explicit `slug` most pages carry is already in this form."""
    s = fold(s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def to_utc(value) -> dt.datetime | None:
    """Zola parses dates to DateTime<Utc>: a bare date is midnight UTC, a naive
    datetime is taken as UTC, an aware one is converted."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            try:
                value = dt.date.fromisoformat(value.strip())
            except ValueError:
                return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc)
    if isinstance(value, dt.date):
        return dt.datetime(value.year, value.month, value.day, tzinfo=dt.timezone.utc)
    return None


def page_path(md: Path, fm: dict, slug: str) -> str:
    """Mirror Page::parse in Zola's components/content/src/page.rs."""
    override = fm.get("path")
    if override:
        override = str(override).strip()
        path = override if override.startswith("/") else f"/{override}"
    else:
        rel = md.relative_to(CONTENT)
        components = list(rel.parent.parent.parts) if md.name == "index.md" else list(rel.parent.parts)
        path = "/" + "/".join(components + [slug])
    if not path.endswith("/"):
        path += "/"
    return path


def load_page(md: Path, section_dir: Path) -> Page | None:
    fm = frontmatter(md)
    if fm.get("draft") is True:
        return None
    stem = md.parent.name if md.name == "index.md" else md.stem
    dated = DATED_FILENAME_RE.match(stem)
    raw_slug = fm.get("slug") or (dated.group("slug") if dated else stem)
    slug = slugify(str(raw_slug))
    date = to_utc(fm.get("date")) or (to_utc(dated.group("datetime")) if dated else None)
    extra = fm.get("extra") or {}
    category = extra.get("category") if isinstance(extra, dict) else None
    return Page(
        path=page_path(md, fm, slug),
        title=fm.get("title"),
        description=fm.get("description"),
        category=str(category) if category else None,
        date=date,
        updated=to_utc(fm.get("updated")),
        weight=fm.get("weight") if isinstance(fm.get("weight"), int) else None,
        slug=slug,
        section_dir=section_dir,
    )


# --- sections --------------------------------------------------------------

def natural_key(s: str) -> list:
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", fold(s))]


def sort_pages(pages: list[Page], sort_by: str) -> list[Page]:
    """The ordered `section.pages` Zola exposes for this sort_by."""
    if sort_by == "date":
        kept = [p for p in pages if p.date is not None]
        return sorted(kept, key=lambda p: (-p.date.timestamp(), p.path))
    if sort_by == "update_date":
        kept = [p for p in pages if p.date is not None]
        return sorted(kept, key=lambda p: (-max(p.date, p.updated or p.date).timestamp(), p.path))
    if sort_by == "title":
        kept = [p for p in pages if p.title is not None]
        return sorted(kept, key=lambda p: (natural_key(p.title), p.path))
    if sort_by == "title_bytes":
        kept = [p for p in pages if p.title is not None]
        return sorted(kept, key=lambda p: (p.title.encode(), p.path))
    if sort_by == "weight":
        kept = [p for p in pages if p.weight is not None]
        return sorted(kept, key=lambda p: (p.weight, p.path))
    if sort_by == "slug":
        return sorted(pages, key=lambda p: (natural_key(p.slug), p.path))
    if sort_by == "permalink":
        return sorted(pages, key=lambda p: p.path)
    # "none": Zola keeps load order, which is not deterministic; use path order.
    return sorted(pages, key=lambda p: p.path)


def nearest_section(md: Path, root: Path) -> Path | None:
    d = md.parent
    while True:
        if (d / "_index.md").is_file():
            return d
        if d == root:
            return None
        d = d.parent


def collect_sections(lang_root: Path) -> dict[Path, list[Page]]:
    """Map each section directory under the configured sections to its pages."""
    sections: dict[Path, list[Page]] = {}
    for name in SECTIONS:
        top = lang_root / name
        if not (top / "_index.md").is_file():
            continue
        for md in sorted(top.rglob("*.md")):
            if md.name == "_index.md":
                continue
            section_dir = nearest_section(md, top)
            if section_dir is None:
                continue
            page = load_page(md, section_dir)
            if page is not None:
                sections.setdefault(section_dir, []).append(page)
    return sections


# --- selection -------------------------------------------------------------

def related_for(page: Page, ordered: list[Page]) -> list[Page]:
    related: list[Page] = []
    for sib in ordered:
        if len(related) >= MAX_ITEMS:
            break
        if sib.path == page.path:
            continue
        if page.category and sib.category and page.category == sib.category:
            related.append(sib)
    for sib in ordered:
        if len(related) >= MAX_ITEMS:
            break
        if sib.path == page.path or any(r.path == sib.path for r in related):
            continue
        related.append(sib)
    return related


def card(p: Page) -> dict:
    entry: dict = {"path": p.path, "title": p.title}
    if p.category:
        entry["category"] = p.category
    if p.description:
        entry["description"] = p.description[:DESCRIPTION_CHARS]
    return entry


def build_lang(lang: str, lang_root: Path) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for section_dir, pages in collect_sections(lang_root).items():
        sort_by = str(frontmatter(section_dir / "_index.md").get("sort_by", "none"))
        ordered = sort_pages(pages, sort_by)
        if len(ordered) < 2 and len(pages) < 2:
            continue
        for page in pages:
            related = related_for(page, ordered)
            if related:
                out[page.path.strip("/")] = [card(r) for r in related]
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    roots = [(DEFAULT_LANG, CONTENT)] + [(loc, CONTENT / loc) for loc in LOCALES if (CONTENT / loc).is_dir()]
    for lang, root in roots:
        pages = build_lang(lang, root)
        payload = {
            "generator": "scripts/build_related.py",
            "schema_version": 1,
            "lang": lang,
            "max_items": MAX_ITEMS,
            "pages": dict(sorted(pages.items())),
        }
        target = OUT_DIR / f"{lang}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{target.relative_to(ROOT)}: {len(pages)} pages with related entries")


if __name__ == "__main__":
    main()
