# Content Editing Guidelines

Editorial standards for writing and editing Wheel of Heaven content.

## Section Definitions

### Articles (Explainers)

**Purpose:** Evergreen, thesis-driven analysis of an idea.

**Structure:** TLDR → introduction → background → main argument → counterarguments → conclusion → references.

**Tone:** Scholarly but accessible; can include author perspective when clearly labeled as interpretation.

**Length:** Long-form (1500–3000+ words typical).

**Sourcing:** Six-source minimum where possible — Raëlian canon, ancient primary, scholarly, scientific/historical, comparative, critical.

Articles are stable. They are updated when the argument changes, not when the news cycle does.

### Newsroom Dispatches

**Purpose:** Read a current event through the canon. The event is the subject; the canon-tied reading is the angle.

**Structure:**
1. Lede ("What happened") — 1–2 paragraphs stating the event in plain terms, no editorial yet.
2. Canon angle — 2–4 paragraphs reading the event through the Wheel of Heaven frame: which canon claim does it touch, sharpen, complicate, or echo?
3. Context (optional) — where the event sits in a longer story.
4. Sources — primary news source(s), rendered automatically from the `sources` frontmatter array.

**Length:** 300–800 words typical. A Dispatch isn't trying to be definitive; it's trying to be *current*.

**Tone:** Same scholarly register as the rest of the site, but tighter and more journalistic. Canon claims can be stated directly; comparative, scientific, and critical claims stay hedged.

**Sourcing floor:** primary news source(s) + at least one `canon_links` entry. The six-source minimum does **not** apply.

**Decay:** Dispatches over 12 months old should be reviewed — either left as historical record, or seeded into a future Explainer with cross-links. There is no automatic promotion path: a Dispatch never gets retitled into an Explainer; if the topic deserves the long form, write a fresh Explainer and have it cite the Dispatch.

**Required frontmatter:** `event_date`, `event_type`, `claim_type`, `canon_links`, `sources`. See [`content.md`](content.md) "Newsroom Dispatch" for the full spec.

**Distinct from Articles:** an Article is built around an **idea** and is evergreen. A Dispatch is built around an **event** and decays. If you find yourself writing the deep-dive version of a Dispatch, stop and write an Explainer instead — they live in `/articles/`, not `/news/`.

## Voice and Tone

### Primary register
- Scholarly but accessible — academic rigor without jargon
- Curious and open-minded — encourage inquiry
- Respectful of sources — honor original texts and interpretations

### Always avoid
- Sensational framing ("the secret they don't want you to know")
- Proselytizing tone ("you must believe...")
- Dismissive treatment of mainstream science

## Terminology

| Term | Usage | Avoid |
|------|-------|-------|
| Elohim | Capitalize; plural ("the Elohim were...") | "aliens", "gods" (unless quoting) |
| Yahweh | The Elohim president | "God" (unless in direct quotes) |
| Raëlism / Raëlian | Note the diaeresis (ë) | "Raelism" |
| Ancient astronaut theory | Broader academic term | "ancient aliens" |

## Quality Checklist

Before publishing any content, verify:

- Title under 60 characters
- Description 150–160 characters
- Opening paragraph defines the topic clearly
- Key terms link to wiki entries
- No broken internal links
- Images have alt text
- Register is scholarly, not preachy
- `claim_type` set in frontmatter (`direct`, `inferred`, or `speculative`)
- For Articles: six-source target met where applicable
- For Newsroom Dispatches: `event_date`, `event_type`, `canon_links`, `sources` complete
