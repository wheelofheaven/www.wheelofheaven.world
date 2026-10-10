# Template Conventions

## File Naming

- **Section templates:** `{section}-section.html` (e.g., `wiki-section.html`)
- **Page templates:** `{section}-page.html` (e.g., `wiki-page.html`)
- **Partials:** `partials/{name}.html` (lowercase, hyphens)
- **Schema partials:** `partials/schema/{schema-type}.html`
- **Macros:** `macros/{feature}.html`
- **Shortcodes:** `shortcodes/{name}.html`

## Base Template Structure

All templates extend `base.html` which provides:

```tera
{% extends "base.html" %}

{% block content %}
<!-- Your content here -->
{% endblock content %}
```

The base template includes:
- Language detection via `detected_lang` variable
- SEO meta tags (`partials/seo.html`)
- Header and footer
- Skip link for accessibility

## Language Detection

Always use the `detected_lang` variable (set in base.html):

```tera
{{ get_url(path="wiki/", lang=detected_lang, trailing_slash=true) }}
{{ trans(key="navbarWiki", lang=detected_lang) }}
```

**Every page link passes `trailing_slash=true`.** Zola's `get_url` drops
the trailing slash even when the path literal has one, and Cloudflare
Pages answers the slash-less URL with a `308` redirect — in one week of
2026-10 that was 6,240 of 35k AI-crawler requests. Never start the path
with `/` when `lang` is passed (`/articles/` + `lang=zh` rendered
`/zh//articles`); use `path=""` for the home link. Only file paths
(`site.webmanifest`, `.xml`, images, bundles with `cachebust=true`) go
without the flag.

## Template Patterns

### Section Template Pattern

```tera
{% extends "base.html" %}
{% import "macros/breadcrumbs.html" as breadcrumbs %}

{% block content %}
<div class="section-name">
    {{ breadcrumbs::section_name(section=section, lang=detected_lang) }}

    <header class="section-name__header">
        <h1 class="section-name__title">{{ section.title }}</h1>
        {% if section.description %}
        <p class="section-name__description">{{ section.description }}</p>
        {% endif %}
    </header>

    {% if section.pages %}
    <div class="section-name__grid">
        {% for page in section.pages %}
        <article class="section-name__item">
            <h2><a href="{{ page.permalink }}">{{ page.title }}</a></h2>
        </article>
        {% endfor %}
    </div>
    {% endif %}
</div>
{% endblock content %}
```

### Page Template Pattern

```tera
{% extends "base.html" %}
{% import "macros/breadcrumbs.html" as breadcrumbs %}

{% block content %}
{% include "partials/schema/specific-schema.html" %}

<div class="page-name">
    {{ breadcrumbs::page_type(page=page, lang=detected_lang) }}

    <article class="page-name__article">
        <header class="page-name__header">
            <h1 class="page-name__title" id="page-title">{{ page.title }}</h1>

            {% if page.extra.summary or page.description %}
            <div class="page-name__summary" data-ai-summary="true">
                {{ page.extra.summary | default(value=page.description) | markdown | safe }}
            </div>
            {% endif %}
        </header>

        {% if page.content %}
        <div class="page-name__content">
            {{ page.content | safe }}
        </div>
        {% endif %}
    </article>
</div>
{% endblock content %}
```

## Tera Syntax Conventions

### Variables and Output

```tera
{{ page.title }}                              {# Direct output #}
{{ page.title | escape }}                     {# Escape HTML #}
{{ page.title | default(value="Untitled") }}  {# Default value #}
{{ page.content | safe }}                     {# Trust HTML content #}
{{ page.description | markdown | safe }}      {# Render markdown #}
```

### Conditionals

```tera
{# Single line for simple conditions #}
{% if page.title %}...{% endif %}

{# Multi-line for complex content #}
{% if page.extra.image %}
<img src="{{ get_url(path=page.extra.image) }}" alt="{{ page.title }}">
{% endif %}

{# With else #}
{% if page.date %}
    {{ page.date | date(format="%B %d, %Y") }}
{% else %}
    No date
{% endif %}
```

### Loops

```tera
{% for item in items %}
<div class="item">
    {{ item.title }}
    {% if not loop.last %}, {% endif %}
</div>
{% endfor %}

{# Loop metadata available: loop.index, loop.first, loop.last #}
```

### Macros

```tera
{# Import at top of file #}
{% import "macros/breadcrumbs.html" as breadcrumbs %}

{# Call with named parameters #}
{{ breadcrumbs::wiki(page=page, lang=detected_lang) }}
```

### Includes

```tera
{% include "partials/schema/organization.html" %}
```

## Common Filters

| Filter | Usage |
|--------|-------|
| `default(value="x")` | Fallback value |
| `escape` | HTML escape |
| `safe` | Allow raw HTML |
| `markdown` | Render markdown |
| `truncate(length=150)` | Truncate text |
| `date(format="%Y-%m-%d")` | Format dates |
| `slugify` | URL-safe string |
| `split(pat=",")` | Split string |
| `join(sep=", ")` | Join array |
| `length` | Array/string length |

## Accessibility Requirements

1. **Skip link:** Already in base.html
2. **Landmarks:** Use `role="main"`, `role="complementary"`, `role="navigation"`
3. **Headings:** Maintain proper h1-h6 hierarchy
4. **ARIA labels:** Add `aria-label` or `aria-labelledby` to interactive elements
5. **Alt text:** Always provide for images

```tera
<nav aria-label="Breadcrumb navigation">
<section role="complementary" aria-label="Related topics">
<article role="article" aria-labelledby="page-title">
```

## Data Attributes for AI

Add these to improve AI extraction:

```html
data-ai-summary="true"     <!-- Summary/TLDR blocks -->
data-ai-definition="true"  <!-- Definition content -->
data-ai-answer="true"      <!-- Answer to a question -->
data-ai-cite="true"        <!-- Citations/references -->
data-speakable="true"      <!-- Voice assistant content -->
```
