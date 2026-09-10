#!/usr/bin/env python3
"""Generate data/relatedness.json — precomputed geometry for the wiki
mini-graph (templates/macros/relatedness-graph.html).

The figure shows a scoped view of the content graph: the current entry at the
centre, the entries it links to around it, and one further ring of context —
the neighbours' own neighbours — so the shape says something about where the
entry sits rather than being a hub with spokes.

Why this is precomputed
-----------------------
The positions come from a force simulation, and Tera has neither loops with
mutable float state nor trigonometry, so the template cannot produce them. The
output is therefore drawable primitives — line segments and points already in
viewBox coordinates — and the macro only has to loop and emit SVG.

Precomputing also removes the section scan the macro previously used to find
edges between neighbours, which cost roughly 10s of CPU on a wiki-heavy build.

The graph is re-derived here from content rather than fetched from
api.wheelofheaven.world/v1/graph/, so the build stays offline and reproducible.
It mirrors the derivation in the api repo's scripts/prebuild.py: curated
see_also / canon_links edges plus prose cross-links.
"""

from __future__ import annotations

import json
import math
import re
import tomllib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "data" / "relatedness.json"

SECTIONS = ("wiki", "articles", "timeline", "news")
LOCALES = {"de", "es", "fr", "he", "ja", "ko", "ru", "zh", "zh-Hant"}

MAX_FIRST = 8      # labelled ring; matches what the macro renders
MAX_SECOND = 10    # unlabelled context ring
VIEW_W, VIEW_H = 480, 340
PAD_X, PAD_Y = 54, 26
R1, R2 = 78, 64    # target radius of the first and second rings
ITERATIONS = 520

# Edge kinds, as consumed by the macro's CSS classes.
SPOKE, CHORD, OUTER = 0, 1, 2


# --- deterministic RNG (same pair used by static/js/map-graph.js) -----------

def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


# --- graph -----------------------------------------------------------------

def canonical(path: str) -> str:
    """"/de/wiki/eden/" and "wiki/eden" both become "wiki/eden"."""
    key = path.strip().strip("/")
    parts = key.split("/")
    if parts and parts[0] in LOCALES:
        parts = parts[1:]
    return "/".join(parts)


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


def body(md: Path) -> str:
    text = md.read_text(encoding="utf-8", errors="replace")
    end = text.find("+++", 3)
    return text[end + 3:] if text.startswith("+++") and end > 0 else text


LINK_RE = re.compile(r"\]\(/((?:" + "|".join(SECTIONS) + r")/[a-z0-9\-]+)/?\)")
WIKI_SHORTCODE_RE = re.compile(r"\{%-?\s*wiki\(\s*slug\s*=\s*\"([a-z0-9\-]+)\"")


def load_graph() -> tuple[dict[str, list[str]], set[tuple[str, str]]]:
    """Returns (curated see_also per node, all undirected edges)."""
    # Key on the page's URL, not its filename. The macro looks these up by
    # page.path, and a frontmatter `slug` can make the two differ — as it does
    # for wiki/council-of-eternals.md, which publishes at
    # /wiki/council-of-the-eternals/. Keying by filename silently loses the
    # figure on any such page.
    nodes: dict[str, Path] = {}
    for section in SECTIONS:
        for md in (CONTENT / section).glob("*.md"):
            if md.name == "_index.md":
                continue
            fm = frontmatter(md)
            slug = fm.get("slug") or md.stem
            nodes[f"{section}/{slug}"] = md

    curated: dict[str, list[str]] = {}
    edges: set[tuple[str, str]] = set()

    for nid, md in sorted(nodes.items()):
        extra = frontmatter(md).get("extra", {}) or {}
        # Frontmatter order is preserved: the macro renders see_also in that
        # order, so the layout has to agree on which eight are the first ring.
        targets = []
        for item in list(extra.get("see_also") or []) + list(extra.get("canon_links") or []):
            path = item.get("path") if isinstance(item, dict) else None
            if not path:
                continue
            key = canonical(path)
            if key in nodes and key != nid and key not in targets:
                targets.append(key)
        curated[nid] = targets
        for t in targets:
            edges.add(tuple(sorted((nid, t))))

        text = body(md)
        for m in LINK_RE.finditer(text):
            key = canonical(m.group(1))
            if key in nodes and key != nid:
                edges.add(tuple(sorted((nid, key))))
        for m in WIKI_SHORTCODE_RE.finditer(text):
            key = f"wiki/{m.group(1)}"
            if key in nodes and key != nid:
                edges.add(tuple(sorted((nid, key))))

    return curated, edges


# --- layout ----------------------------------------------------------------

