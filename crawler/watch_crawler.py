#!/usr/bin/env python3
"""PTT post-reply watch crawler — checks watched articles for new replies."""

import asyncio
import os
import re
import time
import traceback

import httpx
from bs4 import BeautifulSoup
from shared import send_admin_alert

API_WORKER_URL = os.environ.get("API_WORKER_URL", "").rstrip("/")
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

CRAWL_MAX_RUNTIME = 4 * 3600

start_time = time.time()

INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}
PTT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Cookie": "over18=1",
    "Referer": "https://www.ptt.cc/bbs/index.html",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def parse_reply_count(html: str) -> int:
    """Count total push elements (推/→/噓) on a PTT article page."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        return len(soup.select(".push"))
    except Exception as e:
        print(f"  [Parser Error] {e}")
        return 0


async def fetch_article(client: httpx.AsyncClient, url: str) -> tuple[int | None, bool]:
    """
    Fetch a PTT article and return (reply_count, is_expired).
    is_expired=True when the article is gone (404 or non-200 after retries).
    """
    for attempt in range(3):
        try:
            resp = await client.get(url, headers=PTT_HEADERS, timeout=30)
            if resp.status_code == 404:
                return None, True
            if resp.status_code == 200:
                return parse_reply_count(resp.text), False
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", (attempt + 1) * 5))
                print(f"  Rate-limited (429). Waiting {wait}s...")
                await asyncio.sleep(wait)
                continue
            print(f"  Unexpected status {resp.status_code} for {url}")
            return None, False
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            if attempt == 2:
                print(f"  Connection error after 3 attempts: {repr(e)}")
                return None, False
            await asyncio.sleep((attempt + 1) * 2)
    return None, False


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0, http2=False) as client:
        if time.time() - start_time > CRAWL_MAX_RUNTIME:
            print("Max runtime exceeded, exiting")
            return

        # 1. Fetch all active watches
        try:
            resp = await client.get(
                f"{API_WORKER_URL}/internal/active-post-watches",
                headers=INTERNAL_HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
            watches = resp.json()
        except Exception as e:
            print(f"Error fetching active post watches: {e}")
            return

        if not watches:
            print("No active post watches, exiting")
            return

        print(f"Checking {len(watches)} watched article(s)…")

        results = []
        for watch in watches:
            article_id = watch["article_id"]
            article_url = watch["article_url"]
            last_count = watch["last_reply_count"] or 0
            user_id = watch["user_id"]
            board = watch["board"]

            print(f"  [{board}] {article_id} (last={last_count})")

            reply_count, is_expired = await fetch_article(client, article_url)

            if is_expired:
                print(f"  [{board}] {article_id} → expired (404)")
                results.append({
                    "user_id": user_id,
                    "article_id": article_id,
                    "new_reply_count": last_count,
                    "status": "expired",
                })
            elif reply_count is None:
                print(f"  [{board}] {article_id} → fetch error, skipping")
            elif reply_count > last_count:
                print(f"  [{board}] {article_id} → {last_count} → {reply_count} (new replies)")
                results.append({
                    "user_id": user_id,
                    "article_id": article_id,
                    "new_reply_count": reply_count,
                    "status": "active",
                    "notification": {
                        "board": board,
                        "article_title": watch.get("article_title"),
                        "article_url": article_url,
                    },
                })
            else:
                print(f"  [{board}] {article_id} → no change ({reply_count})")

            await asyncio.sleep(0.5)

        # 2. Post results
        if results:
            try:
                await client.post(
                    f"{API_WORKER_URL}/internal/post-watch-results",
                    json={"results": results},
                    headers=INTERNAL_HEADERS,
                    timeout=15,
                )
            except Exception as e:
                print(f"Error posting watch results: {e}")

        # 3. Mark queue job done
        try:
            await client.post(
                f"{API_WORKER_URL}/internal/post-watch-queue",
                json={},
                headers=INTERNAL_HEADERS,
                timeout=15,
            )
        except Exception as e:
            print(f"Error marking watch queue done: {e}")

        print(f"Done. Processed {len(results)} result(s).")


async def _run() -> None:
    if len(INTERNAL_SECRET) < 32:
        raise ValueError("INTERNAL_SECRET must be at least 32 characters")
    try:
        await main()
    except Exception as e:
        async with httpx.AsyncClient() as client:
            await send_admin_alert(client, "WatchCrawler", f"Watch crawler crashed: {repr(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(_run())
