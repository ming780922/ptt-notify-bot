#!/usr/bin/env python3
"""PTT board crawler — runs inside GitHub Actions, exits after CRAWL_MAX_RUNTIME."""

import asyncio
import os
import time

import httpx

API_WORKER_URL = os.environ["API_WORKER_URL"].rstrip("/")
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]

CRAWL_MAX_RUNTIME = 4 * 3600   # 4 hours, hard ceiling
CRAWL_JOB_TIMEOUT = 30         # seconds per PTT request

start_time = time.time()

INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}
PTT_HEADERS = {"Cookie": "over18=1"}


async def main() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            # ── Time-limit guard ─────────────────────────────────────────────
            if time.time() - start_time > CRAWL_MAX_RUNTIME:
                print("Approaching time limit, exiting gracefully")
                break

            # ── 1. Fetch next pending board from crawl_queue ─────────────���───
            try:
                resp = await client.get(
                    f"{API_WORKER_URL}/internal/active-boards",
                    headers=INTERNAL_HEADERS,
                    timeout=15,
                )
                resp.raise_for_status()
                boards = resp.json()
            except Exception as e:
                print(f"Error fetching active-boards: {e}")
                break

            if not boards:
                print("No pending boards, exiting")
                break

            board_data = boards[0]
            board: str = board_data["board"]
            last_article_id: str | None = board_data["last_article_id"]
            subscribers: list[dict] = board_data["subscribers"]

            print(f"Crawling {board} (last_article_id={last_article_id})…")

            try:
                # ── 2. Fetch PTT index.json ───────────────────────────────────
                ptt_resp = await client.get(
                    f"https://www.ptt.cc/bbs/{board}/index.json",
                    headers=PTT_HEADERS,
                    timeout=CRAWL_JOB_TIMEOUT,
                )
                ptt_resp.raise_for_status()
                raw_articles: list[dict] = ptt_resp.json()

                articles = [
                    {
                        "id": a["aid"],
                        "title": a["title"],
                        "url": f"https://www.ptt.cc{a['href']}",
                        "replies": (
                            int(a["nrec"])
                            if str(a.get("nrec", "0")).lstrip("-").isdigit()
                            else 0
                        ),
                    }
                    for a in raw_articles
                    if a.get("aid")
                ]

                # ── 3. Compute new articles since last_article_id ────────────
                # PTT returns newest-first; stop when we hit last_article_id.
                if last_article_id is None:
                    # First crawl: only seed the snapshot, no notifications
                    new_articles: list[dict] = []
                else:
                    new_articles = []
                    for a in articles:
                        if a["id"] == last_article_id:
                            break
                        new_articles.append(a)
                    # Reverse to oldest-first order
                    new_articles = list(reversed(new_articles))

                print(f"  {len(new_articles)} new article(s) for {board}")

                # ── 4. Update board_snapshot ─────────────────────────────────
                if articles:
                    await client.post(
                        f"{API_WORKER_URL}/internal/board-snapshot",
                        json={"board": board, "last_article_id": articles[0]["id"]},
                        headers=INTERNAL_HEADERS,
                        timeout=15,
                    )

                # ── 5. Enqueue pending_notifications (batches of 50) ─────────
                if new_articles and subscribers:
                    notifications = [
                        {
                            "user_id": sub["user_id"],
                            "board": board,
                            "article_id": article["id"],
                            "article_title": article["title"],
                            "article_url": article["url"],
                            "article_replies": article["replies"],
                            "board_rank": sub["board_rank"],
                        }
                        for sub in subscribers
                        for article in new_articles
                    ]
                    for i in range(0, len(notifications), 50):
                        await client.post(
                            f"{API_WORKER_URL}/internal/queue",
                            json={"notifications": notifications[i : i + 50]},
                            headers=INTERNAL_HEADERS,
                            timeout=15,
                        )

            except Exception as e:
                print(f"Error crawling {board}: {e}")

            # ── 6. Mark job done (always, to prevent queue lock-up) ──────────
            try:
                await client.post(
                    f"{API_WORKER_URL}/internal/board-snapshot",
                    json={"board": board, "mark_done": True},
                    headers=INTERNAL_HEADERS,
                    timeout=15,
                )
            except Exception as e:
                print(f"Error marking {board} done: {e}")

            await asyncio.sleep(0.5)


if __name__ == "__main__":
    asyncio.run(main())
