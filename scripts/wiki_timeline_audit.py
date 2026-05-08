#!/usr/bin/env python3
"""Cross-reference wiki entries against timeline chapters to prioritize wiki work.

Outputs a markdown report:
  - Wiki entries ranked by total mention count across timeline chapters
  - For each entry: how many mentions are currently linked vs unlinked
  - Per-chapter coverage: which wiki entries each chapter touches
  - Stub vs fleshed-out signal (word count of the wiki body)
"""
import re
import json
from pathlib import Path
from collections import defaultdict, Counter

ROOT = Path("/Users/zara/Development/github.com/wheelofheaven/www.wheelofheaven.io")
WIKI_DIR = ROOT / "content" / "wiki"
TIMELINE_DIR = ROOT / "content" / "timeline"

FRONTMATTER_RE = re.compile(r"^\+\+\+\s*\n(.*?)\n\+\+\+\s*\n(.*)$", re.DOTALL)
WIKI_LINK_RE = re.compile(r"\[([^\]]+)\]\(/wiki/([a-z0-9\-]+)/?\)", re.IGNORECASE)


def parse_toml_lite(text):
    """Tiny TOML reader for the fields we care about: title, slug, alternative_names."""
    fields = {}
    in_extra = False
    for line in text.splitlines():
        line = line.rstrip()
        if line.startswith("["):
            in_extra = (line.strip() == "[extra]")
            continue
        m = re.match(r'^([a-z_]+)\s*=\s*"(.+)"$', line)
        if m:
            fields[m.group(1)] = m.group(2)
            continue
        m = re.match(r'^alternative_names\s*=\s*\[(.+)\]$', line)
        if m and in_extra:
            names = re.findall(r'"([^"]+)"', m.group(1))
            fields["alternative_names"] = names
    return fields


def load_wiki_entries():
    entries = {}  # slug -> {title, alt_names, body_words}
    for md in sorted(WIKI_DIR.glob("*.md")):
        if md.name == "_index.md":
            continue
        text = md.read_text()
        m = FRONTMATTER_RE.match(text)
        if not m:
            continue
        fm = parse_toml_lite(m.group(1))
        body = m.group(2)
        slug = fm.get("slug") or md.stem
        entries[slug] = {
            "title": fm.get("title", slug),
            "alt_names": fm.get("alternative_names", []),
            "body_words": len(body.split()),
        }
    return entries


def build_term_index(entries):
    """term (lowercase) -> slug. Skips ambiguous short terms."""
    index = {}
    for slug, e in entries.items():
        terms = [e["title"]] + e["alt_names"]
        for t in terms:
            key = t.lower().strip()
            if len(key) < 4:
                continue
            # Don't overwrite if a longer term already mapped here
            if key in index and index[key] != slug:
                # Ambiguous — keep first, skip
                continue
            index[key] = slug
    return index


def scan_chapter(text, term_index):
    """Return (linked_slugs:Counter, unlinked_mentions:Counter)."""
    linked = Counter()
    for m in WIKI_LINK_RE.finditer(text):
        linked[m.group(2)] += 1

    # Strip out existing wiki links so we don't double-count
    stripped = WIKI_LINK_RE.sub(lambda m: m.group(1), text)

    unlinked = Counter()
    # Sort by length desc so longer terms match first
    for term in sorted(term_index.keys(), key=len, reverse=True):
        # Whole-word match, allow trailing 's or s
        pat = re.compile(r"\b" + re.escape(term) + r"(?:'s|s)?\b", re.IGNORECASE)
        hits = pat.findall(stripped)
        if not hits:
            continue
        slug = term_index[term]
        # If already linked in this chapter, count remaining as unlinked
        # (rough approximation — first link covers the term editorially,
        # but we still want to know how many mentions exist).
        unlinked[slug] += len(hits)
        # Strip matched terms so we don't double-match shorter aliases
        stripped = pat.sub("___", stripped)
    return linked, unlinked


