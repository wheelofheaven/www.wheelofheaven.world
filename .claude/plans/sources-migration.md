# Sources Migration: `/resources/` → `/sources/` with structured-data backbone

## Why

The current `/resources/` section is 67 hand-written markdown stubs that act as a
bibliography but are wrong for the job:

- **Zero wiki entries link to `/resources/`** — they aren't load-bearing for citations
- **Schema lives 67 times** — every entry hand-duplicates the same source-program
  fields (`authority_tier`, `source_family`, `relation_to_wheel`, `stance`, etc.)
- **Markdown is for writing; bibliography entries are records** — terse, mostly
  identical shape, queried both ways (entries→sources, sources→entries)
- **Overlaps with `data-library/`** — digitized texts also live there; only 2 of
  the 67 stubs declare a `library_slug` today, so the link is mostly imaginary
- **No build-time validation** — nothing catches a typo'd citation today

The fix is to make the source-program metadata a first-class data layer, render
public surfaces from it, and wire wiki citations through stable IDs.

## Locked decisions

| # | Decision |
|---|---|
| 1 | Manifest lives in a new **`data-bibliography`** repo, mounted as a submodule at `data/sources/` — parallels `data-library` |
| 2 | **Per-source JSON files** (one per source) + a generated `index.json` |
| 3 | Public URL is **`/sources/`** — matches schema vocabulary and the existing `sources-section.html` template name. `/resources/*` is preserved via Cloudflare 301s |
| 4 | **Bidirectional library ↔ source cross-link** — `data-library` book records get `source_id`, `data-bibliography` records get `library_slug` |
| 5 | Schema audit completed (see below) — locks the canonical record shape |

## Schema audit summary (67 entries)

**Fields present on all 67:** `title`, `description`, `slug`, `authored_by`,
`medium`, `topics`, `source_family`, `source_type`, `authority_tier`,
`relation_to_wheel`, `stance`, `licensing_status`, `claim_type` (always `direct`).

**Mostly present:** `publish_date` (66), `follow_url` (60).

**Sparse:** `original_title` (18), `draft` (9), `library_slug` (2).

**Schema cleanups to make during migration:**

- Drop `claim_type` from source records — 100% are `direct`, and "claim type"
  is a property of *claims*, not source descriptions
- Consolidate `medium` and `source_type` — they overlap (e.g. `medium =
  "nonfiction-book"` vs `source_type = "academic_monograph"`). Keep
  `source_type` (more precise, enum is bibliographically established),
  drop `medium`
- Consolidate `authority_tier` and `relation_to_wheel` — enum values are
  nearly identical (`supplementary`/`primary` vs `supplementary`/
  `comparative_primary`). `relation_to_wheel` is the more meaningful name
  for this project; keep that, drop `authority_tier`

## Canonical schema (`data/sources/{id}.json`)

```jsonc
{
  "id": "book-of-enoch",                  // stable, kebab-case, used in citations
  "title": "Book of Enoch",
  "original_title": "1 Enoch",            // optional
  "description": {                        // i18n-ready; en required, others optional
    "en": "The Book of Enoch is..."
  },
  "authored_by": ["Enoch (ascribed to)"], // array
  "publish_date": "-300?",                // freeform; supports BCE / approximate
  "follow_url": "https://...",            // canonical external URL
  "source_type": "scripture",             // enum (see below)
  "source_family": "second_temple",       // enum (see below)
  "relation_to_wheel": "comparative_primary", // enum (see below)
  "stance": "neutral",                    // enum: neutral | supportive | critical
  "licensing_status": "public_domain",    // enum: public_domain | licensed | unknown
  "topics": ["Religion", "Mythology"],    // freeform tag array
  "library_slug": "book-of-enoch",        // optional — points at data-library entry
  "aliases": ["/resources/book-of-enoch/"] // legacy URLs (informational; redirects live in _redirects)
}
```

### Enums

**`source_type`** (was `medium` + `source_type`; consolidated)
`academic_monograph` · `academic_article` · `scripture` · `myth_text` ·
`encyclopedia` · `commentary` · `documentary` · `official_document` ·
`fiction` · `lecture` · `web_resource` · `podcast` · `manifesto`

**`source_family`** (tradition or domain)
`raelian` · `abrahamic` · `mesopotamian` · `second_temple` · `mormon` ·
`bahai` · `caodaist` · `oomoto` · `iranian` · `western_esoteric` ·
`archaeoastronomy` · `neo_euhemerism` · `criticism` · `science` ·
`supplementary`

**`relation_to_wheel`** (was `authority_tier` + `relation_to_wheel`)
`foundational` · `comparative_primary` · `scholarly_context` ·
`scientific_context` · `critical_context` · `supplementary`

**`stance`**
`neutral` · `supportive` · `critical`

**`licensing_status`**
`public_domain` · `licensed` · `unknown`

## Phases

### Phase 0 — Decisions & schema (this doc) ✓ DONE

### Phase 1 — Build the `data-bibliography` repo

1. Create `wheelofheaven/data-bibliography` on GitHub (public, CC0-1.0 like the others)
2. Repo layout:
   ```
   data-bibliography/
   ├── README.md
   ├── LICENSE                  (CC0-1.0)
   ├── schema/
   │   └── source.schema.json   (JSON Schema for validation)
   ├── sources/
   │   ├── book-of-enoch.json
   │   ├── book-of-mormon.json
   │   └── …                    (67 files migrated from resources/)
   └── index.json               (generated; lists all sources with id+title+family for fast lookup)
   ```
3. Migration script (Python, one-shot) converts each `content/resources/*.md`
   to a `sources/{id}.json` record, applying the schema cleanups (drop
   `claim_type`, consolidate `medium`→`source_type`, drop `authority_tier`)
