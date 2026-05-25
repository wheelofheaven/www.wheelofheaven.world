# Wheel of Heaven - Project Context

## Overview

Wheel of Heaven is a multilingual knowledge base exploring the hypothesis that life on Earth was intelligently designed by an extraterrestrial civilization (the Elohim). The site covers ancient astronaut theory, Raelism, biblical exegesis, and cosmic chronology.

**URL:** https://www.wheelofheaven.io
**License:** CC0-1.0 (Public Domain)

## Technology Stack

- **Static Site Generator:** Zola v0.21.0 (Rust-based)
- **Templating:** Tera templates
- **Styling:** SCSS with 7-1 architecture pattern
- **Build Tool:** mise (tasks defined in `mise.toml`)
- **Search:** Fuse.js (client-side, `fuse_json` format)

## Quick Commands

```bash
mise run build    # Build site with zola build
mise run serve    # Dev server on port 1199 with live reload
mise run check    # Run zola diagnostics
mise run clean    # Remove /public directory
```

## Project Structure

```
├── config.toml              # Zola config with all translations
├── mise.toml                # Build task definitions
├── content/                 # Markdown content by section/language
│   ├── wiki/                # Encyclopedia entries
│   ├── timeline/            # Historical ages/events
│   ├── library/             # Sacred texts (Raelian scriptures)
│   ├── essentials/          # Quick reference guides
│   ├── explainers/          # In-depth articles
│   ├── resources/           # External resource catalog
│   ├── articles/            # Blog posts
│   └── [de,es,fr,ja,ko,ru,zh,zh-Hant]/  # Language variants
├── templates/               # Tera templates
│   ├── base.html            # Root template
│   ├── *-section.html       # Section index templates
│   ├── *-page.html          # Individual page templates
│   ├── macros/              # Reusable template macros
│   ├── partials/            # Included partial templates
│   │   └── schema/          # JSON-LD schema templates
│   └── shortcodes/          # Markdown shortcodes
├── sass/                    # SCSS stylesheets (7-1 pattern)
│   ├── abstracts/           # Variables, mixins, colors
│   ├── base/                # Reset, typography
│   ├── layout/              # Navbar, footer, grid
│   ├── components/          # Reusable UI components
│   ├── pages/               # Page-specific styles
│   └── themes/              # Light/dark themes
├── static/                  # Static assets (images, JS)
├── data/                    # JSON data files
└── scripts/                 # Python utilities
```

## Content Sections

| Section | Path | Template | Schema Type |
|---------|------|----------|-------------|
| Wiki | `/wiki/` | `wiki-page.html` | DefinedTerm |
| Timeline | `/timeline/` | `timeline-section.html` | Event |
| Library | `/library/` | `library-book.html` | Book |
| Essentials | `/essentials/` | `essentials-page.html` | HowTo |
| Explainers | `/explainers/` | `explainer-page.html` | ScholarlyArticle |
| Resources | `/resources/` | `resources-page.html` | Article |
| Articles | `/articles/` | `page.html` | Article |

## Languages Supported (9)

- English (en) - default
- Deutsch (de)
- Français (fr)
- Español (es)
- Русский (ru)
- 日本語 (ja)
- 简体中文 (zh)
- 繁體中文 (zh-Hant)
- 한국어 (ko)

## Key Conventions

### Templates
- Use 4-space indentation
- BEM class naming: `.block__element--modifier`
- Import macros at top: `{% import "macros/breadcrumbs.html" as breadcrumbs %}`
- Always escape user content, use `| safe` only for trusted HTML

### Styling
- Follow 7-1 SCSS pattern
- Use variables from `abstracts/`: `$spacing-md`, `$border-radius-sm`, etc.
- Use CSS custom properties for theme-aware colors: `var(--color-text)`
- BEM naming throughout

### Content
- Frontmatter in TOML format (`+++`)
- Specify `template = "section-page.html"` explicitly
- Use `[extra]` section for custom metadata
- Include `description` for SEO

### SEO/Schema
- JSON-LD schemas in `partials/schema/`
- AI meta tags for LLM optimization
- Always include breadcrumb navigation
- Use `data-ai-*` attributes for AI extraction hints

## Important Files

- `templates/base.html` - Root template, defines `{% block content %}`
- `templates/partials/seo.html` - All meta tags and main schema
- `sass/abstracts/_variables.scss` - Spacing, radii, z-index, transitions
- `sass/abstracts/_colors.scss` - Color palette (Bifrost theme)
- `config.toml` - Site config and all translations

## Rules

See `.claude/rules/` for detailed conventions:
- `templates.md` - Template structure and patterns
- `styling.md` - SCSS/CSS conventions
- `content.md` - Content and frontmatter patterns
- `seo-schema.md` - SEO and JSON-LD schema patterns

## Documentation site — check it first

The authoritative project documentation lives at
[docs.wheelofheaven.world](https://docs.wheelofheaven.world) (sibling
repo `docs.wheelofheaven.world/`). When you need to know whether a
piece of UI is already a reusable Bifrost component, or how to use a
shortcode / macro / mixin, **check the docs site before re-deriving
anything**:

| Looking for…                                | Go to                                                              |
|---------------------------------------------|--------------------------------------------------------------------|
| Bifrost components (SCSS, macros, shortcodes, tokens) | <https://docs.wheelofheaven.world/components/>             |
| Glass-cloud visual language                 | <https://docs.wheelofheaven.world/components/visual-language/>     |
| Content shortcodes (`wiki`, `library`, `cite`, …) | <https://docs.wheelofheaven.world/components/shortcodes/>     |
| Tera macros (breadcrumbs, claim-badge, …)   | <https://docs.wheelofheaven.world/components/macros/>              |
| Design tokens (palette, spacing, type)      | <https://docs.wheelofheaven.world/components/tokens/>              |
| Editorial standards & content types         | <https://docs.wheelofheaven.world/contributing/content/>           |
| Pipelines, CI/deploy, theme architecture    | <https://docs.wheelofheaven.world/contributing/dev/>               |
| Multi-site architecture, hosting, SEO       | <https://docs.wheelofheaven.world/architecture/>                   |
| Icon registry (live render)                 | <https://docs.wheelofheaven.world/reference/icons/>                |

Source for those pages: `docs.wheelofheaven.world/content/`. Reading
the markdown there is the fastest path to context — better than
spelunking through `themes/bifrost/sass/components/` blindly.

When you add or change a Bifrost component (anything in
`themes/bifrost/`), document the change in the sibling docs repo as
part of the same logical PR — keeping them in sync is the point.
