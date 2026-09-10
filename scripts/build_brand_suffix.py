#!/usr/bin/env python3
"""Set a brandmark suffix word in Torchzilla and emit SVG outline data.

The map poster's title reads "WHEEL OF HEAVEN *Map*", where the suffix is the
word "Map" set in Torchzilla — a local display face, not a webfont. Inkscape
converted it to a path when the poster was drawn, which is why it ships as
outline data in partials/brand/map-title.html rather than as a <text> element.

The graph view's title needs the same treatment so "Graph" matches "Map"
instead of falling back to an italic of the body face. This regenerates that
path from the installed font.

Metrics come from the Inkscape master (static/map/narrative-map.svg), where the
original <text> element's style survives the conversion:

    font-size:80px; font-family:Torchzilla;
    -inkscape-font-specification:Torchzilla; letter-spacing:0.5px

Usage:  python3 scripts/build_brand_suffix.py [word]     (default: Graph)

Prints the path data. Paste it into the relevant partial — this deliberately
does not rewrite templates, since placement is a design decision per brandmark.
Requires Torchzilla installed locally (~/Library/Fonts/torchzilla-regular.ttf);
the font is licensed from Invasi Studio and is not vendored in this repo.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.misc.transform import Identity  # noqa: F401  (documents intent)
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = Path.home() / "Library" / "Fonts" / "torchzilla-regular.ttf"
FONT_SIZE = 80.0
LETTER_SPACING = 0.5


def outline(word: str) -> tuple[str, float]:
    if not FONT.exists():
        raise SystemExit(
            f"{FONT} not found. Torchzilla is a local display face (Invasi Studio) "
            "and is not vendored in this repo — install it before regenerating."
        )
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    scale = FONT_SIZE / font["head"].unitsPerEm

    pen = SVGPathPen(glyphs)
    x = 0.0
    for ch in word:
        if ord(ch) not in cmap:
            raise SystemExit(f"Torchzilla has no glyph for {ch!r}")
        name = cmap[ord(ch)]
        # Negative y-scale: font space is Y-up, SVG is Y-down. The baseline
        # ends up at y=0 so the caller positions with a plain translate().
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        x += hmtx[name][0] * scale + LETTER_SPACING

    return pen.getCommands(), x


def main() -> None:
    word = sys.argv[1] if len(sys.argv) > 1 else "Graph"
    d, width = outline(word)
    print(f"<!-- {word}: {width:.1f}px wide at {FONT_SIZE:g}px -->", file=sys.stderr)
    print(d)


if __name__ == "__main__":
    main()
