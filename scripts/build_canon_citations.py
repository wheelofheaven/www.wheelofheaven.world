#!/usr/bin/env python3
"""Link the Bible citations in the three Raëlian canon books to the
Wheel of Heaven translations of the cited verses.

The canon books cite scripture inline as parentheticals, e.g.
"(Genèse, I-1)" / "(Exodus, III-2)" / "（出エジプト記 III-2）". The French
original is parsed for book, chapter and first verse; each translated
language is aligned to it by position (the k-th citation parenthetical in
the translation is the k-th in the French). A link is emitted only when
the cited verse exists in a translated woh book.

Writes data/canon_citations/{book-slug}.json:
    {refId: {lang: [[raw_citation_text, href, title], ...]}}
which library-book.html loads to wrap each citation in a quiet link.
Run after data/library changes; commit the output (CF Pages runs zola only).
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "data" / "library"
OUT = ROOT / "data" / "canon_citations"
CANON = ["the-book-which-tells-the-truth", "extraterrestrials-took-me-to-their-planet",
         "lets-welcome-the-extraterrestrials"]
LANGS = ["fr", "en", "de", "es", "ru", "ja", "ko", "zh", "zh-Hant", "he"]

# French book names as printed in the canon -> (woh slug, English name)
BOOKS = {
    "genèse": ("genesis-woh", "Genesis"), "exode": ("exodus-woh", "Exodus"),
    "nombres": ("numbers-woh", "Numbers"), "deutéronome": ("deuteronomy-woh", "Deuteronomy"),
    "josué": ("joshua-woh", "Joshua"), "juges": ("judges-woh", "Judges"),
    "i samuel": ("1-samuel-woh", "1 Samuel"), "i rois": ("1-kings-woh", "1 Kings"),
    "ii rois": ("2-kings-woh", "2 Kings"),
    "job": ("job-woh", "Job"),
    # TBWTT-3:115 "(Rois, XVII-24)" is the widow's son, 1 Kings 17
    "rois": ("1-kings-woh", "1 Kings"),
    "le livre de job": ("job-woh", "Job"), "livre de job": ("job-woh", "Job"),
    "psaumes": ("psalms-woh", "Psalm"), "proverbes": ("proverbs-woh", "Proverbs"),
    "l’ecclésiaste": ("ecclesiastes-woh", "Ecclesiastes"), "l'ecclésiaste": ("ecclesiastes-woh", "Ecclesiastes"),
    "isaïe": ("isaiah-woh", "Isaiah"), "jérémie": ("jeremiah-woh", "Jeremiah"),
    "ezéchiel": ("ezekiel-woh", "Ezekiel"), "ézéchiel": ("ezekiel-woh", "Ezekiel"),
    "daniel": ("daniel-woh", "Daniel"), "amos": ("amos-woh", "Amos"), "jonas": ("jonah-woh", "Jonah"),
    "sophonie": ("zephaniah-woh", "Zephaniah"), "zacharie": ("zechariah-woh", "Zechariah"),
    "sagesse de salomon": ("wisdom-of-solomon-woh", "Wisdom of Solomon"),
    "la sagesse de salomon": ("wisdom-of-solomon-woh", "Wisdom of Solomon"),
    "matthieu": ("matthew-woh", "Matthew"), "mathieu": ("matthew-woh", "Matthew"),
    "d’après matthieu": ("matthew-woh", "Matthew"), "marc": ("mark-woh", "Mark"),
    "d’après luc": ("luke-woh", "Luke"), "actes des apôtres": ("acts-woh", "Acts"),
    "apocalypse": ("revelation-woh", "Revelation"), "apocalypse de jean": ("revelation-woh", "Revelation"),
}
# Known misprints in the canon: (refId, chapter as printed) -> chapter meant
CHAPTER_FIXES = {("ETTMTTP-2:72", 27): 37}  # "Ezéchiel XXVII" is Ezekiel 37 (dry bones)

# A citation parenthetical: ASCII or full-width brackets around a short
# string carrying a Roman numeral (all scripts but Hebrew) or a Hebrew
# letter-numeral with geresh (he).
CITE = re.compile(r"[(（]([^()（）]{1,60}?(?:\b[IVXLC]+\b|[\u05d0-\u05ea]{1,2}(?:\u05f4[\u05d0-\u05ea]|[\u05f3'])|[IVXLC]+(?=[-,\s]))[^()（）]{0,60}?)[)）]")
# The English edition of Let's Welcome the Extra-Terrestrials prints its
# citations as "Matthew 13: 5-9." (Arabic numerals, no brackets).
CITE_EN = re.compile(r"(?<![\w’'])((?:[1-3] )?[A-Z][a-z]+(?: [A-Z][a-z]+){0,2} \d{1,3}: ?\d{1,3}(?:[-–]\d{1,3})?)")
EN_BOOKS = {"genesis": "genesis-woh", "exodus": "exodus-woh", "numbers": "numbers-woh",
    "deuteronomy": "deuteronomy-woh", "joshua": "joshua-woh", "judges": "judges-woh",
    "job": "job-woh", "psalms": "psalms-woh", "psalm": "psalms-woh", "proverbs": "proverbs-woh",
    "ecclesiastes": "ecclesiastes-woh", "isaiah": "isaiah-woh", "jeremiah": "jeremiah-woh",
    "ezekiel": "ezekiel-woh", "daniel": "daniel-woh", "amos": "amos-woh", "jonah": "jonah-woh",
    "zephaniah": "zephaniah-woh", "zechariah": "zechariah-woh", "matthew": "matthew-woh",
    "mark": "mark-woh", "luke": "luke-woh", "acts": "acts-woh", "revelation": "revelation-woh"}
EN_PARSE = re.compile(r"^(.+?) (\d{1,3}): ?(\d{1,3})")

def target_en(raw):
    """English-edition citations ("Matthew 13: 5-9") are parsed from their
    own text: that edition sometimes cites a different verse range."""
    m = EN_PARSE.match(raw)
    if not m or m.group(1).lower() not in EN_BOOKS:
        return None
    slug = EN_BOOKS[m.group(1).lower()]
    ch, v = int(m.group(2)), int(m.group(3))
    if (ch, v) not in verses(slug):
        return None
    name = "Psalm" if slug == "psalms-woh" else m.group(1)
    return (f"/library/{slug}/#c{ch}p{v}", f"{name} {ch}:{v} — Wheel of Heaven translation")

FR = re.compile(r"^(?:en\s+)?(.+?)[,\s]+([IVXLC]+)\s*[-,]?\s*(\d+)")
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

def roman(s):
    total = 0
    for i, c in enumerate(s):
        v = ROMAN[c]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total

def verses(slug, cache={}):
    if slug not in cache:
        meta = LIB / slug / "_meta.json"
        have = set()
        if meta.exists():
            for ch in json.loads(meta.read_text())["chapterFiles"]:
                d = json.loads((LIB / slug / ch["file"]).read_text())
                for p in d.get("paragraphs", []):
                    have.add((d["n"], p["n"]))
        cache[slug] = have
    return cache[slug]

def target(raw, ref_id):
    m = FR.match(raw.strip())
    if not m:
        return None
    name = m.group(1).strip().lower()
    if name not in BOOKS:
        return None
    slug, en = BOOKS[name]
    ch = roman(m.group(2))
    ch = CHAPTER_FIXES.get((ref_id, ch), ch)
    v = int(m.group(3))
    if (ch, v) not in verses(slug):
        return None
    return (f"/library/{slug}/#c{ch}p{v}", f"{en} {ch}:{v} — Wheel of Heaven translation")

CONTENT = ROOT / "content"

def localize(href, lang):
    """Point at the reader's language version of the woh page when one
    exists (e.g. /de/library/genesis-woh/), else at the English page."""
    slug = href.split("/")[2]
    if lang != "en" and (CONTENT / lang / "library" / f"{slug}.md").exists():
        return f"/{lang}{href}"
    return href

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stats = {}
    for book in CANON:
        out, linked, cites, skipped = {}, 0, 0, 0
        meta = json.loads((LIB / book / "_meta.json").read_text())
        for ch in meta["chapterFiles"]:
            d = json.loads((LIB / book / ch["file"]).read_text())
            for p in d.get("paragraphs", []):
                fr = p.get("text") or ""
                fr_cites = [m.group(1) for m in CITE.finditer(fr)]
                if not fr_cites:
                    continue
                targets = [target(c, p["refId"]) for c in fr_cites]
                cites += len(fr_cites)
                if not any(targets):
                    continue
                texts = {l: (p.get("i18n") or {}).get(l) for l in LANGS}
                texts["fr"] = (p.get("i18n") or {}).get("fr") or fr
                entry = {}
                for lang, t in texts.items():
                    if not t:
                        continue
                    ms = list(CITE.finditer(t))
                    if lang != "fr":
                        ms += list(CITE_EN.finditer(t))
                    ms = sorted(ms, key=lambda m: m.start())
                    found = [m.group(0) for m in ms]
                    if len(found) != len(fr_cites):
                        skipped += 1
                        continue
                    tgs = [target_en(m.group(0)) if m.re is CITE_EN else tg for m, tg in zip(ms, targets)]
                    links = [[raw, localize(tg[0], lang), tg[1]] for raw, tg in zip(found, tgs) if tg]
                    # a raw string must be unique in the paragraph for a safe replace
                    links = [l for l in links if t.count(l[0]) == 1]
                    if links:
                        entry[lang] = links
                        if lang == "fr":
                            linked += len(links)
                if entry:
                    out[p["refId"]] = entry
        (OUT / f"{book}.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        stats[book] = dict(citations=cites, linked_fr=linked, lang_misaligned=skipped)
    print(json.dumps(stats, indent=2))

if __name__ == "__main__":
    main()
