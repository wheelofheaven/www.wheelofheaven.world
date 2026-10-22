# Jost web fonts

`jost-full-*.woff2` restores the full upstream Latin Extended and Cyrillic coverage.
Regular (400), bold (700), italic (400), and bold italic (700) are static instances of the upstream variable fonts.
Each file contains 524 mapped codepoints, compared with 297 in the previous regular web font.
These are upstream Jost, not the experimental Firmament Sans extension.

- Designer: Owen Earl / indestructible type.
- License: included `OFL.txt`; preserve it when redistributing the fonts.
- Google Fonts source: `ofl/jost`, commit `6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da`.
- Rebuild and checksums: [Firmament Sans](https://github.com/wheelofheaven/firmament-sans), `scholar/scripts/build.py` and `scholar/upstream/manifest.json`.

The CSS deliberately omits `local()` so an older installed font cannot shadow this coverage.
The old `jost-v19-*` files remain available for cached stylesheets.
