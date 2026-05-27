# www.wheelofheaven.world Codex Instructions

This is the main Wheel of Heaven Zola website.

Read `../AGENTS.md` first for workspace-wide GitHub account isolation and
project conventions. The previous Claude Code context is
`.claude/CLAUDE.md`; it remains authoritative for website-specific work.

## Stack

- Zola static site generator.
- Tera templates.
- SCSS with the Bifrost component system.
- `mise` task runner.
- Fuse.js client-side search.

## Common Commands

```sh
mise run build
mise run serve
mise run check
mise run clean
```

Use the commands defined in `mise.toml` if they differ from the list above.

## Required Context

Before changing reusable UI, templates, shortcodes, macros, or design tokens,
check the docs site first:

- Live docs: `https://docs.wheelofheaven.world`
- Source docs: `../docs.wheelofheaven.world/content/`
- Component docs: `../docs.wheelofheaven.world/content/components/`

Do not re-derive a Bifrost component or shortcode pattern without checking the
documentation. When changing anything under `themes/bifrost/`, update the
sibling docs repo as part of the same logical change.

## Website Conventions

- Use explicit TOML frontmatter in content files.
- Use `detected_lang` for localized URLs and translations.
- Use 4-space indentation in Tera templates.
- Use BEM class names and existing Bifrost tokens/mixins in SCSS.
- Keep SEO metadata, breadcrumb navigation, and JSON-LD schemas intact.
- Add or preserve `data-ai-*` attributes where content is meant to be extracted.
- Follow `../.claude/rules/templates.md`, `../.claude/rules/styling.md`,
  `../.claude/rules/content.md`, and `../.claude/rules/seo-schema.md` for the
  relevant work type.
