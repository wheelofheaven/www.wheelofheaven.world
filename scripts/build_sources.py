#!/usr/bin/env python3
"""
Build data/sources.json — the aggregated bibliography that backs the
/sources/ overview page.

Seed strategy (idempotent):
  - If data/sources.json already exists, its `sources` array is the
    seed. This makes the script safely re-runnable — curated fields
    that aren't (yet) extractable from inline page references survive
    across regenerations.
  - First-run fallback only: if no sources.json yet, seed from the
    legacy data-bibliography submodule (data/sources/sources/*.json).
    Once sources.json is committed the submodule is no longer needed.

Inline scan:
  - content/{wiki,articles,timeline,library}/**/*.md — reads the TOML
    frontmatter for `[extra].references = [...]` arrays. Each entry
    becomes either a new source or a backlink against an existing one
    (matched by `follow_url`).

Output:
  - data/sources.json — single flat file consumed by
    sources-section.html via Zola's load_data.

Run: `python scripts/build_sources.py` (or `mise run sources`).
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
import tomllib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LEGACY_SEED_DIR = PROJECT_ROOT / "data" / "sources" / "sources"
OUTPUT_PATH = PROJECT_ROOT / "data" / "sources.json"
CONTENT_ROOT = PROJECT_ROOT / "content"
SCAN_SECTIONS = ("wiki", "articles", "timeline", "library")

# Legacy data-bibliography source_type → new V1 `medium` value. The new
# vocabulary matches `.claude/rules/content.md`'s `medium` list so the
# inline-references convention and the seeded entries share one space.
MEDIUM_MAP = {
    "academic_monograph": "nonfiction-book",
    "academic_article": "academic-paper",
    "scripture": "religious-text",
    "myth_text": "religious-text",
    "encyclopedia": "wiki",
    "commentary": "article",
    "documentary": "documentary",
    "official_document": "article",
    "fiction": "fiction-book",
    "lecture": "lecture",
    "web_resource": "website",
    "podcast": "podcast",
    "manifesto": "article",
}

# Front matter delimiter for Zola's TOML frontmatter.
FRONTMATTER_RE = re.compile(r"^\+\+\+\s*\n(.*?)\n\+\+\+\s*\n", re.DOTALL)


def slugify(value: str) -> str:
    """Cheap deterministic slug for inline refs without an explicit id."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:80] or "untitled"


def normalize_url(url: str | None) -> str | None:
    if not url:
        return None
    return url.strip().rstrip("/").lower()


def _empty_record(record_id: str) -> dict:
    return {
        "id": record_id,
        "title": record_id,
        "authored_by": [],
        "publish_date": "",
        "follow_url": "",
        "description": "",
        "medium": "",
        "topics": [],
        "cited_by": [],
        "cite_count": 0,
    }


def _normalize_legacy(raw: dict, fallback_id: str) -> dict:
    """Map a data-bibliography record into the V1 shape."""
    record_id = raw.get("id") or fallback_id
    # Legacy description is a per-locale map; new shape is monolingual.
    description = ""
    desc_obj = raw.get("description")
    if isinstance(desc_obj, dict):
        description = desc_obj.get("en") or next(iter(desc_obj.values()), "")
    elif isinstance(desc_obj, str):
        description = desc_obj
    return {
        "id": record_id,
        "title": raw.get("title", record_id),
        "authored_by": list(raw.get("authored_by") or []),
        "publish_date": raw.get("publish_date") or "",
        "follow_url": raw.get("follow_url") or "",
        "description": description,
        "medium": MEDIUM_MAP.get(raw.get("source_type") or "", raw.get("source_type") or ""),
        "topics": list(raw.get("topics") or []),
        "cited_by": [],
        "cite_count": 0,
    }


def load_seed() -> tuple[dict[str, dict], str]:
    """Seed the source dict. Prefers the previous build output for
    idempotent regeneration; falls back to the legacy data-bibliography
    submodule on first ever run."""
    # Path 1: re-seed from the previously generated artifact.
    if OUTPUT_PATH.is_file():
        with OUTPUT_PATH.open(encoding="utf-8") as f:
            prior = json.load(f)
        seeds: dict[str, dict] = {}
        for entry in prior.get("sources") or []:
            record_id = entry.get("id")
            if not record_id:
                continue
            # Reset cited_by + cite_count — they get recomputed below.
            base = {**_empty_record(record_id), **entry}
            base["cited_by"] = []
            base["cite_count"] = 0
            seeds[record_id] = base
        return seeds, f"prior {OUTPUT_PATH.relative_to(PROJECT_ROOT)}"

    # Path 2: legacy submodule (first-run only).
    if LEGACY_SEED_DIR.is_dir():
        seeds = {}
        for path in sorted(LEGACY_SEED_DIR.glob("*.json")):
            with path.open(encoding="utf-8") as f:
                raw = json.load(f)
            record = _normalize_legacy(raw, fallback_id=path.stem)
            seeds[record["id"]] = record
        return seeds, f"legacy {LEGACY_SEED_DIR.relative_to(PROJECT_ROOT)}"

    print(
        f"warn: no seed available (neither {OUTPUT_PATH.relative_to(PROJECT_ROOT)} "
        f"nor {LEGACY_SEED_DIR.relative_to(PROJECT_ROOT)})",
        file=sys.stderr,
    )
    return {}, "empty"


