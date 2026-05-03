#!/usr/bin/env bash
# Build the narrative map artifact served at /map/.
#
# Source:    assets/map/narrative-map.svg   (Inkscape-editable, text intact)
# Artifact:  static/map/narrative-map.svg   (text → outlined paths, no font deps)
#
# The artifact is what the website serves. Visitor browsers don't have access
# to the project's fonts (IBM Plex Sans Hebrew/JP, Noto Sans Cuneiform/Symbols 2,
# DAGGERSQUARE, Jurassic Park, Torchzilla, Jost), so all text is converted to
# embedded SVG paths at build time. This makes the map render identically in
# every browser and removes any font-licensing concern in the served file.
#
# Edit the source SVG (assets/map/narrative-map.svg) in Inkscape, then re-run
# this script and commit both files.
#
# Usage:
#   scripts/build-map.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${REPO_ROOT}/assets/map/narrative-map.svg"
OUT="${REPO_ROOT}/static/map/narrative-map.svg"

if ! command -v inkscape >/dev/null 2>&1; then
    echo "ERROR: inkscape not found. Install with: brew install --cask inkscape" >&2
    exit 1
fi

if [[ ! -f "${SRC}" ]]; then
    echo "ERROR: source SVG not found at ${SRC}" >&2
    exit 1
fi

mkdir -p "$(dirname "${OUT}")"

echo "Building narrative map: ${SRC} → ${OUT}"
inkscape \
    --export-text-to-path \
    --export-plain-svg \
    --export-filename="${OUT}" \
    "${SRC}"

src_size=$(wc -c < "${SRC}")
out_size=$(wc -c < "${OUT}")
echo "Source:   ${src_size} bytes (text intact)"
echo "Artifact: ${out_size} bytes (text → paths)"
