"""
Bluesky adapter — AT Protocol via the user's PDS (bsky.social by default).

Auth is **app-password**, not OAuth: user generates an app password
in Bluesky Settings → App Passwords, the adapter trades
handle + app password for an `accessJwt` via
`com.atproto.server.createSession` at the start of every run.

Posts use `app.bsky.embed.external` for a card-style preview:
title + description + URL + uploaded OG thumb. The post body text
itself contains only the title + summary (no URL), which keeps it
short and lets the embed card own the link presentation.

Env:

  BLUESKY_HANDLE         — e.g. wheelofheaven.bsky.social, or a custom
                           domain like wheelofheaven.world
  BLUESKY_APP_PASSWORD   — from Settings → App Passwords (NOT the
                           account password — app passwords are scoped
                           and revocable)
  BLUESKY_PDS            — optional, defaults to https://bsky.social
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

TIMEOUT_SECS = 30
DEFAULT_PDS = "https://bsky.social"
CHANNEL = "bluesky"

# 1MB blob upload limit on Bluesky; our OG cards are ~100-125KB.
MAX_THUMB_BYTES = 1_000_000


@dataclass
class BlueskyConfig:
    handle: str
    app_password: str
    pds: str

    @classmethod
    def from_env(cls) -> "BlueskyConfig | None":
        handle = os.environ.get("BLUESKY_HANDLE", "").strip()
        password = os.environ.get("BLUESKY_APP_PASSWORD", "").strip()
        if not handle or not password:
            return None
        pds = os.environ.get("BLUESKY_PDS", "").strip() or DEFAULT_PDS
        return cls(handle=handle, app_password=password, pds=pds.rstrip("/"))


def is_enabled() -> bool:
    return BlueskyConfig.from_env() is not None


def _post_json(url: str, body: dict, *, headers: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json", **(headers or {})}
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            parsed = json.loads(err_body)
            detail = parsed.get("message") or parsed.get("error") or err_body
        except Exception:
            detail = str(exc)
        raise RuntimeError(f"Bluesky {url} HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Bluesky {url} network error: {exc}") from exc


def _create_session(cfg: BlueskyConfig) -> dict:
    return _post_json(
        f"{cfg.pds}/xrpc/com.atproto.server.createSession",
        {"identifier": cfg.handle, "password": cfg.app_password},
    )


def _fetch_thumb_bytes(og_image_url: str) -> tuple[bytes, str] | None:
    """
    Fetch the OG image and return (bytes, content_type) or None on failure.
    Returns None if the image is missing, too large, or not an image.
    """
    try:
        req = urllib.request.Request(og_image_url, method="GET")
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                return None
            data = resp.read(MAX_THUMB_BYTES + 1)
            if len(data) > MAX_THUMB_BYTES:
                return None
            return data, content_type
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None


def _upload_blob(cfg: BlueskyConfig, access_jwt: str, blob_bytes: bytes, content_type: str) -> dict:
    """Upload bytes to the user's blob store; return the blob ref."""
    req = urllib.request.Request(
        f"{cfg.pds}/xrpc/com.atproto.repo.uploadBlob",
        data=blob_bytes,
        headers={
            "Authorization": f"Bearer {access_jwt}",
            "Content-Type": content_type,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
            return parsed["blob"]
    except urllib.error.HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            parsed = json.loads(err_body)
            detail = parsed.get("message") or parsed.get("error") or err_body
        except Exception:
            detail = str(exc)
        raise RuntimeError(f"Bluesky uploadBlob HTTP {exc.code}: {detail}") from exc


def _bsky_post_url(handle: str, at_uri: str) -> str:
    """Convert at://did:.../app.bsky.feed.post/{rkey} → https://bsky.app/profile/{handle}/post/{rkey}."""
    rkey = at_uri.rsplit("/", 1)[-1]
    return f"https://bsky.app/profile/{handle}/post/{rkey}"


def post(page: Page, rendered_body: str, *, og_image_url: str | None = None) -> PostRecord:
    """Post to Bluesky as a card-style external embed."""
    cfg = BlueskyConfig.from_env()
    if cfg is None:
        raise RuntimeError(
            "Bluesky is not configured (BLUESKY_HANDLE / BLUESKY_APP_PASSWORD missing)"
        )

    session = _create_session(cfg)
    access_jwt = session["accessJwt"]
    did = session["did"]

    # Build the embed card. Title/description/uri are required.
    summary = (page.summary or page.title).strip()
    external = {
        "uri": page.permalink,
        "title": page.title.strip(),
        "description": summary[:280],  # Bluesky truncates anyway; cap to a reasonable length
    }

    # Try to attach a thumb. Best-effort — if it fails, post without thumb.
    if og_image_url:
        thumb_data = _fetch_thumb_bytes(og_image_url)
        if thumb_data is not None:
            blob_bytes, content_type = thumb_data
            blob = _upload_blob(cfg, access_jwt, blob_bytes, content_type)
            external["thumb"] = blob

    record = {
        "$type": "app.bsky.feed.post",
        "text": rendered_body,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "embed": {
            "$type": "app.bsky.embed.external",
            "external": external,
        },
    }

    result = _post_json(
        f"{cfg.pds}/xrpc/com.atproto.repo.createRecord",
        {
            "repo": did,
            "collection": "app.bsky.feed.post",
            "record": record,
        },
        headers={"Authorization": f"Bearer {access_jwt}"},
    )

    at_uri = result["uri"]
    return PostRecord(
        post_id=at_uri,
        url=_bsky_post_url(cfg.handle, at_uri),
        posted_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