def parse_frontmatter(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        return None
    try:
        return tomllib.loads(match.group(1))
    except tomllib.TOMLDecodeError as exc:
        print(f"warn: TOML parse failed for {path}: {exc}", file=sys.stderr)
        return None


def page_path(md_path: Path) -> str:
    """Permalink-style path for a content markdown file (English only —
    translations mirror slugs, and the dedup at the source level means
    we don't want 9× backlinks per cite)."""
    rel = md_path.relative_to(CONTENT_ROOT).with_suffix("")
    parts = list(rel.parts)
    if parts and parts[-1] == "_index":
        parts = parts[:-1]
    return "/" + "/".join(parts) + "/"


def scan_pages(seeds: dict[str, dict]) -> int:
    """Walk SCAN_SECTIONS, merge any inline references into seeds (by
    URL match) or insert new entries. Returns count of unique citations
    recorded."""
    cites_recorded = 0
    seed_by_url = {
        normalize_url(s["follow_url"]): sid
        for sid, s in seeds.items()
        if s["follow_url"]
    }

    for section in SCAN_SECTIONS:
        section_dir = CONTENT_ROOT / section
        if not section_dir.is_dir():
            continue
        for md_path in section_dir.rglob("*.md"):
            # Skip translations — scanning only en avoids 9× backlinks
            # per cite. If a translation diverges in references, that's
            # an editorial bug, not something the aggregator should
            # paper over.
            rel = md_path.relative_to(CONTENT_ROOT)
            if rel.parts and rel.parts[0] in {"de", "fr", "es", "ru", "ja", "ko", "zh", "zh-Hant", "he"}:
                continue

            fm = parse_frontmatter(md_path)
            if not fm:
                continue
            extra = fm.get("extra") or {}
            refs = extra.get("references") or []
            if not isinstance(refs, list):
                continue

            page_link = {
                "section": section,
                "title": fm.get("title", md_path.stem),
                "path": page_path(md_path),
            }

            for ref in refs:
                if not isinstance(ref, dict):
                    continue
                title = (ref.get("title") or "").strip()
                if not title:
                    continue
                url = ref.get("url") or ""
                norm = normalize_url(url)

                # Match against an existing seed by URL, else create a
                # new lightweight record.
                target_id = seed_by_url.get(norm) if norm else None
                if not target_id:
                    target_id = slugify(title)
                    # Disambiguate if slug collision against a seed
                    # with a different URL.
                    if target_id in seeds and seeds[target_id]["follow_url"] and norm and normalize_url(seeds[target_id]["follow_url"]) != norm:
                        target_id = f"{target_id}-{slugify(ref.get('author') or '')[:20]}"
                    if target_id not in seeds:
                        seeds[target_id] = {
                            "id": target_id,
                            "title": title,
                            "authored_by": [ref["author"]] if ref.get("author") else [],
                            "publish_date": str(ref.get("date") or ""),
                            "follow_url": url or "",
                            "description": "",
                            "medium": ref.get("medium") or "",
                            "topics": [],
                            "cited_by": [],
                            "cite_count": 0,
                        }
                        if norm:
                            seed_by_url[norm] = target_id

                # Append backlink if not already present.
                existing = seeds[target_id]["cited_by"]
                if not any(c["path"] == page_link["path"] for c in existing):
                    existing.append(page_link)
                    cites_recorded += 1

    # Finalize cite_count + sort cited_by for stable output.
    for s in seeds.values():
        s["cited_by"].sort(key=lambda c: (c["section"], c["path"]))
        s["cite_count"] = len(s["cited_by"])
    return cites_recorded


def write_output(seeds: dict[str, dict], cites_recorded: int) -> None:
    sources = sorted(seeds.values(), key=lambda s: s["title"].casefold())

    media_counts: dict[str, int] = {}
    for s in sources:
        media_counts[s["medium"] or "unknown"] = media_counts.get(s["medium"] or "unknown", 0) + 1

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/build_sources.py",
        "schema_version": 1,
        "total": len(sources),
        "total_cites": cites_recorded,
        "media_counts": media_counts,
        "sources": sources,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}: {len(sources)} sources, {cites_recorded} inline cites")


def main() -> None:
    seeds, source = load_seed()
    print(f"seeded {len(seeds)} record(s) from {source}")
    cites = scan_pages(seeds)
    write_output(seeds, cites)


if __name__ == "__main__":
    main()
