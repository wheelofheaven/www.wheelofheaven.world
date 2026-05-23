"""
Per-platform copy generation.

Mechanical default: title + summary (truncated as needed) + permalink.
Overridden by `[social].{platform}` in the page's frontmatter when set.

Length budgets are conservative — Telegram has 1024 with photo / 4096
without, but we keep posts well under the photo budget so the OG image
attachment path is always available.
"""

from __future__ import annotations

from .discover import Page

# Conservative per-platform body budgets. Captions, not text-only
# limits — designed to leave room for an attached OG image.
BUDGETS = {
    "telegram": 900,    # 1024 caption limit; leave headroom for HTML tags
    "bluesky":  280,    # 300 graphemes; leave a little slack
    "mastodon": 450,    # 500 default; leave slack for CW prefix
    "twitter":  240,    # 280; URL counts as 23 → ~240 after the link
    "discord":  1800,   # 2000; uses embed so this is mostly cosmetic
}


def _truncate(text: str, limit: int) -> str:
    """Truncate at a sentence boundary if possible, else word boundary."""
    if len(text) <= limit:
        return text
    # Try sentence boundary first
    head = text[:limit]
    for sep in (". ", "! ", "? "):
        idx = head.rfind(sep)
        if idx > limit // 2:
            return head[: idx + 1].rstrip() + " …"
    # Fall back to word boundary
    idx = head.rfind(" ")
    if idx > limit // 2:
        return head[:idx].rstrip() + " …"
    # Hard truncate
    return head.rstrip() + "…"


def render_telegram(page: Page) -> str:
    """Build the Telegram caption/message body. HTML-flavored."""
    override = page.social.get("telegram")
    if override:
        return override.strip()
    budget = BUDGETS["telegram"]
    title_html = f"<b>{_html_escape(page.title)}</b>"
    permalink = page.permalink
    # Reserve room for title + permalink + spacing
    overhead = len(title_html) + len(permalink) + 16
    body_budget = max(120, budget - overhead)
    summary = _truncate(page.summary, body_budget) if page.summary else ""
    pieces = [title_html]
    if summary:
        pieces.append(_html_escape(summary))
    pieces.append(f'<a href="{permalink}">{permalink}</a>')
    return "\n\n".join(pieces)


def render_bluesky(page: Page) -> str:
    """
    Build a Bluesky post body. Plain text, no URL in the body —
    the URL lives in the attached `app.bsky.embed.external` card so
    we don't burn graphemes on it.

    Bluesky's hard limit is 300 graphemes. We use len() as a safe
    approximation for our scholarly-English content (no emoji-heavy
    posts). Target a 290-char ceiling with a 10-char buffer for the
    truncation ellipsis.
    """
    override = page.social.get("bluesky")
    if override:
        return override.strip()

    title = page.title.strip()
    CEILING = 290

    if not page.summary:
        return _truncate(title, CEILING)

    # title + "\n\n" + summary
    summary_budget = CEILING - len(title) - 2

    if summary_budget < 60:
        return _truncate(title, CEILING)

    summary = _truncate(page.summary, summary_budget)
    return f"{title}\n\n{summary}"


def render_twitter(page: Page) -> str:
    """
    Build a Twitter / X post body. Plain text — no HTML.

    Twitter counts URLs as 23 chars regardless of actual length. The
    full URL still goes in the body; we just budget against 23 when
    deciding how much summary to keep.

    Target a 275-char ceiling under the 280 hard limit (5-char buffer
    for the truncation ellipsis the _truncate helper may add).
    """
    override = page.social.get("twitter")
    if override:
        return override.strip()

    permalink = page.permalink
    title = page.title.strip()
    URL_WEIGHT = 23
    CEILING = 275  # under 280, leaves room for truncation suffix

    if not page.summary:
        # title + "\n\n" + url
        title_budget = CEILING - URL_WEIGHT - 2
        return f"{_truncate(title, title_budget)}\n\n{permalink}"

    # title + "\n\n" + summary + "\n\n" + url
    summary_budget = CEILING - len(title) - URL_WEIGHT - 4

    # If the title alone is so long the summary can't fit meaningfully,
    # truncate the title too and drop the summary.
    if summary_budget < 60:
        title_budget = CEILING - URL_WEIGHT - 2
        return f"{_truncate(title, title_budget)}\n\n{permalink}"

    summary = _truncate(page.summary, summary_budget)
    return f"{title}\n\n{summary}\n\n{permalink}"


def _html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# Registry of per-platform renderers. Future-phase adapters register here.
RENDERERS = {
    "telegram": render_telegram,
    "twitter":  render_twitter,
    "bluesky":  render_bluesky,
}


def render(page: Page, channel: str) -> str:
    if channel not in RENDERERS:
        raise ValueError(f"no renderer for channel {channel!r}")
    return RENDERERS[channel](page)
