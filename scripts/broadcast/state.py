"""
State file management for the broadcaster.

Layout documented at
https://docs.wheelofheaven.world/contributing/dev/social-broadcast/#state-model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

CURRENT_VERSION = 1


@dataclass
class PostRecord:
    post_id: str
    url: str | None
    posted_at: str  # ISO 8601 UTC

    def to_dict(self) -> dict:
        return {"post_id": self.post_id, "url": self.url, "posted_at": self.posted_at}

    @staticmethod
    def manual_skip() -> "PostRecord":
        return PostRecord(
            post_id="manual_skip",
            url=None,
            posted_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )


class State:
    def __init__(self, path: Path):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.data = {"version": CURRENT_VERSION, "entries": {}}
        if self.data.get("version") != CURRENT_VERSION:
            raise SystemExit(
                f"unsupported state file version {self.data.get('version')!r} "
                f"in {path}; expected {CURRENT_VERSION}"
            )

    def get_channel(self, slug: str, channel: str) -> dict | None:
        entry = self.data["entries"].get(slug)
        if not entry:
            return None
        return entry.get("channels", {}).get(channel)

    def has_been_posted(self, slug: str, channel: str) -> bool:
        return self.get_channel(slug, channel) is not None

    def ensure_entry(self, slug: str, title: str, permalink: str) -> dict:
        entries = self.data["entries"]
        if slug not in entries:
            entries[slug] = {
                "title": title,
                "permalink": permalink,
                "first_eligible_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "channels": {},
            }
        else:
            # Keep metadata fresh — title/permalink may legitimately change.
            entries[slug]["title"] = title
            entries[slug]["permalink"] = permalink
        return entries[slug]

    def record_post(self, slug: str, title: str, permalink: str, channel: str, record: PostRecord) -> None:
        entry = self.ensure_entry(slug, title, permalink)
        entry.setdefault("channels", {})[channel] = record.to_dict()

    def mark_manual_skip(self, slug: str, title: str, permalink: str, channel: str) -> None:
        self.record_post(slug, title, permalink, channel, PostRecord.manual_skip())

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Sort entries by slug for stable diffs.
        sorted_entries = dict(sorted(self.data["entries"].items()))
        payload = {"version": CURRENT_VERSION, "entries": sorted_entries}
        self.path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
