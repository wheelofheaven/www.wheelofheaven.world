#!/usr/bin/env python3
"""
Build data/translations.json — the canonical-path → [languages] manifest
the hreflang partial reads via load_data.

Why this exists: the site uses directory-based locales
(`content/de/wiki/elohim.md`), but Zola's native `page.translations`
only links files that share a basename with `.<lang>.md` suffixes
(`content/wiki/elohim.de.md`). The directory layout is treated as
unrelated pages, so `page.translations` always comes back empty and
hreflang is broken — Google sees 10 near-identical URL trees with no
signal binding them as alternates.

The manifest gives the hreflang template ground truth: for any
canonical path, which language URLs actually exist.

Schema:

    {
        "_meta": {"generated_at": "2026-05-23T09:15:00Z", "count": 261},
        "paths": {
            "wiki/elohim": ["en", "de", "es", "fr", "ja", "ko", "ru", "zh", "zh-Hant"],
            "timeline/age-of-aquarius": ["en", "de", "es", "fr", "ja", "ko", "ru", "zh"],
            "_root": ["en", "de", "es", "fr", "ja", "ko", "ru", "zh", "zh-Hant", "he"]
        }
    }

Canonical-path normalization:
  - content/wiki/elohim.md            -> "wiki/elohim"
  - content/de/wiki/elohim.md         -> "wiki/elohim"     (locale prefix stripped)
  - content/wiki/_index.md            -> "wiki"
  - content/_index.md                 -> "_root"           (special sentinel)

Run: `python scripts/build_translations_manifest.py` (or `mise run translations`).
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONTENT_ROOT = PROJECT_ROOT / "content"
OUTPUT_PATH = PROJECT_ROOT / "data" / "translations.json"

# Must match [languages.*] in config.toml. English is the default and
# lives at content/ (no prefix); the rest live at content/<code>/.
LOCALES = ("de", "es", "fr", "he", "ja", "ko", "ru", "zh", "zh-Hant")
DEFAULT_LOCALE = "en"


def canonical_path(md_file: Path) -> tuple[str, str]:
    """Return (canonical_path, locale) for a content markdown file.

    canonical_path is the language-agnostic key the hreflang template
    looks up; locale is the file's language code.
    """
    rel = md_file.relative_to(CONTENT_ROOT)
    parts = list(rel.parts)

    # Detect locale prefix.
    if parts and parts[0] in LOCALES:
        locale = parts[0]
        parts = parts[1:]
    else:
        locale = DEFAULT_LOCALE

    # Drop the .md extension on the last segment, then drop _index/index.
    if not parts:
        # content/<locale>/_index.md case lands here after popping the locale.
        return "_root", locale

    last = parts[-1]
    if last in ("_index.md", "index.md"):
        parts = parts[:-1]
    else:
        parts[-1] = last.removesuffix(".md")

    if not parts:
        return "_root", locale

    return "/".join(parts), locale


def build_manifest() -> dict:
    paths: dict[str, set[str]] = {}

    for md_file in sorted(CONTENT_ROOT.rglob("*.md")):
        # Skip drafts, snippets, anything starting with "."
        if any(part.startswith(".") for part in md_file.parts):
            continue
        key, locale = canonical_path(md_file)
        paths.setdefault(key, set()).add(locale)

    # Sort each language list for stable diffs.
    paths_sorted = {k: sorted(v) for k, v in sorted(paths.items())}

    return {
        "_meta": {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "count": len(paths_sorted),
        },
        "paths": paths_sorted,
    }


def main() -> int:
    if not CONTENT_ROOT.is_dir():
        print(f"error: content/ not found at {CONTENT_ROOT}", file=sys.stderr)
        return 1

    manifest = build_manifest()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    print(f"Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}: {manifest['_meta']['count']} canonical paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
