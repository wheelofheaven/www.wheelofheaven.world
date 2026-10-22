# Firmament Sans web fonts

The main website uses Firmament Sans 0.1 for Latin and Cyrillic body text.
Four static styles: Regular (400), Italic (400), Bold (700), Bold Italic (700).
Each contains 584 Unicode mappings, including 60 scholarly additions to full Jost.

- Source: [wheelofheaven/firmament-sans](https://github.com/wheelofheaven/firmament-sans), font build commit `1718e4d5f024951c770fc692244a2ef072693c71`.
- Build: `scholar/scripts/build.py`; verify with `mise run check` in the font repository.
- Original Jost design: Owen Earl / indestructible type and the Jost Project Authors.
- Scholarly extension: Wheel of Heaven contributors.
- License: SIL Open Font License 1.1, preserved in `OFL.txt`.
- Checksums of the exact deployed WOFF2 files: `SHA256SUMS`.
- Specimen and current limitations: https://firmament.wheelofheaven.world/.

The `0.1/` directory is versioned because the CDN caches fonts as immutable.
Publish future font builds under a new version path and update Bifrost's CSS,
regular-face preload, and the website's service-worker precache together.
CSS omits `local()` so installed versions cannot shadow the deployed release.
Older Jost files remain available for cached stylesheets.

The pilot is still undergoing optical refinement. It retains Jost's Latin and
Cyrillic outlines and adds scholarly Latin forms; it does not add Hebrew,
Greek, Arabic, cuneiform, or CJK glyphs. Existing companion fonts retain their roles.
