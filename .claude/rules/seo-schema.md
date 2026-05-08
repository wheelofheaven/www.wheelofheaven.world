# SEO and Schema Conventions

## Schema Types by Section

| Section | Schema Type | Template |
|---------|-------------|----------|
| Wiki | `DefinedTerm` | `partials/schema/defined-term.html` |
| Explainers | `ScholarlyArticle` | `partials/schema/scholarly-article.html` |
| Timeline | `Event` | `partials/schema/event.html` |
| Library | `Book` | `partials/schema/book.html` |
| Essentials | `HowTo` | `partials/schema/how-to.html` |
| Resources | `Article` | (main seo.html) |
| Newsroom | `NewsArticle` | `partials/schema/news-article.html` |
| Homepage | `WebSite` | `partials/schema/website.html` |

## Creating New Schema Templates

Place in `templates/partials/schema/{type}.html`:

```tera
<!-- Schema.org {Type} - Description -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TypeName",
  "@id": "{{ current_url | safe }}",
  "name": "{{ page.title | escape }}",
  "description": "{{ page.description | default(value='') | escape }}",
  "url": "{{ current_url | safe }}",
  {% if page.date %}
  "datePublished": "{{ page.date | date(format='%Y-%m-%dT%H:%M:%S') }}+00:00",
  {% endif %}
  {% if page.updated %}
  "dateModified": "{{ page.updated | date(format='%Y-%m-%dT%H:%M:%S') }}+00:00",
  {% endif %}
  "inLanguage": "{{ detected_lang | default(value='en') }}",
  "isAccessibleForFree": true,
  "publisher": {
    "@type": "Organization",
    "@id": "{{ config.extra.organization_id | default(value=config.base_url ~ '/#organization') }}"
  }
}
</script>
```

## JSON-LD Best Practices

1. **Always include `@context` and `@type`**
2. **Use `@id` for entity identification**
3. **Escape all user content:** `| escape`
4. **Handle null values:** `| default(value='')`
5. **Use ISO 8601 dates:** `date(format='%Y-%m-%dT%H:%M:%S')`
6. **Reference organization:** Link to `#organization` ID

## Meta Tags (in seo.html)

### Essential Meta Tags

```html
<meta name="description" content="...">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="...">
<meta name="keywords" content="...">
<link rel="canonical" href="...">
```

### Open Graph

```html
<meta property="og:type" content="article">
<meta property="og:url" content="...">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="og:site_name" content="Wheel of Heaven">
```

### Twitter Cards

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
```

## AI/AEO Meta Tags

These help AI systems understand and extract content:

```html
<!-- Content classification -->
<meta name="ai.content_type" content="DefinedTerm">
<meta name="ai.entity_type" content="concept">
<meta name="ai.topic" content="Category Name">

<!-- Extraction hints -->
<meta name="ai.extractable_sections" content=".wiki__summary, .wiki__content, [data-ai-summary]">
<meta name="ai.summary" content="TLDR text">

<!-- Relationships -->
<meta name="ai.related_topics" content="tag1, tag2, tag3">
<meta name="ai.related_content" content="Related Item 1, Related Item 2">
<meta name="ai.citations" content="Citation 1; Citation 2">

<!-- Metadata -->
<meta name="ai.language" content="en">
<meta name="ai.publisher" content="Wheel of Heaven">
<meta name="ai.word_count" content="1500">
<meta name="ai.license" content="CC0-1.0">
<meta name="ai.crawlable" content="true">
<meta name="ai.indexable" content="true">
```

## Hreflang Tags

Implemented in `partials/language-alternates.html`:

```html
<link rel="alternate" hreflang="x-default" href="https://www.wheelofheaven.io/">
<link rel="alternate" hreflang="en" href="...">
<link rel="alternate" hreflang="de" href="...">
<!-- One per language -->
```

## Breadcrumb Schema

Automatically generated for pages with ancestors:

```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": { "@type": "WebPage", "url": "..." }
    },
    ...
  ]
}
```

## Speakable Schema

For voice assistant optimization (`partials/schema/speakable.html`):

```json
{
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [
      ".wiki__summary",
      ".wiki__content > p:first-of-type",
      "[data-ai-summary]"
    ]
  }
}
```

## Data Attributes for AI

Add to HTML elements for better AI extraction:

| Attribute | Usage |
|-----------|-------|
| `data-ai-summary="true"` | Summary/TLDR blocks |
| `data-ai-definition="true"` | Definition content |
| `data-ai-answer="true"` | Direct answers |
| `data-ai-cite="true"` | Citations/references |
| `data-speakable="true"` | Voice-optimized content |

Example:

```html
<div class="wiki__summary" data-ai-summary="true" data-ai-answer="true">
    {{ page.extra.summary | markdown | safe }}
</div>
```

## Image Schema

Always include for images in structured data:

```json
"image": {
  "@type": "ImageObject",
  "url": "...",
  "name": "Image title",
  "description": "Alt text or description",
  "width": 1200,
  "height": 630,
  "caption": "Optional caption"
}
```

## Sitemap

Custom sitemap at `templates/sitemap.xml`:

- Uses `entries` variable provided by Zola
- Sets `changefreq` based on section type
- Sets `priority` based on content importance

## SEO Checklist for New Content

1. ✅ Title under 60 characters
2. ✅ Description 150-160 characters
3. ✅ Canonical URL set (automatic)
4. ✅ Open Graph image specified
5. ✅ Schema type appropriate for content
6. ✅ Internal links to related content
7. ✅ Data attributes for AI extraction
8. ✅ Alt text for images