def simulate(ids: list[str], n_first: int, linked) -> list[tuple[float, float]]:
    n = len(ids)
    xs, ys = [0.0] * n, [0.0] * n
    for i, nid in enumerate(ids):
        if i == 0:
            continue
        rand = mulberry32(fnv1a(nid))
        angle = rand() * math.tau
        ring = R1 if i <= n_first else R1 + R2
        xs[i], ys[i] = math.cos(angle) * ring, math.sin(angle) * ring

    for it in range(ITERATIONS):
        temp = 1 - it / ITERATIONS
        dxs, dys = [0.0] * n, [0.0] * n

        for i in range(n):
            for j in range(i + 1, n):
                dx, dy = xs[i] - xs[j], ys[i] - ys[j]
                d2 = dx * dx + dy * dy or 1.0
                d = math.sqrt(d2)
                f = 5200 / d2
                fx, fy = dx / d * f, dy / d * f
                dxs[i] += fx; dys[i] += fy
                dxs[j] -= fx; dys[j] -= fy

        for i in range(n):
            for j in range(i + 1, n):
                if i == 0 and j <= n_first:
                    rest = R1
                elif linked(ids[i], ids[j]):
                    rest = R1 * 0.85 if j <= n_first else R2
                else:
                    continue
                dx, dy = xs[j] - xs[i], ys[j] - ys[i]
                d = math.hypot(dx, dy) or 1.0
                f = (d - rest) * 0.05
                fx, fy = dx / d * f, dy / d * f
                dxs[i] += fx; dys[i] += fy
                dxs[j] -= fx; dys[j] -= fy

        for i in range(n):
            dxs[i] -= xs[i] * 0.012
            dys[i] -= ys[i] * 0.012
            if i:
                # Radial band per degree: hold each ring at its own distance
                # from the subject, leaving the angle to the other forces.
                # Without it a densely interlinked first ring collapses into a
                # clump on one side of the centre.
                d = math.hypot(xs[i], ys[i]) or 1.0
                target = R1 if i <= n_first else R1 + R2
                f = (d - target) * (0.09 if i <= n_first else 0.045)
                dxs[i] -= xs[i] / d * f
                dys[i] -= ys[i] / d * f
            step = math.hypot(dxs[i], dys[i])
            cap = 3 + 14 * temp
            if step > cap:
                dxs[i] *= cap / step
                dys[i] *= cap / step
            xs[i] += dxs[i]
            ys[i] += dys[i]

        # Keep the subject at the origin so it lands dead centre in the frame.
        cx, cy = xs[0], ys[0]
        for i in range(n):
            xs[i] -= cx
            ys[i] -= cy

    # Scale each axis on a trimmed extent so the neighbourhood fills the frame
    # rather than sitting in a disc; clamp outliers onto the edge instead of
    # letting one distant node shrink the readable core.
    lim_x, lim_y = VIEW_W / 2 - PAD_X, VIEW_H / 2 - PAD_Y
    ax = sorted(abs(x) for x in xs)
    ay = sorted(abs(y) for y in ys)
    rx = ax[int(len(ax) * 0.88)] or ax[-1] or 1
    ry = ay[int(len(ay) * 0.88)] or ay[-1] or 1
    return [
        (
            round(max(-lim_x, min(lim_x, x * lim_x / rx)) + VIEW_W / 2, 1),
            round(max(-lim_y, min(lim_y, y * lim_y / ry)) + VIEW_H / 2, 1),
        )
        for x, y in zip(xs, ys)
    ]


def main() -> None:
    curated, edges = load_graph()
    adjacency: dict[str, set[str]] = defaultdict(set)
    for a, b in edges:
        adjacency[a].add(b)
        adjacency[b].add(a)

    def linked(a: str, b: str) -> bool:
        return tuple(sorted((a, b))) in edges

    out: dict[str, dict] = {}
    for nid, first_all in curated.items():
        first = first_all[:MAX_FIRST]
        if not first:
            continue

        # Second ring: neighbours of the first ring, ranked by how much of that
        # ring they touch, so the context shown is connective tissue rather
        # than arbitrary leaves.
        seen = set(first) | {nid}
        weight: dict[str, int] = defaultdict(int)
        for f in first:
            for m in adjacency[f]:
                if m not in seen:
                    weight[m] += 1
        second = [m for m, _ in sorted(weight.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_SECOND]]

        ids = [nid] + first + second
        pts = simulate(ids, len(first), linked)

        segments = []
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                if i == 0 and j <= len(first):
                    kind = SPOKE
                elif not linked(ids[i], ids[j]):
                    continue
                else:
                    kind = OUTER if j > len(first) else CHORD
                segments.append([pts[i][0], pts[i][1], pts[j][0], pts[j][1], kind])

        out[nid] = {
            "c": list(pts[0]),
            "n": {k: list(pts[1 + i]) for i, k in enumerate(first)},
            "s": [list(pts[1 + len(first) + i]) for i in range(len(second))],
            "e": segments,
        }

    OUT.write_text(json.dumps(out, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    n_seg = sum(len(v["e"]) for v in out.values())
    print(f"data/relatedness.json: {len(out)} neighbourhoods, {n_seg} segments, "
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
