"""
Discover broadcast-eligible pages by walking the content tree and
applying the eligibility rules documented at
https://docs.wheelofheaven.world/contributing/dev/social-broadcast/#what-gets-broadcast.

Output: a list of Page records, each with the metadata the renderer
and broadcasters need (slug, title, summary, permalink, broadcast
allowlist, [social] overrides, not_before).
"""

from __future__ import annotations

import sys
import tomllib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# Sections that broadcast by default. Translations (under {lang}/) and
# drafts are filtered separately.
BROADCAST_DEFAULT_TRUE = {"news", "articles"}

# Section -> URL path prefix on the live site. Anything not listed is
# computed as `/{section}/`.
SECTION_URL_PREFIX = {
    "news": "/news/",
    "articles": "/articles/",
    "wiki": "/wiki/",
    "library": "/library/",
    "timeline": "/timeline/",
    "resources": "/resources/",
}

# Language directory names that mark translations (everything else
# under content/ is the English root). Keep this in sync with the OG
# pipeline's LANGUAGES list.
TRANSLATION_DIRS = {"de", "es", "fr", "ja", "ko", "ru", "zh", "zh-Hant", "he"}


@dataclass
class Page:
    """One broadcast-eligible page."""

    slug: str  # e.g. "news/pursue-release-02-spheres-and-transmedium"
    section: str  # e.g. "news"
    title: str
    summary: str  # extra.summary, falling back to top-level description
    permalink: str  # absolute URL
    broadcast: bool | list[str]  # True / False / channel allowlist
    social: dict[str, str] = field(default_factory=dict)
    not_before: datetime | None = None
    source_path: Path | None = None  # for debugging

    def is_eligible_for(self, channel: str, now: datetime | None = None) -> bool:
        """Channel-level eligibility — broadcast flag, allowlist, quiet hours."""
        if self.broadcast is False:
            return False
        if isinstance(self.broadcast, list) and channel not in self.broadcast:
            return False
        if self.not_before is not None:
            now = now or datetime.now(timezone.utc)
            if now < self.not_before:
                return False
        return True


def _parse_frontmatter(path: Path) -> dict | None:
    """Extract the TOML frontmatter from a Zola markdown file."""
    try:
        raw = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    if not raw.startswith("+++"):
        return None
    parts = raw.split("+++", 2)
    if len(parts) < 3:
        return None
    try:
        return tomllib.loads(parts[1])
    except tomllib.TOMLDecodeError as exc:
        print(f"WARN: {path}: TOML parse error: {exc}", file=sys.stderr)
        return None


def _resolve_broadcast(fm: dict, section: str) -> bool | list[str]:
    """Apply the per-section default if `extra.broadcast` isn't set."""
    extra = fm.get("extra") or {}
    if "broadcast" in extra:
        return extra["broadcast"]
    return section in BROADCAST_DEFAULT_TRUE


def _parse_not_before(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _slug_for(content_root: Path, md_path: Path) -> tuple[str, str] | None:
    """Return (section, slug) for a non-translation, non-index page."""
    rel = md_path.relative_to(content_root)
    parts = rel.parts
    if not parts:
        return None
    if parts[0] in TRANSLATION_DIRS:
        return None
    if md_path.name == "_index.md":
        return None
    if len(parts) < 2:
        # Top-level standalone page like content/about.md — not broadcast-eligible.
        return None
    section = parts[0]
    slug_stem = md_path.stem
    return section, f"{section}/{slug_stem}"


def _permalink(base_url: str, section: str, slug_stem: str) -> str:
    prefix = SECTION_URL_PREFIX.get(section, f"/{section}/")
    return f"{base_url.rstrip('/')}{prefix}{slug_stem}/"


def discover(content_root: Path, base_url: str) -> list[Page]:
    """
    Walk content_root and yield every broadcast-considered page.

    'Considered' is broader than 'eligible' — drafts and translations
    are filtered here, but `broadcast = false` pages are still returned
    so the state file knows about them. The caller filters again by
    `Page.is_eligible_for(channel)`.
    """
    if not content_root.exists():
        raise SystemExit(
            f"content root not found: {content_root}\n"
            "Run from the www.wheelofheaven.world repo root, or set --content-root."
        )

    pages: list[Page] = []
    for md_path in sorted(content_root.rglob("*.md")):
        ids = _slug_for(content_root, md_path)
        if ids is None:
            continue
        section, slug = ids
        fm = _parse_frontmatter(md_path)
        if fm is None:
            continue
        if fm.get("draft") is True:
            continue
        title = (fm.get("title") or "").strip()
        if not title:
            continue
        extra = fm.get("extra") or {}
        summary = (extra.get("summary") or fm.get("description") or "").strip()
        broadcast = _resolve_broadcast(fm, section)
        social = fm.get("social") or {}
        if not isinstance(social, dict):
            social = {}
        not_before = _parse_not_before(social.get("not_before"))
        pages.append(
            Page(
                slug=slug,
                section=section,
                title=title,
                summary=summary,
                permalink=_permalink(base_url, section, md_path.stem),
                broadcast=broadcast,
                social={k: v for k, v in social.items() if k != "not_before"},
                not_before=not_before,
                source_path=md_path,
            )
        )
    return pages


def filter_eligible(pages: list[Page], channels: list[str], now: datetime | None = None) -> list[Page]:
    """Return pages that are eligible for *at least one* of the given channels."""
    return [p for p in pages if any(p.is_eligible_for(ch, now=now) for ch in channels)]
