"""
Twitter / X adapter — OAuth 1.0a user-context, POST /2/tweets, text-only.

Free tier doesn't allow API media upload; we rely on Twitter Cards
auto-unfurling the page's `<meta name="twitter:card">` tags into a
link preview with the OG image. Trade-off documented at
https://docs.wheelofheaven.world/contributing/dev/social-broadcast/#twitter-x-phase-2.

Auth: OAuth 1.0a, not OAuth 2.0 PKCE — chosen deliberately to avoid
the rotating-refresh-token dance. The four credentials are static
(rotate manually if/when needed):

  TWITTER_API_KEY              — "Consumer Key" in the Developer Portal
  TWITTER_API_SECRET           — "Consumer Secret"
  TWITTER_ACCESS_TOKEN         — generated under Keys & tokens
  TWITTER_ACCESS_TOKEN_SECRET  — generated under Keys & tokens

Optional:

  TWITTER_USERNAME             — used only to build the post URL
                                 (https://x.com/{username}/status/{id});
                                 falls back to /i/web/status/{id} if unset
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets as _secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from .discover import Page
from .state import PostRecord

API_URL = "https://api.x.com/2/tweets"
TIMEOUT_SECS = 20

CHANNEL = "twitter"


@dataclass
class TwitterConfig:
    api_key: str
    api_secret: str
    access_token: str
    access_token_secret: str
    username: str | None  # optional, for nicer post URLs

    @classmethod
    def from_env(cls) -> "TwitterConfig | None":
        required = {
            "TWITTER_API_KEY": os.environ.get("TWITTER_API_KEY", "").strip(),
            "TWITTER_API_SECRET": os.environ.get("TWITTER_API_SECRET", "").strip(),
            "TWITTER_ACCESS_TOKEN": os.environ.get("TWITTER_ACCESS_TOKEN", "").strip(),
            "TWITTER_ACCESS_TOKEN_SECRET": os.environ.get("TWITTER_ACCESS_TOKEN_SECRET", "").strip(),
        }
        if not all(required.values()):
            return None
        return cls(
            api_key=required["TWITTER_API_KEY"],
            api_secret=required["TWITTER_API_SECRET"],
            access_token=required["TWITTER_ACCESS_TOKEN"],
            access_token_secret=required["TWITTER_ACCESS_TOKEN_SECRET"],
            username=os.environ.get("TWITTER_USERNAME", "").strip() or None,
        )


def is_enabled() -> bool:
    return TwitterConfig.from_env() is not None


def _percent_encode(s: str) -> str:
    """RFC 3986 percent-encoding — unreserved set is A-Z a-z 0-9 - . _ ~."""
    return urllib.parse.quote(s, safe="-._~")


def _build_oauth_header(method: str, url: str, cfg: TwitterConfig) -> str:
    """
    Compute the OAuth 1.0a Authorization header for a request.

    For POST /2/tweets with a JSON body, the body is NOT included in
    the signature base string (Twitter's v2 + OAuth 1.0a convention).
    Only the OAuth params themselves get signed.
    """
    oauth = {
        "oauth_consumer_key": cfg.api_key,
        "oauth_nonce": _secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": cfg.access_token,
        "oauth_version": "1.0",
    }

    param_string = "&".join(
        f"{_percent_encode(k)}={_percent_encode(v)}"
        for k, v in sorted(oauth.items())
    )
    base_string = "&".join([
        method.upper(),
        _percent_encode(url),
        _percent_encode(param_string),
    ])
    signing_key = "&".join([
        _percent_encode(cfg.api_secret),
        _percent_encode(cfg.access_token_secret),
    ])
    signature = base64.b64encode(
        hmac.new(signing_key.encode("utf-8"), base_string.encode("utf-8"), hashlib.sha1).digest()
    ).decode("ascii")
    oauth["oauth_signature"] = signature

    return "OAuth " + ", ".join(
        f'{_percent_encode(k)}="{_percent_encode(v)}"'
        for k, v in sorted(oauth.items())
    )


def _post_url(cfg: TwitterConfig, tweet_id: str) -> str:
    if cfg.username:
        return f"https://x.com/{cfg.username}/status/{tweet_id}"
    return f"https://x.com/i/web/status/{tweet_id}"


def post(page: Page, rendered_body: str, *, og_image_url: str | None = None) -> PostRecord:
    """
    Post `rendered_body` to Twitter/X via OAuth 1.0a user context and
    return a PostRecord.

    `og_image_url` is accepted for interface uniformity with telegram
    but ignored — Free tier doesn't permit API media upload. Twitter
    Cards auto-unfurl the page's OG image from the link in the body.
    """
    cfg = TwitterConfig.from_env()
    if cfg is None:
        raise RuntimeError(
            "Twitter is not configured (TWITTER_API_KEY / TWITTER_API_SECRET / "
            "TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET missing)"
        )

    body = json.dumps({"text": rendered_body}).encode("utf-8")
    auth_header = _build_oauth_header("POST", API_URL, cfg)
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "User-Agent": "wheelofheaven-broadcast/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            parsed_err = json.loads(err_body)
            # Twitter v2 errors live in .detail / .title / .errors[]
            detail = (
                parsed_err.get("detail")
                or parsed_err.get("title")
                or err_body
            )
        except Exception:
            detail = str(exc)
        raise RuntimeError(f"Twitter POST /2/tweets HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Twitter POST /2/tweets network error: {exc}") from exc

    parsed = json.loads(raw)
    data = parsed.get("data") or {}
    tweet_id = data.get("id")
    if not tweet_id:
        raise RuntimeError(f"Twitter POST /2/tweets returned no id: {parsed}")

    return PostRecord(
        post_id=str(tweet_id),
        url=_post_url(cfg, str(tweet_id)),
        posted_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
