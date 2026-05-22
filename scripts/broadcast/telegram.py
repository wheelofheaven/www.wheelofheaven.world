"""
Telegram Bot API adapter.

Auth: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID environment variables. The
bot must be added as an administrator on the target channel with
"Post Messages" permission. See
https://docs.wheelofheaven.world/contributing/dev/social-broadcast/#telegram-phase-1.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from .discover import Page
from .state import PostRecord

API_BASE = "https://api.telegram.org"
TIMEOUT_SECS = 20

CHANNEL = "telegram"


@dataclass
class TelegramConfig:
    bot_token: str
    chat_id: str  # @channelusername OR numeric -100…

    @classmethod
    def from_env(cls) -> "TelegramConfig | None":
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
        if not token or not chat:
            return None
        return cls(bot_token=token, chat_id=chat)


def is_enabled() -> bool:
    return TelegramConfig.from_env() is not None


def _api_call(method: str, payload: dict, token: str) -> dict:
    url = f"{API_BASE}/bot{token}/{method}"
    data = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        # The API returns a JSON error body with a "description" field.
        try:
            body = exc.read().decode("utf-8")
            parsed = json.loads(body)
            desc = parsed.get("description", body)
        except Exception:
            desc = str(exc)
        raise RuntimeError(f"Telegram {method} HTTP {exc.code}: {desc}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Telegram {method} network error: {exc}") from exc
    parsed = json.loads(body)
    if not parsed.get("ok"):
        raise RuntimeError(f"Telegram {method} returned ok=false: {parsed}")
    return parsed["result"]


def _build_message_url(chat_id: str, message_id: int) -> str | None:
    """Build a t.me/... URL when possible (public channels only)."""
    if chat_id.startswith("@"):
        return f"https://t.me/{chat_id[1:]}/{message_id}"
    return None


def post(page: Page, rendered_body: str, *, og_image_url: str | None = None) -> PostRecord:
    """Post `rendered_body` to Telegram and return a PostRecord."""
    cfg = TelegramConfig.from_env()
    if cfg is None:
        raise RuntimeError("Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)")
    payload = {
        "chat_id": cfg.chat_id,
        "parse_mode": "HTML",
        "disable_web_page_preview": "false",
    }
    if og_image_url:
        payload["photo"] = og_image_url
        payload["caption"] = rendered_body
        method = "sendPhoto"
    else:
        payload["text"] = rendered_body
        method = "sendMessage"
    result = _api_call(method, payload, cfg.bot_token)
    message_id = int(result["message_id"])
    post_id = f"{cfg.chat_id}/{message_id}"
    return PostRecord(
        post_id=post_id,
        url=_build_message_url(cfg.chat_id, message_id),
        posted_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
