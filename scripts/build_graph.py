#!/usr/bin/env python3
"""Build static/graph/graph.json — the knowledge graph drawn on /graph/.

Distils one graph from what the corpus already carries; it writes no content files:

  nodes   every English page in wiki/, articles/, timeline/, news/, library/ and
          datasets/; every topic in data/graph/topics.toml; every core claim record
          (when the core repository sits beside www, see --core); every source in
          data/sources.json that a page cites.
  links   body links between pages ({% wiki %}, {% library %}/{% libref %} and
          markdown links), see_also, page → topic (topic `match` terms against the
          page's title, alternative names, keywords, category, description and
          summary), topic → broader topic, library book → its tradition topic,
          Raëlian book → the scripture books it quotes (data/canon_citations),
          page → core claim (core_claim_ids), claim → claim (dependencies),
          timeline age → next age, source → citing page and source → topic.

Each node: id, kind, label, url, meta, desc. Each link: [source, target, type].
The renderer (themes/bifrost/static/js/knowledge-graph.js) lays it out in the
browser, so this file stays small and the layout follows the data.

Run: `mise run graph` (or python3 scripts/build_graph.py [--core ../core]).
The run prints a coverage report: topics nothing is filed under, and pages that
match no topic — the vocabulary's to-do list.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    sys.exit("build_graph.py needs Python 3.11+ (tomllib). Run it via `mise run graph`.")

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
DATA = ROOT / "data"
OUT = ROOT / "static" / "graph" / "graph.json"
SECTIONS = {
    "wiki": "wiki",
    "articles": "article",
    "timeline": "timeline",
    "news": "news",
    "library": "book",
    "datasets": "dataset",
}
CORE_URL = "https://github.com/wheelofheaven/core/blob/main/model/claims/{}.json"
# Library catalog tradition → the topic that stands for it.
TRADITION_TOPIC = {
    "raelian": "raelism",
    "hebrew-bible": "hebrew-bible",
    "christian": "christianity",
    "judaic": "second-temple-judaism",
    "apocrypha": "second-temple-judaism",
    "ancient-astronaut": "ancient-astronaut-literature",
    "islamic": "islam",
    "mesopotamian": "mesopotamia",
    "mormon": "new-religions",
    "bahai": "new-religions",
    "caodai": "new-religions",
    "oomoto": "new-religions",
    "western_esoteric": "gnosticism-and-hermeticism",
    "egyptian": "egypt",
    "vedic": "india-and-persia",
    "persian": "india-and-persia",
    "levantine": "levant-and-anatolia",
    "anatolian": "levant-and-anatolia",
    "kabbalah": "jewish-mysticism",
    "greek": "greece",
}
FRONT = re.compile(r"\A\+\+\+\n(.*?)\n\+\+\+\n?(.*)\Z", re.S)
LINK_PATTERNS = [
    (re.compile(r"\{%\s*wiki\(\s*slug\s*=\s*\"([^\"]+)\""), "wiki"),
    (re.compile(r"\{%\s*(?:library|libref)\([^)]*?book\s*=\s*\"([^\"]+)\""), "library"),
    (re.compile(r"\]\(/(wiki|articles|timeline|news|library|datasets)/([a-z0-9-]+)/?(?:#[^)]*)?\)"), None),
]


def read_page(path: Path) -> tuple[dict, str] | None:
    m = FRONT.match(path.read_text(encoding="utf-8"))
    if not m:
        return None
    try:
        return tomllib.loads(m.group(1)), m.group(2)
    except tomllib.TOMLDecodeError as exc:
        print(f"  skip {path.relative_to(ROOT)}: {exc}", file=sys.stderr)
        return None


def norm(text: str) -> str:
    return " " + re.sub(r"[^\w'’-]+", " ", text.lower()).replace("’", "'") + " "


def first_sentence(text: str, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", re.sub(r"[*_`#>\[\]]", "", text or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    return cut[: cut.rfind(" ")] + "…"


def load_topics() -> dict:
    topics = tomllib.loads((DATA / "graph" / "topics.toml").read_text(encoding="utf-8"))
    for slug, t in topics.items():
        t["slug"] = slug
        t["terms"] = [norm(m).strip() for m in t.get("match", [])]
        for b in t.get("broader", []):
            if b not in topics:
                sys.exit(f"topics.toml: {slug} has unknown broader topic {b!r}")
    return topics


def match_topics(text: str, topics: dict) -> list[str]:
    hay = norm(text)
    found = []
    for slug, t in topics.items():
        if any(f" {term} " in hay for term in t["terms"] if term):
            found.append(slug)
    return found


def build(core_dir: Path | None) -> dict:
    topics = load_topics()
    catalog = json.loads((DATA / "library" / "catalog.json").read_text(encoding="utf-8"))
    books = {b["slug"]: b for b in catalog["books"]}
    # In-house translations (`genesis-woh`) inherit their base book's catalog entry
    # when they have none of their own.
    for path in (CONTENT / "library").glob("*-woh.md"):
        base = path.stem[: -len("-woh")]
        if path.stem not in books and base in books:
            books[path.stem] = books[base]
    trad_names = {t["id"]: t["name"].get("en", t["id"]) for t in catalog["traditions"]}

    nodes: dict[str, dict] = {}
    links: list[tuple[str, str, str]] = []
    page_text: dict[str, str] = {}
    page_topics: dict[str, set[str]] = collections.defaultdict(set)

    def pid(section: str, slug: str) -> str:
        return f"/{section}/{slug}/"

    # ---- pages ------------------------------------------------------------------
    for section, kind in SECTIONS.items():
        for path in sorted((CONTENT / section).glob("*.md")):
            if path.name.startswith("_"):
                continue
            parsed = read_page(path)
            if not parsed:
                continue
            fm, body = parsed
            if fm.get("draft"):
                continue
            extra = fm.get("extra", {})
            slug = fm.get("slug") or path.stem
            node_id = pid(section, slug)
            title = fm.get("title", slug)
            desc = extra.get("summary") or extra.get("tldr") or fm.get("description", "")
            meta_bits = []
            if kind == "book" and slug in books:
                b = books[slug]
                meta_bits = [trad_names.get(b["tradition"], b["tradition"]), str(b.get("publicationYear") or "").strip()]
                if b.get("author"):
                    meta_bits.insert(1, b["author"])
            elif kind == "wiki" and extra.get("category"):
                meta_bits = [extra["category"]]
            elif kind in ("article", "news") and fm.get("date"):
                meta_bits = [str(fm["date"])[:10]]
            elif kind == "timeline" and extra.get("start_year"):
                meta_bits = [f"{extra.get('start_year')} – {extra.get('end_year', '')}".strip(" –")]
            node = {
                "id": node_id,
                "kind": kind,
                "label": title,
                "url": node_id,
                "meta": " · ".join(m for m in meta_bits if m),
                "desc": first_sentence(desc),
            }
            if extra.get("claim_type"):
                node["claim"] = extra["claim_type"]
            nodes[node_id] = node
            match_text = " ".join(
                [title, desc, fm.get("description", ""), str(extra.get("category", "")), slug.replace("-", " ")]
                + list(extra.get("alternative_names", []) or [])
                + list(extra.get("keywords", []) or [])
            )
            if kind == "book" and slug in books:
                b = books[slug]
                match_text += " " + " ".join(str(b.get(k, "")) for k in ("author", "originalTitle", "collection"))
            page_text[node_id] = match_text
            # body links
            for pattern, sec in LINK_PATTERNS:
                for m in pattern.finditer(body):
                    target = pid(sec, m.group(1)) if sec else pid(m.group(1), m.group(2))
                    links.append((node_id, target, "links"))
            for item in extra.get("see_also", []) or []:
                p = (item.get("path") or "").strip("/")
                if p.count("/") == 1:
                    links.append((node_id, "/" + p + "/", "see_also"))
            for cid in extra.get("core_claim_ids", []) or []:
                links.append((node_id, f"claim:{cid}", "binds"))
            if kind == "book" and slug in books:
                topic = TRADITION_TOPIC.get(books[slug]["tradition"])
                if topic:
                    page_topics[node_id].add(topic)

    # ---- topics -----------------------------------------------------------------
    for slug, t in topics.items():
        node_id = f"topic:{slug}"
        page_id = pid("wiki", t["page"]) if t.get("page") else None
        nodes[node_id] = {
            "id": node_id,
            "kind": "topic",
            "group": t["kind"],
            "label": t["name"],
            "url": page_id if page_id in nodes else f"/graph/#{node_id}",
            "meta": t["kind"].capitalize(),
            "desc": t["description"],
        }
        for b in t.get("broader", []):
            links.append((node_id, f"topic:{b}", "broader"))
        if page_id in nodes:
            links.append((page_id, node_id, "defines"))
    for node_id, text in page_text.items():
        page_topics[node_id].update(match_topics(text, topics))
    for node_id, tset in page_topics.items():
        for t in tset:
            links.append((node_id, f"topic:{t}", "about"))

    # ---- timeline order ---------------------------------------------------------
    ages = sorted(
        (n for n in nodes.values() if n["kind"] == "timeline" and n["id"].startswith("/timeline/age-of-")),
        key=lambda n: n["id"],
    )
    order = ["leo", "cancer", "gemini", "taurus", "aries", "pisces", "aquarius",
             "capricorn", "sagittarius", "scorpio", "libra", "virgo"]
    by_sign = {n["id"].split("age-of-")[1].strip("/"): n["id"] for n in ages}
    seq = [by_sign[s] for s in order if s in by_sign]
    for a, b in zip(seq, seq[1:]):
        links.append((a, b, "precedes"))

    # ---- canon citations: Raëlian book → quoted scripture book --------------------
    cc_dir = DATA / "canon_citations"
    if cc_dir.exists():
        for f in sorted(cc_dir.glob("*.json")):
            src = pid("library", f.stem)
            cited = collections.Counter()
            for refs in json.loads(f.read_text(encoding="utf-8")).values():
                for _, href, _ in refs.get("en", []):
                    m = re.match(r"/library/([a-z0-9-]+)/", href)
                    if m:
                        cited[m.group(1)] += 1
            for slug in cited:
                links.append((src, pid("library", slug), "quotes"))

    # ---- core claims ------------------------------------------------------------
    if core_dir and (core_dir / "model" / "catalog.json").exists():
        catalog_c = json.loads((core_dir / "model" / "catalog.json").read_text(encoding="utf-8"))
        for c in catalog_c["claims"]:
            rec_path = core_dir / "model" / c["record"]
            rec = json.loads(rec_path.read_text(encoding="utf-8")) if rec_path.exists() else {}
            node_id = f"claim:{c['id']}"
            label = rec.get("public_label", "")
            nodes[node_id] = {
                "id": node_id,
                "kind": "claim",
                "label": c["title"],
                "url": CORE_URL.format(c["id"]),
                "meta": " · ".join(x for x in [c["id"], c.get("claim_kind", ""), label] if x),
                "desc": first_sentence(rec.get("statement", ""), 260),
            }
            if label:
                nodes[node_id]["claim"] = label
            for dep in rec.get("dependencies", []) or []:
                links.append((node_id, f"claim:{dep}", "depends_on"))
    else:
        print("  core repository not found — claims left out (pass --core)", file=sys.stderr)

    # ---- sources ----------------------------------------------------------------
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))["sources"]
    for s in sources:
        citing = [c["path"] for c in s.get("cited_by", []) if c.get("path") in nodes]
        if not citing:
            continue
        node_id = f"source:{s['id']}"
        authors = ", ".join(s.get("authored_by", [])[:2])
        nodes[node_id] = {
            "id": node_id,
            "kind": "source",
            "label": s["title"],
            "url": f"/sources/{s['id']}/",
            "meta": " · ".join(x for x in [authors, str(s.get("publish_date", ""))] if x),
            "desc": first_sentence(s.get("description", "")),
        }
        for p in citing:
            links.append((p, node_id, "cites"))
        for t in match_topics(" ; ".join(s.get("topics", [])), topics):
            links.append((node_id, f"topic:{t}", "about"))

    # ---- clean up -----------------------------------------------------------------
    seen = set()
    out_links = []
    dangling = collections.Counter()
    for a, b, ty in links:
        if a == b:
            continue
        if a not in nodes or b not in nodes:
            dangling[ty] += 1
            continue
        key = (min(a, b), max(a, b))
        if key in seen:
            continue
        seen.add(key)
        out_links.append([a, b, ty])
    degree = collections.Counter()
    for a, b, _ in out_links:
        degree[a] += 1
        degree[b] += 1
    out_nodes = [n for n in nodes.values() if degree[n["id"]] > 0]

    # ---- report -----------------------------------------------------------------
    kinds = collections.Counter(n["kind"] for n in out_nodes)
    types = collections.Counter(t for _, _, t in out_links)
    print(f"graph: {len(out_nodes)} nodes, {len(out_links)} links")
    print("  nodes:", ", ".join(f"{k} {v}" for k, v in kinds.most_common()))
    print("  links:", ", ".join(f"{k} {v}" for k, v in types.most_common()))
    if dangling:
        print("  dropped (target not in graph):", dict(dangling))
    unused = [s for s in topics if degree[f"topic:{s}"] <= len(topics[s].get("broader", []))]
    if unused:
        print("  topics nothing is filed under:", ", ".join(unused))
    untopiced = [n["id"] for n in out_nodes if n["kind"] in SECTIONS.values() and not page_topics.get(n["id"])]
    print(f"  pages with no topic: {len(untopiced)} of {sum(1 for n in out_nodes if n['kind'] in SECTIONS.values())}")
    if untopiced:
        print("   ", " ".join(untopiced[:40]), "…" if len(untopiced) > 40 else "")

    return {
        "schema": "wheelofheaven/graph@1",
        "description": "The Wheel of Heaven knowledge graph: pages, topics, core claims and cited sources, and the links between them. CC0.",
        "license": "https://creativecommons.org/publicdomain/zero/1.0/",
        "counts": {"nodes": len(out_nodes), "links": len(out_links), "kinds": dict(kinds), "link_types": dict(types)},
        "nodes": out_nodes,
        "links": out_links,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--core", type=Path, default=ROOT.parent / "core", help="path to the core repository")
    args = ap.parse_args()
    graph = build(args.core if args.core.exists() else None)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
