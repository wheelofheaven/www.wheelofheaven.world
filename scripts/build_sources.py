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
  - content/{wiki,articles,timeline,library,sources}/**/*.md — reads the
    TOML frontmatter for `[extra].references = [...]` arrays.
  - New structured references with an `id` become backlinks against the
    matching source record.
  - Legacy title/url references become either a new source or a backlink
    against an existing one (matched by `follow_url`).

Output:
  - data/sources.json — single flat file consumed by
    sources-section.html via Zola's load_data.
  - data/sources/cited-by.json — reverse index for source detail pages.
  - data/sources/by-id.json — id -> title/authors/date lookup for the
    reference lists on wiki, article, timeline, library and hub pages.
  - data/sources/records/<id>.json — one full record per source, read by
    source-page.html instead of the whole manifest.
  - content/sources/_generated/*.md — tiny page stubs for /sources/{id}/.

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
CITED_BY_OUTPUT_PATH = PROJECT_ROOT / "data" / "sources" / "cited-by.json"
BY_ID_OUTPUT_PATH = PROJECT_ROOT / "data" / "sources" / "by-id.json"
RECORDS_DIR = PROJECT_ROOT / "data" / "sources" / "records"
LICENSING_PATH = PROJECT_ROOT / "data" / "sources" / "licensing.json"
CONTENT_ROOT = PROJECT_ROOT / "content"
SOURCE_PAGES_DIR = CONTENT_ROOT / "sources" / "_generated"
SOURCE_PAGE_LOCALES = ("en", "de", "es", "fr", "he", "ja", "ko", "ru", "zh", "zh-Hant")
SCAN_SECTIONS = ("wiki", "articles", "timeline", "library", "sources")

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


def normalize_title_quotes(title: str) -> str:
    """Curl straight quotes in harvested titles to typographic ones.

    Inline reference titles wrap quoted article titles in straight
    quotes ('Beyond Judaism: ...,' JSJ 41), which render as a
    wrong-direction ’ at the start of every /sources/ card. Order
    matters: apostrophes between word characters first (Shi'ur →
    Shi’ur), then openers after a boundary, then every remaining
    straight quote is a closer. Idempotent — typographic input is
    untouched. slugify() collapses both forms identically, so minted
    ids are unaffected."""
    title = re.sub(r"(?<=\w)'(?=\w)", "’", title)
    title = re.sub(r"(^|[\s(\[{—–-])'", "\\1‘", title)
    title = title.replace("'", "’")
    title = re.sub(r'(^|[\s(\[{—–-])"', "\\1“", title)
    title = title.replace('"', "”")
    return title


def toml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def source_page_path(source_id: str, locale: str) -> str:
    if locale == "en":
        return f"/sources/{source_id}/"
    return f"/{locale}/sources/{source_id}/"


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
            base["title"] = normalize_title_quotes(base.get("title") or record_id)
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
            # Skip draft pages. Their inline references are provisional and
            # must not mint source records or cited_by backlinks: a draft's
            # page 404s live, so every backlink to it is dead. (Audit
            # 2026-08-01: draft articles leaked a placeholder "[GATHER]"
            # source record plus ~205 dead /sources/ cited-by links.)
            if fm.get("draft") is True:
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
                ref_id = (ref.get("id") or "").strip()
                if ref_id:
                    ref_id = CANONICAL_MERGES.get(ref_id, ref_id)
                    if ref_id not in seeds:
                        rel_path = md_path.relative_to(PROJECT_ROOT)
                        raise ValueError(f"{rel_path}: unknown source id in extra.references: {ref_id}")
                    target_id = ref_id
                    target = seeds[target_id]
                    existing = target["cited_by"]
                    if not any(c["path"] == page_link["path"] for c in existing):
                        existing.append(page_link)
                        cites_recorded += 1
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
                            "title": normalize_title_quotes(title),
                            "authored_by": [ref["author"]] if ref.get("author") else [],
                            "publish_date": str(ref.get("date") or ""),
                            "follow_url": url or "",
                            "description": ref.get("description") or "",
                            "medium": ref.get("medium") or "",
                            "topics": [],
                            "cited_by": [],
                            "cite_count": 0,
                        }
                        if norm:
                            seed_by_url[norm] = target_id

                # Fill sparse catalogue records from richer inline references.
                # Curated source fields already present in the seed take
                # precedence over chapter-level metadata.
                target = seeds[target_id]
                if not target["authored_by"] and ref.get("author"):
                    target["authored_by"] = [ref["author"]]
                if not target["publish_date"] and ref.get("date"):
                    target["publish_date"] = str(ref["date"])
                if not target["description"] and ref.get("description"):
                    target["description"] = ref["description"]
                if not target["medium"] and ref.get("medium"):
                    target["medium"] = ref["medium"]

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


def write_by_id(sources: list[dict], payload: dict) -> None:
    """data/sources/by-id.json — the slim lookup templates use to resolve a
    cited source id to its title, authors and date (wiki, article, timeline,
    library and tradition-hub pages). Keyed by id so a template does a direct
    lookup instead of filtering the 800-record manifest, and small enough that
    Zola's per-render clone of the loaded file is free; loading the full
    sources.json on every page cost a seventh of the build."""
    by_id = {
        s["id"]: {
            "id": s["id"],
            "title": s["title"],
            "authored_by": s.get("authored_by") or [],
            "publish_date": s.get("publish_date"),
        }
        for s in sources
    }
    BY_ID_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    BY_ID_OUTPUT_PATH.write_text(
        json.dumps(
            {
                "generated_at": payload["generated_at"],
                "generator": payload["generator"],
                "schema_version": payload["schema_version"],
                "total": len(by_id),
                "sources": by_id,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_records(sources: list[dict]) -> None:
    """data/sources/records/<id>.json — one full record per source (cited_by
    included), read by source-page.html. There are 8,000 source detail pages
    (800 records x 10 locales); each used to load the whole manifest plus the
    cited-by index and filter for its own id, which cloned ~1.2 MB of JSON per
    page and was the largest remaining cost of the full build. Stale files
    are pruned the same way the page stubs are."""
    RECORDS_DIR.mkdir(parents=True, exist_ok=True)
    current_ids = {s["id"] for s in sources}
    for stale in RECORDS_DIR.glob("*.json"):
        if stale.stem not in current_ids:
            stale.unlink()
    for s in sources:
        (RECORDS_DIR / f"{s['id']}.json").write_text(
            json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


def write_output(seeds: dict[str, dict], cites_recorded: int) -> None:
    sources = sorted(seeds.values(), key=lambda s: (s["title"].casefold(), s["id"]))

    # licensing_status: the curated sidecar (data/sources/licensing.json) is
    # the single authority — seed-carried values are overwritten, and sources
    # without a determination are explicitly `unverified` rather than silent.
    statuses: dict[str, str] = {}
    if LICENSING_PATH.is_file():
        with LICENSING_PATH.open(encoding="utf-8") as f:
            statuses = json.load(f).get("statuses") or {}
    for s in sources:
        s["licensing_status"] = statuses.get(s["id"], "unverified")

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

    cited_by_payload = {
        "generated_at": payload["generated_at"],
        "generator": payload["generator"],
        "schema_version": payload["schema_version"],
        "sources": [
            {
                "id": s["id"],
                "cited_by": s["cited_by"],
                "cite_count": s["cite_count"],
            }
            for s in sources
        ],
    }
    CITED_BY_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CITED_BY_OUTPUT_PATH.write_text(
        json.dumps(cited_by_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    write_by_id(sources, payload)
    write_records(sources)

    write_source_pages(sources)

    print(
        f"wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}: {len(sources)} sources, {cites_recorded} inline cites"
    )
    print(f"wrote {CITED_BY_OUTPUT_PATH.relative_to(PROJECT_ROOT)}")
    print(f"wrote source page shells for {len(sources)} source(s) across {len(SOURCE_PAGE_LOCALES)} locale(s)")


def render_source_page_stub(source: dict, locale: str) -> str:
    """Render a tiny page stub that points Zola at the source detail template."""
    lines = [
        "+++",
        f'title = {toml_quote(source["title"])}',
        f"path = {toml_quote(source_page_path(source['id'], locale))}",
        'template = "source-page.html"',
    ]
    if source.get("description"):
        lines.append(f'description = {toml_quote(source["description"])}')
    lines.extend(
        [
            "",
            "[extra]",
            f'source_id = {toml_quote(source["id"])}',
            'translation_status = "en_only"',
            "+++",
            "",
        ]
    )
    return "\n".join(lines)


def write_source_pages(sources: list[dict]) -> None:
    current_ids = {source["id"] for source in sources}
    for locale in SOURCE_PAGE_LOCALES:
        locale_dir = CONTENT_ROOT / locale / "sources" / "_generated" if locale != "en" else SOURCE_PAGES_DIR
        locale_dir.mkdir(parents=True, exist_ok=True)
        # Prune stale stubs so a record dropped from the seed doesn't linger
        # as an orphan page. The dir holds only generated stubs (id.md), so
        # removing any whose id is no longer current is safe.
        for stale in locale_dir.glob("*.md"):
            if stale.stem not in current_ids:
                stale.unlink()
        for source in sources:
            page_path = locale_dir / f"{source['id']}.md"
            page_path.write_text(render_source_page_stub(source, locale), encoding="utf-8")


# ---------------------------------------------------------------------------
# Canonical merges — collapse duplicate auto-harvested records.
#
# scan_pages() mints a record id by slugifying an inline reference's `title`
# (see slugify). When two articles cite the SAME work with different
# descriptive `title=` blurbs, the one work slugifies to two different ids
# and surfaces as two catalogue records. This table collapses such known
# duplicates into a single clean canonical record at build time — so the fix
# is self-healing on every regeneration and needs no content edits.
#
# To dedupe a new pair: map each auto-slug to a canonical id in
# CANONICAL_MERGES, and give the canonical id display metadata in
# CANONICAL_RECORDS.
# ---------------------------------------------------------------------------
CANONICAL_MERGES = {
    "the-dead-sea-scrolls-a-biography-lives-of-great-religious-books-the-discovery-pu": "collins-dead-sea-scrolls-biography",
    "the-dead-sea-scrolls-a-biography-lives-of-great-religious-books-the-principal-se": "collins-dead-sea-scrolls-biography",
    "the-dead-sea-scrolls-deception-the-vatican-conspiracy-bestseller-engagingly-writ": "baigent-leigh-dead-sea-scrolls-deception",
    "the-dead-sea-scrolls-deception-the-vatican-conspiracy-thesis-this-article-reject": "baigent-leigh-dead-sea-scrolls-deception",
    "on-the-jerusalem-origin-of-the-dead-sea-scrolls-the-fullest-short-statement-of-t": "golb-jerusalem-origin-dead-sea-scrolls",
    "on-the-jerusalem-origin-of-the-dead-sea-scrolls-the-principal-statement-of-the-n": "golb-jerusalem-origin-dead-sea-scrolls",
    "shi-ur-omah-in-the-jewish-encyclopedia-vol-xi": "bacher-blau-shiur-komah-jewish-encyclopedia",
    "shi-ur-omah-in-the-jewish-encyclopedia-vol-xi-the-1906-english-article-gives-the": "bacher-blau-shiur-komah-jewish-encyclopedia",
    "the-shi-ur-qomah-texts-and-recensions-tsaj-9": "cohen-shiur-qomah-texts-recensions",
    "the-shi-ur-qomah-texts-and-recensions-tsaj-9-the-critical-edition": "cohen-shiur-qomah-texts-recensions",
    "the-eden-conspiracy": "wallis-eden-conspiracy",
    "the-message-of-the-sphinx-keeper-of-genesis-with-robert-bauval-the-giza-orion-co": "hancock-bauval-message-of-the-sphinx",
    # Palmer's Aliens Adored accumulated two aliases: one bare-title harvest
    # and one from an annotated title. The citing article now references
    # `aliens-adored` directly; these entries keep the aliases collapsed if an
    # older reference form reappears.
    "aliens-adored-ra-l-s-ufo-religion": "aliens-adored",
    "aliens-adored-ra-l-s-ufo-religion-the-standard-academic-study-of-ra-lism-notes-s": "aliens-adored",
}

CANONICAL_RECORDS = {
    "collins-dead-sea-scrolls-biography": {
        "title": "The Dead Sea Scrolls: A Biography (Lives of Great Religious Books)",
        "authored_by": ["John J. Collins"],
        "publish_date": "2013",
        "follow_url": "",
        "medium": "nonfiction-book",
        "description": "John J. Collins's short “biography” of the Dead Sea Scrolls in the Princeton Lives of Great Religious Books series: the discovery narrative, the forty-year publication scandal, the Essene debate, and the canon-and-text questions.",
        "topics": ["dead-sea-scrolls", "qumran", "second-temple-judaism"],
    },
    "baigent-leigh-dead-sea-scrolls-deception": {
        "title": "The Dead Sea Scrolls Deception",
        "authored_by": ["Michael Baigent & Richard Leigh"],
        "publish_date": "1991",
        "follow_url": "",
        "medium": "nonfiction-book",
        "description": "The 1991 bestseller advancing the Vatican-suppression conspiracy thesis about the scrolls' delayed publication — cited across the corpus as the cautionary control on sensational readings.",
        "topics": ["dead-sea-scrolls", "conspiracy-literature"],
    },
    "hancock-bauval-message-of-the-sphinx": {
        "title": "The Message of the Sphinx: A Quest for the Hidden Legacy of Mankind",
        "authored_by": ["Graham Hancock & Robert Bauval"],
        "publish_date": "1996",
        "follow_url": "",
        "medium": "nonfiction-book",
        "description": "Hancock and Bauval’s Giza–Orion correlation argument (published in the UK as Keeper of Genesis): the Sphinx and pyramid layout read as a sky-map of the c. 10,500 BCE ‘First Time’.",
        "topics": ["giza", "orion-correlation", "archaeoastronomy"],
    },
    "bacher-blau-shiur-komah-jewish-encyclopedia": {
        "title": "‘Shi’ur Ḳomah,’ in The Jewish Encyclopedia, vol. XI",
        "authored_by": ["Wilhelm Bacher & Ludwig Blau"],
        "publish_date": "1906",
        "follow_url": "",
        "medium": "article",
        "description": "The 1906 English encyclopedia article on the Shi’ur Ḳomah; gives the soles at 30 million parasangs and records the ‘237 myriad’ variant.",
        "topics": ["shiur-qomah", "jewish-mysticism"],
    },
    "cohen-shiur-qomah-texts-recensions": {
        "title": "The Shi’ur Qomah: Texts and Recensions (TSAJ 9)",
        "authored_by": ["Martin Samuel Cohen"],
        "publish_date": "1985",
        "follow_url": "",
        "medium": "nonfiction-book",
        "description": "Martin Samuel Cohen’s critical edition of the Shi’ur Qomah text corpus (Tübingen: Mohr Siebeck, Texts and Studies in Ancient Judaism 9).",
        "topics": ["shiur-qomah", "jewish-mysticism"],
    },
    "golb-jerusalem-origin-dead-sea-scrolls": {
        "title": "On the Jerusalem Origin of the Dead Sea Scrolls",
        "authored_by": ["Norman Golb"],
        "publish_date": "2009",
        "follow_url": "http://oi.uchicago.edu/pdf/jerusalem_origin_dss.pdf",
        "medium": "academic-paper",
        "description": "Norman Golb's statement of the Jerusalem (non-Qumranic) provenance hypothesis: that the scrolls are salvaged libraries of Jerusalem hidden in the desert before the Roman siege, rather than a single sectarian library at Qumran.",
        "topics": ["dead-sea-scrolls", "qumran", "provenance-debate"],
    },
}


def canonicalize(seeds: dict[str, dict]) -> int:
    """Collapse duplicate auto-harvested records (see CANONICAL_MERGES).

    Runs after scan_pages: redirects each alias record's backlinks to a
    single canonical record (created from CANONICAL_RECORDS if absent),
    then drops the alias record. Returns the count of aliases merged."""
    merged = 0
    for alias_id, canonical_id in CANONICAL_MERGES.items():
        alias = seeds.get(alias_id)
        if alias is None:
            continue
        canonical = seeds.get(canonical_id)
        if canonical is None:
            canonical = {**_empty_record(canonical_id), **CANONICAL_RECORDS.get(canonical_id, {})}
            canonical["id"] = canonical_id
            seeds[canonical_id] = canonical
        seen = {c["path"] for c in canonical["cited_by"]}
        for cite in alias["cited_by"]:
            if cite["path"] not in seen:
                canonical["cited_by"].append(cite)
                seen.add(cite["path"])
        del seeds[alias_id]
        merged += 1
    # Re-sort + recompute cite_count for every canonical target.
    for canonical_id in set(CANONICAL_MERGES.values()):
        target = seeds.get(canonical_id)
        if target is not None:
            target["cited_by"].sort(key=lambda c: (c["section"], c["path"]))
            target["cite_count"] = len(target["cited_by"])
    return merged


def main() -> None:
    seeds, source = load_seed()
    print(f"seeded {len(seeds)} record(s) from {source}")
    # Materialize canonical records up front so structured refs that
    # resolve through CANONICAL_MERGES always land on an existing record
    # (scan_pages raises on unknown ids).
    for canonical_id, meta in CANONICAL_RECORDS.items():
        if canonical_id not in seeds:
            seeds[canonical_id] = {**_empty_record(canonical_id), **meta, "id": canonical_id}
    cites = scan_pages(seeds)
    merged = canonicalize(seeds)
    if merged:
        print(
            f"canonicalized {merged} duplicate record(s) into "
            f"{len(set(CANONICAL_MERGES.values()))} canonical record(s)"
        )
    write_output(seeds, cites)


if __name__ == "__main__":
    main()
