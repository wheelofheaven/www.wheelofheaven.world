#!/usr/bin/env python3
"""Generate config.dev.toml — a fast, English-only variant of config.toml.

A full build renders ~10,700 pages and writes ~3.8 GB, and takes about three
minutes. The nine translated locales are ~90% of those pages and ~92% of those
bytes, and you almost never need them while adjusting a hover state in bifrost.
Building against this config instead takes about 20 seconds.

It differs from the production config in three ways:

  * ``build_search_index = false`` — a whole-corpus pass
  * ``generate_feeds = false``     — same, per taxonomy
  * ``ignored_content`` skips the pages under the nine locale directories

The ``[languages.*]`` tables are kept verbatim. They generate no pages of their
own under directory-based locales, and 404.html builds a client-side i18n table
by calling ``trans()`` across every declared language — strip them and the
build fails there.

The glob shape matters. Zola applies ``ignored_content`` to pages but not to
section ``_index.md`` files, so patterns that swallow a whole locale directory
leave its section roots behind, and those then fail on ``get_section()`` lookups
into the pages that were just skipped. Matching only basenames that do not start
with an underscore keeps every ``_index.md`` loaded — the locale sections all
still exist, they are simply empty — while dropping the ~9,600 locale pages.

The file is generated rather than hand-maintained so it cannot drift from
config.toml. It is gitignored; regenerate with ``mise run dev-config``.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "config.toml"
DST = ROOT / "config.dev.toml"
DST_LEAN = ROOT / "config.lean.toml"

def locales(src: str) -> list[str]:
    """The non-default languages config.toml declares, in declaration order.

    Read from the config rather than hardcoded so adding a tenth locale does
    not silently leave it in the dev build.
    """
    found = re.findall(r"^\[languages\.([^.\]]+)\]$", src, re.M)
    if not found:
        raise SystemExit("config.toml: no [languages.*] tables found — has the layout changed?")
    return found

BANNER = """# GENERATED FILE — do not edit. Run `mise run dev-config` to refresh.
#
# {what}
# Derived from config.toml; see scripts/build_dev_config.py for the full
# rationale.

"""

DEV_NOTE = "English-only development config, used by `mise run dev`."
LEAN_NOTE = (
    "English-only development config that additionally drops the ~800\n"
    "# generated /sources/ record pages, used by `mise run dev-lean`."
)

# The generated bibliography records under content/sources/_generated/ are ~70%
# of the English page count and near-identical to each other, so dropping them
# roughly halves the rebuild again. Skip this in lean mode only — you need them
# back when you are working on source-page.html itself.
LEAN_EXTRA = "**/content/sources/_generated/[!_]*.md"


def render(src: str, note: str, extra_patterns: list[str]) -> str:
    # Both keys also appear inside the per-language tables further down, so
    # anchor to the line start and rewrite only the first (top-level) match.
    out, n_search = re.subn(
        r"^build_search_index = true$", "build_search_index = false", src, count=1, flags=re.M
    )
    out, n_feeds = re.subn(
        r"^generate_feeds = true$", "generate_feeds = false", out, count=1, flags=re.M
    )
    if not (n_search and n_feeds):
        raise SystemExit(
            "config.toml: expected top-level build_search_index/generate_feeds — has the layout changed?"
        )

    # Zola matches these against each file's *absolute* path, hence the
    # "**/content/" anchor: a bare "de/**" silently matches nothing. The
    # "[!_]" class is what spares the section indexes — see the module
    # docstring for why they have to survive.
    patterns = list(extra_patterns)
    for loc in locales(src):
        patterns.append(f"**/content/{loc}/[!_]*.md")
        patterns.append(f"**/content/{loc}/**/[!_]*.md")
    ignored = "ignored_content = [\n" + "".join(f'    "{p}",\n' for p in patterns) + "]\n\n"

    # Must land among the top-level keys, before the first sub-table, or TOML
    # would nest it under [markdown].
    out, n_ignore = re.subn(r"^\[markdown\]$", ignored + "[markdown]", out, count=1, flags=re.M)
    if not n_ignore:
        raise SystemExit("config.toml: expected a [markdown] table to anchor ignored_content")

    return BANNER.format(what=note) + out


def main() -> None:
    src = SRC.read_text(encoding="utf-8")
    DST.write_text(render(src, DEV_NOTE, []), encoding="utf-8")
    DST_LEAN.write_text(render(src, LEAN_NOTE, [LEAN_EXTRA]), encoding="utf-8")
    print(f"config.dev.toml and config.lean.toml written — skipping {', '.join(locales(src))}")


if __name__ == "__main__":
    main()
