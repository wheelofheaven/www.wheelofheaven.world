#!/usr/bin/env python3
"""Check sitemap destinations locally or over HTTP; write a reviewable JSON report.

Uses only the Python standard library. HTTP mode makes GET requests with bounded
concurrency; it does not impersonate Googlebot or establish Google index status.
"""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.head = False
        self.title = False
        self.titles = []
        self.canonicals = []
        self.robots = []
        self.description = ""
        self.links = set()
        self.h1_count = 0
        self.refresh = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "head":
            self.head = True
        if tag == "meta" and attrs.get("http-equiv", "").lower() == "refresh":
            self.refresh = True
        if self.head:
            if tag == "title":
                self.title = True
            if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
                self.canonicals.append(attrs.get("href", ""))
            if tag == "meta":
                name = attrs.get("name", "").lower()
                if name in ("robots", "googlebot"):
                    self.robots.append(attrs.get("content", ""))
                if name == "description":
                    self.description = attrs.get("content", "")
        if tag == "a" and attrs.get("href"):
            self.links.add(attrs["href"])
        if tag == "h1":
            self.h1_count += 1

    def handle_endtag(self, tag):
        if tag == "head":
            self.head = False
        if tag == "title":
            self.title = False

    def handle_data(self, data):
        if self.title:
            self.titles.append(data)


def fetch(url):
    request = Request(url, headers={"User-Agent": "WheelOfHeaven-SitemapAudit/1.0"})
    try:
        response = urlopen(request, timeout=30)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.url, response.headers, response.read()


def audit(url, build_dir):
    result = {"url": url, "issues": []}
    try:
        if build_dir:
            path = build_dir / unquote(urlsplit(url).path).lstrip("/")
            if path.is_dir():
                path /= "index.html"
            status, final, headers, body = 200, url, {}, path.read_bytes()
        else:
            status, final, headers, body = fetch(url)
        result.update(status=status, final_url=final)
        if status != 200:
            result["issues"].append(f"http_{status}")
        if final != url:
            result["issues"].append("redirect")
        page = Page()
        page.feed(body.decode("utf-8", errors="replace"))
        if page.refresh:
            result["issues"].append("html_redirect")
        robots = page.robots + [headers.get("X-Robots-Tag", "")]
        if any(re.search(r"\b(noindex|none)\b", directive, re.I) for directive in robots):
            result["issues"].append("noindex")
        if page.canonicals != [url]:
            result["issues"].append("canonical_mismatch")
        result.update(title="".join(page.titles).strip(), description=page.description,
                      canonicals=page.canonicals, robots=robots, h1_count=page.h1_count,
                      links=sorted({urljoin(final, link).split("#")[0] for link in page.links}))
        if not result["title"]:
            result["issues"].append("missing_title")
        if not page.description:
            result["issues"].append("missing_description")
    except (OSError, ValueError) as error:
        result["issues"].append("fetch_error")
        result["error"] = str(error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sitemap", default="https://www.wheelofheaven.world/sitemap.xml")
    parser.add_argument("--build-dir", type=Path, help="Check generated files instead of HTTP")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    xml = fetch(args.sitemap)[3] if args.sitemap.startswith("https://") else Path(args.sitemap).read_bytes()
    urls = [node.text for node in ET.fromstring(xml).findall("{*}url/{*}loc")]
    if not urls:
        raise SystemExit("Expected a nonempty URL sitemap, not a sitemap index")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        pages = list(pool.map(lambda url: audit(url, args.build_dir), urls))
    incoming = Counter(link for page in pages for link in page.get("links", []) if link != page["url"])
    for page in pages:
        page["incoming_from_submitted_pages"] = incoming[page["url"]]
    counts = Counter(issue for page in pages for issue in page["issues"])
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "sitemap": args.sitemap,
              "mode": "local" if args.build_dir else "http", "url_count": len(urls),
              "duplicate_urls": len(urls) - len(set(urls)), "issues": dict(counts), "pages": pages}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "pages"}, indent=2))
    raise SystemExit(1 if counts or report["duplicate_urls"] else 0)


if __name__ == "__main__":
    main()
