#!/usr/bin/env python3
"""Write translation-status metadata into every translated content page.

For each translated page under content/{lang}/{wiki,articles,timeline,news,datasets}/
whose English source exists, set in [extra]:

  translation_status   kept if already set; otherwise "ai_reviewed"
  translation_updated  date (YYYY-MM-DD) of the translation's last real change
  source_updated       date of the English page's last real change
  translation_stale    true when the English changed after the translation
  translation_sync     structural parity with the English, 0–100: the share of the
                       English page's shortcodes (wiki/libref/library/claim/cite/
                       footnote/figure) and headings that the translation carries.
                       Measures structure, not prose.

"Real change" = the newest commit whose diff for that file touches anything other
than bookkeeping fields (core_* bindings, translation_* fields, editorial_pass).
Dates come from `git log` in the content repository.

Usage: python3 scripts/translation_audit.py [--content content] [--dry-run]
Re-run after every translation pass and commit the result.
"""
from __future__ import annotations

import argparse
import collections
import re
import subprocess
import sys
import tomllib
from pathlib import Path

LANGS = ("de", "es", "fr", "ja", "ko", "ru", "zh", "zh-Hant", "he")
SECTIONS = ("wiki", "articles", "timeline", "news", "datasets")
FIELDS = ("translation_status", "translation_updated", "source_updated",
          "translation_stale", "translation_sync")
BOOKKEEPING = re.compile(
    r"^[+-]\s*(core_versions|core_claim_ids|translation_status|translation_updated|"
    r"source_updated|translation_stale|translation_sync|editorial_pass)\s*=")
SC = re.compile(r"\{%\s*(wiki|libref|library|claim)\(([^)]*)\)\s*%\}"
                r"|\{\{\s*(cite|footnote|figure)\(([^)]*)\)\s*\}\}")
FM = re.compile(r"\A(\s*\+\+\+\s*\n)(.*?)(\n\+\+\+\s*\n)", re.S)


def last_real_change(repo: Path, paths: set[str]) -> dict[str, str]:
    """Newest non-bookkeeping commit date per path, in one streaming git log."""
    found: dict[str, str] = {}
    cmd = ["git", "-C", str(repo), "log", "--no-renames", "-p", "-U0",
           "--format=@@COMMIT %as", "--", *SECTIONS, *(f"{l}/{s}" for l in LANGS for s in SECTIONS)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True, errors="replace")
    date = None
    cur = None
    real = False

    def flush():
        if cur and cur in paths and cur not in found and real:
            found[cur] = date

    for line in proc.stdout:
        if line.startswith("@@COMMIT "):
            flush(); cur = None; real = False
            date = line.split()[1]
        elif line.startswith("diff --git "):
            flush()
            m = re.match(r"diff --git a/(.+?) b/(.+)$", line.rstrip("\n"))
            cur = m.group(2) if m else None
            real = False
        elif cur and (line.startswith("+") or line.startswith("-")) and not line.startswith(("+++", "---")):
            body = line.rstrip("\n")
            if body[1:].strip() and not BOOKKEEPING.match(body):
                real = True
    flush()
    proc.wait()
    return found


def split(text: str):
    m = FM.match(text)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3), text[m.end():]


def structure(body: str) -> collections.Counter:
    c = collections.Counter()
    for m in SC.finditer(body):
        name = m.group(1) or m.group(3)
        args = re.sub(r"\s", "", m.group(2) or m.group(4) or "")
        key = re.search(r'(slug|id|src|book)="([^"]+)"', args)
        c[(name, key.group(2) if key else args)] += 1
    c[("heading",)] = len(re.findall(r"^#{2,6}\s", body, re.M))
    return c


def parity(en: collections.Counter, tr: collections.Counter) -> int:
    total = sum(en.values())
    if not total:
        return 100
    return round(100 * sum((en & tr).values()) / total)


def set_extra(fm: str, values: dict) -> str:
    lines = fm.split("\n")
    lines = [l for l in lines if not re.match(rf"^({'|'.join(FIELDS)})\s*=", l)]
    new = []
    for k, v in values.items():
        if isinstance(v, bool):
            new.append(f"{k} = {'true' if v else 'false'}")
        elif isinstance(v, int):
            new.append(f"{k} = {v}")
        else:
            new.append(f'{k} = "{v}"')
    if "[extra]" in lines:
        i = lines.index("[extra]") + 1
        return "\n".join(lines[:i] + new + lines[i:])
    j = next((k for k, l in enumerate(lines) if l.startswith("[extra.") or l.startswith("[[extra.")), len(lines))
    return "\n".join(lines[:j] + ["", "[extra]"] + new + lines[j:])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--content", default="content")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    root = Path(a.content)

    pairs = []
    for sec in SECTIONS:
        for en in sorted((root / sec).glob("*.md")):
            if en.name.startswith("_"):
                continue
            for lang in LANGS:
                tr = root / lang / sec / en.name
                if tr.exists():
                    pairs.append((en, tr))
    rel = lambda p: str(p.relative_to(root))
    dates = last_real_change(root, {rel(p) for pair in pairs for p in pair})

    stats = collections.Counter()
    for en, tr in pairs:
        etext, ttext = en.read_text(encoding="utf-8"), tr.read_text(encoding="utf-8")
        es, ts = split(etext), split(ttext)
        if not es or not ts:
            stats["skipped-no-frontmatter"] += 1
            continue
        try:
            tfm = tomllib.loads(ts[1])
        except tomllib.TOMLDecodeError:
            stats["skipped-bad-toml"] += 1
            continue
        status = tfm.get("extra", {}).get("translation_status") or "ai_reviewed"
        t_upd, s_upd = dates.get(rel(tr), ""), dates.get(rel(en), "")
        values = {
            "translation_status": status,
            "translation_updated": t_upd,
            "source_updated": s_upd,
            "translation_stale": bool(t_upd and s_upd and s_upd > t_upd),
            "translation_sync": parity(structure(es[3]), structure(ts[3])),
        }
        newfm = set_extra(ts[1], values)
        tomllib.loads(newfm)  # must still parse
        out = ts[0] + newfm + ts[2] + ts[3]
        stats[status] += 1
        stats["stale"] += values["translation_stale"]
        if out != ttext:
            stats["changed"] += 1
            if not a.dry_run:
                tr.write_text(out, encoding="utf-8")
    print(dict(stats), file=sys.stderr)


if __name__ == "__main__":
    main()
