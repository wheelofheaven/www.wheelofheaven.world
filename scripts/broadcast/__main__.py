"""
Broadcaster CLI — `python -m scripts.broadcast`.

Discovers eligible content, diffs against state, posts to each enabled
channel, records results. See
https://docs.wheelofheaven.world/contributing/dev/social-broadcast/.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import telegram as telegram_adapter
from .discover import Page, discover, filter_eligible
from .render import render
from .state import PostRecord, State

DEFAULT_CONTENT_ROOT = Path("content")
DEFAULT_STATE_PATH = Path("data/socials/posted.json")
DEFAULT_LOG_PATH = Path("data/socials/log.jsonl")
DEFAULT_BASE_URL = "https://www.wheelofheaven.world"

# Registry — keys must match channel names in render.RENDERERS and the
# `[extra].broadcast` allowlist values.
CHANNELS = {
    "telegram": telegram_adapter,
}


def _og_image_url(page: Page, base_url: str = "https://assets.wheelofheaven.world") -> str:
    """Mirror seo.html's OG composition for the EN root page."""
    slug_stem = page.slug.split("/", 1)[1] if "/" in page.slug else page.slug
    return f"{base_url}/images/og/en/{page.section}/{slug_stem}.jpg"


def _log(log_path: Path, record: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def _step_summary_md(summary: list[str]) -> None:
    """Write a GitHub Actions step summary if running in CI."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    Path(path).write_text("\n".join(summary) + "\n", encoding="utf-8")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="broadcast", description="Wheel of Heaven social broadcaster")
    p.add_argument("--content-root", type=Path, default=DEFAULT_CONTENT_ROOT)
    p.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH)
    p.add_argument("--log", type=Path, default=DEFAULT_LOG_PATH)
    p.add_argument("--base-url", default=DEFAULT_BASE_URL)
    p.add_argument(
        "--platforms",
        help="Comma-separated channel allowlist (default: all enabled)",
        default=None,
    )
    p.add_argument(
        "--only",
        help="Limit to a single slug, e.g. news/pursue-release-02-spheres-and-transmedium",
        default=None,
    )
    p.add_argument("--dry-run", action="store_true", help="Print planned posts; don't POST or write state")
    p.add_argument(
        "--backfill",
        action="store_true",
        help="Mark every currently-eligible page as manual_skip in state (no posts). Use once when seeding.",
    )
    return p.parse_args()


def _enabled_channels(requested: list[str] | None) -> tuple[list[str], list[str]]:
    """Return (enabled_for_this_run, disabled_because_no_secrets)."""
    enabled, disabled = [], []
    candidates = requested if requested else list(CHANNELS.keys())
    for ch in candidates:
        if ch not in CHANNELS:
            raise SystemExit(f"unknown channel: {ch}")
        if CHANNELS[ch].is_enabled():
            enabled.append(ch)
        else:
            disabled.append(ch)
    return enabled, disabled


def main() -> int:
    args = _parse_args()
    requested_platforms = (
        [p.strip() for p in args.platforms.split(",") if p.strip()] if args.platforms else None
    )

    pages = discover(args.content_root, args.base_url)
    if args.only:
        pages = [p for p in pages if p.slug == args.only]
        if not pages:
            print(f"ERROR: --only {args.only!r} matched zero pages", file=sys.stderr)
            return 2

    # Backfill mode: walk every currently-eligible (page, channel) pair
    # and mark it manual_skip in state. Does not POST anything.
    if args.backfill:
        all_channels = requested_platforms or list(CHANNELS.keys())
        state = State(args.state)
        seeded = 0
        for page in pages:
            for ch in all_channels:
                if page.is_eligible_for(ch) and not state.has_been_posted(page.slug, ch):
                    state.mark_manual_skip(page.slug, page.title, page.permalink, ch)
                    seeded += 1
        if not args.dry_run:
            state.save()
        print(f"backfill: pre-seeded {seeded} (page, channel) pairs as manual_skip")
        return 0

    # Determine which channels are actually live for this run.
    enabled, disabled_no_secrets = _enabled_channels(requested_platforms)

    if args.dry_run:
        # In dry-run mode we still want to render everything that *could*
        # be posted, so include channels without secrets too.
        run_channels = requested_platforms or list(CHANNELS.keys())
    else:
        run_channels = enabled

    if not run_channels:
        print("no channels available — set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID or pass --dry-run")
        return 0

    state = State(args.state)
    eligible = filter_eligible(pages, run_channels)

    plan: list[tuple[Page, str]] = []
    skipped_no_secret: list[tuple[Page, str]] = []
    for page in eligible:
        for ch in run_channels:
            if not page.is_eligible_for(ch):
                continue
            if state.has_been_posted(page.slug, ch):
                continue
            if ch not in enabled and not args.dry_run:
                # Eligible page, no secret configured → loud fail (exit 2 after the loop).
                skipped_no_secret.append((page, ch))
                continue
            plan.append((page, ch))

    if not plan and not skipped_no_secret:
        print("nothing to do — all eligible (page, channel) pairs are already in state")
        return 0

    summary_lines: list[str] = ["# Social broadcast summary", ""]
    ok_count = 0
    err_count = 0

    for page, ch in plan:
        rendered = render(page, ch)
        og_url = _og_image_url(page)
        if args.dry_run:
            print(f"\n=== {ch}: {page.slug} ===")
            print(f"og_image: {og_url}")
            print(rendered)
            summary_lines.append(f"- **{ch}** {page.slug} (dry-run)")
            continue
        try:
            record = CHANNELS[ch].post(page, rendered, og_image_url=og_url)
        except Exception as exc:
            err_count += 1
            print(f"FAIL {ch} {page.slug}: {exc}", file=sys.stderr)
            _log(args.log, {
                "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "slug": page.slug,
                "ch": ch,
                "status": "err",
                "err": str(exc),
            })
            summary_lines.append(f"- ❌ **{ch}** {page.slug}: {exc}")
            continue
        ok_count += 1
        state.record_post(page.slug, page.title, page.permalink, ch, record)
        state.save()  # incremental — partial-success durability
        _log(args.log, {
            "ts": record.posted_at,
            "slug": page.slug,
            "ch": ch,
            "status": "ok",
            "post_id": record.post_id,
            "url": record.url,
        })
        link = f" → [post]({record.url})" if record.url else ""
        summary_lines.append(f"- ✅ **{ch}** {page.slug}{link}")
        print(f"OK   {ch} {page.slug} -> {record.post_id}")

    if skipped_no_secret:
        for page, ch in skipped_no_secret:
            print(
                f"ERROR: page {page.slug} is eligible for {ch} but the channel's "
                f"secrets are not configured",
                file=sys.stderr,
            )
            summary_lines.append(f"- ⚠️  **{ch}** {page.slug}: secrets not configured")
        _step_summary_md(summary_lines)
        return 2

    _step_summary_md(summary_lines)

    # Exit 1 only if everything we attempted failed (no successes at all).
    if err_count > 0 and ok_count == 0 and not args.dry_run:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