def main():
    entries = load_wiki_entries()
    term_index = build_term_index(entries)

    chapter_data = {}
    total_linked = Counter()
    total_unlinked = Counter()

    for md in sorted(TIMELINE_DIR.glob("*.md")):
        if md.name == "_index.md":
            continue
        text = md.read_text()
        m = FRONTMATTER_RE.match(text)
        body = m.group(2) if m else text
        linked, unlinked = scan_chapter(body, term_index)
        chapter_data[md.stem] = {
            "linked": linked,
            "unlinked": unlinked,
            "body_words": len(body.split()),
        }
        total_linked.update(linked)
        total_unlinked.update(unlinked)

    # Combined priority score per wiki slug
    combined = Counter()
    for slug in set(list(total_linked.keys()) + list(total_unlinked.keys())):
        combined[slug] = total_linked[slug] + total_unlinked[slug]

    # Build report
    out = []
    out.append("# Wiki ↔ Timeline Coverage Audit\n")
    out.append("Generated: 2026-05-08\n")
    out.append(f"- Wiki entries: **{len(entries)}**")
    out.append(f"- Timeline chapters: **{len(chapter_data)}**")
    out.append(f"- Wiki entries appearing in any chapter: **{len([s for s,c in combined.items() if c > 0])}**")
    out.append(f"- Wiki entries with zero timeline mentions: **{len([s for s in entries if combined[s] == 0])}**\n")

    # ----- Section 1: Priority list -----
    out.append("## Priority list — wiki entries ranked by timeline reach\n")
    out.append("Higher score = appears more often across the book. These entries get the most leverage from polish.\n")
    out.append("| # | Wiki entry | Total mentions | Already linked | Unlinked | Body words | Status |")
    out.append("|---|---|--:|--:|--:|--:|---|")
    sorted_slugs = sorted(combined.keys(), key=lambda s: -combined[s])
    for i, slug in enumerate(sorted_slugs, 1):
        if combined[slug] == 0:
            continue
        e = entries.get(slug, {"title": slug, "body_words": 0})
        words = e["body_words"]
        status = "stub" if words < 200 else ("thin" if words < 600 else "ok")
        out.append(f"| {i} | [{e['title']}](/wiki/{slug}/) | {combined[slug]} | {total_linked[slug]} | {total_unlinked[slug]} | {words} | {status} |")
    out.append("")

    # ----- Section 2: Wiki entries with zero timeline reach -----
    zero = [s for s in entries if combined[s] == 0]
    out.append(f"## Wiki entries with no timeline mentions ({len(zero)})\n")
    out.append("These either don't appear in the book at all, or use vocabulary that doesn't match their wiki title/aliases. Worth checking whether they should be retired, merged, or surfaced via aliases.\n")
    out.append("<details><summary>Show list</summary>\n")
    for slug in sorted(zero):
        e = entries[slug]
        out.append(f"- [{e['title']}](/wiki/{slug}/) — {e['body_words']} words")
    out.append("\n</details>\n")

    # ----- Section 3: Per-chapter coverage -----
    out.append("## Per-chapter coverage\n")
    out.append("For each chapter: top wiki entries by mention count. Bracketed is the linked-vs-unlinked split.\n")
    for chapter, data in chapter_data.items():
        merged = Counter()
        for slug, n in data["linked"].items():
            merged[slug] += n
        for slug, n in data["unlinked"].items():
            merged[slug] += n
        out.append(f"### `{chapter}` — {data['body_words']:,} words")
        if not merged:
            out.append("\n_No wiki entries detected._\n")
            continue
        out.append("")
        for slug, n in merged.most_common(15):
            title = entries.get(slug, {}).get("title", slug)
            linked = data["linked"][slug]
            unlinked = data["unlinked"][slug]
            out.append(f"- **{title}** — {n} mentions (linked: {linked}, unlinked: {unlinked})")
        out.append("")

    return "\n".join(out)


if __name__ == "__main__":
    print(main())
