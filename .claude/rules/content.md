# Content Conventions

## Frontmatter Format

Always use TOML format with `+++` delimiters:

```toml
+++
title = "Page Title"
description = "SEO description (150-160 chars recommended)"
template = "section-page.html"
+++
```

## Required Fields

### For Pages

```toml
+++
title = "Page Title"
description = "Brief description for SEO and previews"
template = "wiki-page.html"  # Always specify explicitly
+++
```

### For Sections

```toml
+++
title = "Section Title"
description = "Section description"
template = "wiki-section.html"
sort_by = "weight"  # or "date", "title"
+++
```

## Common Extra Fields

```toml
[extra]
# Summary for AI extraction (displayed prominently)
summary = "Quick summary paragraph"
tldr = "One-sentence takeaway"

# Categorization
category = "Category Name"
keywords = ["keyword1", "keyword2"]

# Images
image = "images/featured.jpg"
header_image = "images/header.jpg"
image_alt = "Descriptive alt text"
image_caption = "Image caption"

# Schema override
schema_type = "ScholarlyArticle"

# Author (if not organization)
author = "Author Name"

# Control indexing
noindex = false
```

## Section-Specific Patterns

### Wiki Entry

```toml
+++
title = "Term Name"
description = "Definition and context"
template = "wiki-page.html"
toc = true
aliases = ["/old/path/"]

[extra]
alternative_names = ["Alias 1", "Alias 2"]
category = "Category"
see_also = [
    { title = "Related Term", path = "/wiki/related/" }
]
external_links = [
    { title = "Wikipedia", url = "https://..." }
]
references = [
    { title = "Source", author = "Author", date = "2023", url = "https://..." }
]
+++
```

### Essentials Page

```toml
+++
title = "Guide Title"
description = "What this guide covers"
template = "essentials-page.html"
weight = 10

[extra]
summary = "Quick overview of the guide"
steps = [
    { name = "Step 1", text = "Description" },
    { name = "Step 2", text = "Description" }
]
+++
```

### Timeline Entry

```toml
+++
title = "Age of Aquarius"
description = "Description of this age"
template = "timeline-section.html"
weight = 12

[extra]
start_year = "1945"
end_year = "4105"
zodiac_sign = "aquarius"
symbol = "♒"
+++
```

### Library Book

```toml
+++
title = "Book Title"
description = "Book description"
template = "library-book.html"

[extra]
author = "Author Name"
original_title = "Original Title"
publication_year = "1974"
isbn = "978-..."
+++
```

### Newsroom Dispatch

```toml
+++
title = "Dispatch headline"
description = "150–160 char summary of the event and angle"
template = "news-page.html"
date = 2026-05-08

[extra]
event_date = 2026-05-07              # When the event happened
event_type = "announcement"          # announcement | discovery | anniversary | cultural-moment | obituary
claim_type = "inferred"              # direct | inferred | speculative
summary = "One-paragraph TLDR — the lede plus the canon angle in 2–4 sentences."
canon_links = [                      # Required: at least one canon entry touched
    { title = "Elohim", path = "/wiki/elohim/" }
]
sources = [                          # The news source(s) being read
    { title = "Source headline", url = "https://...", outlet = "Outlet Name", date = "2026-05-07" }
]
+++
```

Dispatches are short (300–800 words), time-anchored entries that read a
current event through the canon. They are exempt from the six-source minimum
that applies to Articles — the floor is the primary news source(s) plus at
least one `canon_links` entry. See
[`content-editing.md`](content-editing.md) "Newsroom Dispatches" for
editorial structure and tone.

### Resource Entry

```toml
+++
title = "Resource Title"
description = "Resource description"
template = "resources-page.html"

[extra]
medium = "nonfiction-book"
author = "Author Name"
publication_year = "2020"
source_url = "https://..."
topics = ["topic1", "topic2"]
+++
```

## Media Types for Resources

Valid `medium` values:
- `nonfiction-book`, `fiction-book`, `religious-text`, `academic-paper`
- `documentary`, `movie`, `tv-series`
- `podcast`, `audio-book`, `lecture`
- `website`, `wiki`, `blog`, `article`, `video-channel`
- `organization`, `community`

## Content Organization

### Directory Structure

```
content/
├── _index.md               # Homepage content
├── wiki/
│   ├── _index.md           # Wiki section index
│   ├── elohim.md           # Individual entries
│   └── ...
├── de/                     # German translations
│   ├── _index.md
│   └── wiki/
│       ├── _index.md
│       └── elohim.md       # Same slug as English
└── ...
```

### Translation Files

- Keep same slugs across languages when possible
- Place in `{lang}/` subdirectory
- Reference: `/de/wiki/elohim/` mirrors `/wiki/elohim/`

## Writing Guidelines

### Titles
- Use title case for English
- Keep concise (under 60 chars for SEO)

### Descriptions
- 150-160 characters optimal
- Include primary keyword
- Describe content value

### Summaries
- 2-3 sentences
- Answer "what will I learn?"
- Optimized for AI extraction

### Body Content
- Use markdown headings (## for h2, ### for h3)
- Include internal links to related wiki entries
- Add references for claims
- Use shortcodes for special content

## Shortcode Usage

### Citations
```markdown
{% cite(id="1", text="[1]", title="Reference Title") %}
```

### Definition Box
```markdown
{% definition(term="Term", type="standard") %}
Definition content here.
{% end %}
```

### Info Box
```markdown
{% info(title="Note") %}
Important information here.
{% end %}
```

## Taxonomies

### Available Taxonomies

```toml
[taxonomies]
authors = "authors"
tags = "tags"
categories = "categories"
```

### Usage in Frontmatter

```toml
+++
title = "Article"

[taxonomies]
tags = ["ancient-astronauts", "genesis"]
authors = ["Author Name"]
categories = ["Research"]
+++
```

## Aliases and Redirects

Use `aliases` for old URLs that should redirect:

```toml
+++
title = "New Page"
aliases = ["/old/url/", "/another/old/path/"]
+++
```
