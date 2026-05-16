#!/bin/sh
# Verify the .io → .world domain migration in build output.
# Allowed exceptions: GitHub repo URLs (repo names are not being renamed).
#
# Usage:
#   scripts/check-domain-migration.sh                # checks www.wheelofheaven.io/public
#   scripts/check-domain-migration.sh <dir>          # checks <dir>
#
# Exit code 0 if clean (only GitHub URLs reference .io); non-zero otherwise.
set -eu

DIR="${1:-public}"

if [ ! -d "$DIR" ]; then
    printf 'check-domain-migration: directory not found: %s\n' "$DIR" >&2
    exit 2
fi

printf 'Auditing %s for wheelofheaven.io references...\n' "$DIR"

# Find any .io references. Allowed exceptions:
#  - GitHub repo URLs: github.com/wheelofheaven/{,www.,api.,assets.}wheelofheaven.io
#    These appear in plain form and HTML-entity-encoded form (&#x2F;).
unexpected=$(grep -rI "wheelofheaven\.io" "$DIR" 2>/dev/null \
    | grep -v 'github\.com/wheelofheaven' \
    | grep -v 'github\.com&#x2F;wheelofheaven' \
    | grep -v 'github.com\\u002Fwheelofheaven' \
    || true)

if [ -n "$unexpected" ]; then
    echo "FAIL: unexpected .io references found:" >&2
    echo "$unexpected" | head -50 >&2
    n=$(printf '%s\n' "$unexpected" | wc -l | tr -d ' ')
    printf '...total: %s line(s)\n' "$n" >&2
    exit 1
fi

# Sitemap must reference .world.
sitemap="$DIR/sitemap.xml"
if [ -f "$sitemap" ]; then
    if ! grep -q 'wheelofheaven\.world' "$sitemap"; then
        echo "FAIL: sitemap.xml missing .world URLs" >&2
        exit 1
    fi
    if grep -q 'wheelofheaven\.io' "$sitemap"; then
        echo "FAIL: sitemap.xml still contains .io URLs" >&2
        exit 1
    fi
    printf 'OK: sitemap.xml uses .world only.\n'
fi

# Robots must point at .world sitemap.
robots="$DIR/robots.txt"
if [ -f "$robots" ]; then
    if ! grep -qE '^Sitemap:.*wheelofheaven\.world/' "$robots"; then
        echo "FAIL: robots.txt sitemap directive not on .world" >&2
        exit 1
    fi
    printf 'OK: robots.txt sitemap points at .world.\n'
fi

# Homepage canonical must be .world.
homepage="$DIR/index.html"
if [ -f "$homepage" ]; then
    if ! grep -q '<link rel="canonical" href="https://www\.wheelofheaven\.world' "$homepage"; then
        echo "FAIL: homepage canonical is not .world" >&2
        exit 1
    fi
    printf 'OK: homepage canonical is .world.\n'
fi

printf '\nAll checks passed. Only GitHub repo URLs reference .io (expected).\n'