4. Script also generates `index.json` from the per-source files
5. **Output:** repo with 67 source records, schema, index. No template changes yet

### Phase 2 — Render `/sources/` from the manifest

1. Add `data-bibliography` as a submodule of `data-content` at `data/sources/`
   (so Zola can `load_data` it without changes to outer-repo wiring)
2. Rewrite `sources-section.html` to read `data/sources/index.json` and render
   a filterable bibliography page (mirrors `/library/` overview UX):
   - Group by `source_family` (matches library's tradition-grouping)
   - Filter dropdown for `relation_to_wheel`
   - Same `.wiki-card` aesthetic as `/library/`
3. Decide source-page routing approach:
   - **Option A (recommended):** thin per-source markdown stub
     `content/sources/{id}.md` with just `+++\nslug = "{id}"\ntemplate = "sources-page.html"\n+++`,
     and `sources-page.html` loads `data/sources/{id}.json` via slug. Costs 67
     tiny stubs but uses Zola's routing as designed.
   - Option B: dynamic generation via a build script that emits the stubs from the manifest
     (no hand-maintained stubs; one source of truth)
4. New `sources-page.html` renders the record (wiki-page-like layout — title,
   description as lede, metadata in sidebar)
5. **Delete the 67 markdown stubs in `content/resources/`**
6. **Output:** `/sources/` works end-to-end, 67 records visible, individual permalinks resolve

### Phase 3 — Cloudflare redirects

1. Edit `static/_redirects` to add:
   ```
   /resources/                          /sources/                              301
   /resources/*                         /sources/:splat                        301
   /de/resources/                       /de/sources/                           301
   /de/resources/*                      /de/sources/:splat                     301
   …                                                                          (repeat per language)
   ```
2. Verify redirects after deploy: spot-check a few legacy URLs return 301 to `/sources/{id}/`
3. **Output:** every inbound link to `/resources/*` lands on the right `/sources/*`

### Phase 4 — Wire wiki citations through IDs

1. New `references` shape in wiki frontmatter:
   ```toml
   [[extra.references]]
   id = "book-of-enoch"
   note = "Optional editorial gloss for this specific citation"
   ```
2. Add a Tera helper / macro that resolves an id to the source record via
   `load_data("data/sources/" ~ id ~ ".json")` and renders the citation block
3. Build-time validation: a Python script in `scripts/` walks all wiki entries,
   collects cited ids, checks each exists in `data/sources/`. Wire into the
   CI (`mise run check`) so a typo'd id fails the build.
4. **Backfill is incremental, not blocking.** New wiki entries use the id form;
   old entries with inline `references` arrays get converted when the entry is
   next edited (or in a one-shot batch later).

### Phase 5 — Bidirectional library cross-link

1. **`data-bibliography` → library:** the `library_slug` field is already in the
   schema. Backfill it for sources that correspond to a `data-library` book.
2. **`data-library` → sources:** add `source_id` to each `data-library` book
   record (in `_meta.json` or the single-file format). Backfill from the same
   mapping table built for the previous step.
3. Templates surface the link both ways:
   - `library-book.html` sidebar: "Bibliography record: → /sources/{id}/"
   - `sources-page.html`: "Read the text: → /library/{slug}/"

### Phase 6 — Reverse-cite ("Cited by")

1. Build-time pass (script in `scripts/`) iterates wiki/article frontmatter,
   builds a `cited_by` map keyed by source id, writes it to
   `data/sources/cited-by.json`
2. `sources-page.html` reads `cited-by.json` for the current id and renders a
   "Cited by:" section listing the wiki/article entries
3. **Output:** the bibliography becomes a navigation hub — each source page
   lists every place in the project that draws on it

### Phase 7 — Cleanup & docs

1. Remove orphaned `.resources-*` SCSS / template references
2. Update `.claude/rules/content.md` to document the new citation style
3. Update `.claude/rules/seo-schema.md` if the schema type changes for source pages
4. Decide whether to keep `claim_type = "direct"` on the 67 *legacy*
   resource-stub-derived source records or just stop emitting it

## Risks

- **Zola dynamic routing limits.** Phase 2 option A (per-source markdown stub)
  is the safe path; option B is cleaner but depends on whether Zola plays well
  with build-script-generated stubs during incremental builds. Stick with A
  unless option B turns out to be straightforward.
- **i18n collision.** The site is mid-i18n pass on wiki/library. Phase 1 (data
  repo creation, no template churn) can run in parallel; Phase 2 onward
  should wait until the i18n work settles, or at least coordinate handoffs.
- **Scope creep.** Phases 4–6 are where the real wins live (typed citations,
  reverse links, library cross-link). Phases 1–3 alone deliver a cleaner
  `/sources/` but don't fundamentally change anything about the rest of the
  site. If energy runs out, stopping after Phase 3 is OK — the rest is
  incremental.
- **Cloudflare cache.** After Phase 3 deploys, old `/resources/*` URLs may sit
  in Cloudflare's edge cache for a while. Purge the cache after the deploy if
  redirect propagation feels slow.

## Migration order (TL;DR)

1. Phase 0 — ✓ this doc
2. Phase 1 — `data-bibliography` repo, 67 records migrated, schema written
3. Phase 2 — `/sources/` renders from manifest, old markdown stubs deleted
4. Phase 3 — Cloudflare redirects
5. Phase 4 — wiki citations switch to id-based references (incremental)
6. Phase 5 — bidirectional library link
7. Phase 6 — "Cited by" reverse links
8. Phase 7 — docs, cleanup
