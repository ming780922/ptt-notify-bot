#!/usr/bin/env python3
"""PTT board crawler — runs inside GitHub Actions, exits after CRAWL_MAX_RUNTIME."""

import asyncio
import os
import time
import re
import traceback

import httpx
from bs4 import BeautifulSoup

API_WORKER_URL = os.environ["API_WORKER_URL"].rstrip("/")
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]

CRAWL_MAX_RUNTIME = 4 * 3600   # 4 hours, hard ceiling
CRAWL_JOB_TIMEOUT = 30         # seconds per PTT request

start_time = time.time()

INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}
PTT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Cookie": "over18=1",
    "Referer": "https://www.ptt.cc/bbs/index.html",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
}

def extract_article_id(href: str) -> str | None:
    """從 href 路徑提取文章 ID"""
    m = re.search(r"/(M\.\d+\.\w+\.\w+)\.html", href)
    return m.group(1) if m else None

def extract_timestamp(article_id: str) -> int:
    """從文章 ID 提取 Unix timestamp"""
    m = re.match(r"M\.(\d+)\.", article_id)
    return int(m.group(1)) if m else 0

def parse_ptt_html(html: str) -> list[dict]:
    """Parse PTT board index HTML and return list of articles."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        articles = []
        main_content = soup.select_one(".r-list-container") or soup
        for child in main_content.children:
            if child.name == "div" and "r-list-sep" in child.get("class", []):
                break
            if child.name == "div" and "r-ent" in child.get("class", []):
                ent = child
                title_el = ent.select_one(".title a")
                if not title_el: continue
                
                href = title_el["href"]
                article_id = extract_article_id(href)
                if not article_id: continue
                    
                nrec_el = ent.select_one(".nrec span")
                nrec_text = nrec_el.text if nrec_el else "0"
                if nrec_text == "爆": nrec = 100
                elif nrec_text.startswith("X"): nrec = -10
                else:
                    try: nrec = int(nrec_text) if nrec_text.isdigit() else 0
                    except: nrec = 0
                        
                articles.append({
                    "id": article_id,
                    "title": title_el.text.strip(),
                    "url": f"https://www.ptt.cc{href}",
                    "replies": nrec,
                    "timestamp": extract_timestamp(article_id)
                })
        return list(reversed(articles))
    except Exception as e:
        print(f"  [Parser Error] {e}")
        return []

async def fetch_ptt_with_retry(client, board, max_retries=3):
    url = f"https://www.ptt.cc/bbs/{board}/index.html"
    for i in range(max_retries):
        try:
            print(f"  [{board}] Fetching (Attempt {i+1}): {url}")
            resp = await client.get(url, headers=PTT_HEADERS)
            resp.raise_for_status()
            return resp
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.RemoteProtocolError) as e:
            if i == max_retries - 1:
                raise
            wait = (i + 1) * 2
            print(f"  [{board}] Connection error: {repr(e)}. Retrying in {wait}s...")
            await asyncio.sleep(wait)
    return None

async def main() -> None:
    # 增加 timeout 到 60 秒，並明確設定為 HTTP/1.1 避免某些環境下的 H2 問題
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0, http2=False) as client:
        while True:
            if time.time() - start_time > CRAWL_MAX_RUNTIME:
                break

            try:
                resp = await client.get(f"{API_WORKER_URL}/internal/active-boards", headers=INTERNAL_HEADERS)
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
            last_ts = extract_timestamp(last_article_id) if last_article_id else 0
            
            print(f"Crawling {board} (last_article_id={last_article_id}, ts={last_ts})…")

            try:
                ptt_resp = await fetch_ptt_with_retry(client, board)
                print(f"  [{board}] HTTP Status: {ptt_resp.status_code}")
                
                articles = parse_ptt_html(ptt_resp.text)
                if not articles:
                    print(f"  [{board}] 解析失敗或無文章，跳過")
                    continue
                
                new_articles = []
                for a in articles:
                    if last_article_id is None: break
                    if a["id"] == last_article_id: continue
                    if a["timestamp"] <= last_ts: continue
                    new_articles.append(a)
                
                if last_article_id is None:
                    print(f"  [{board}] 首次紀錄，ID={articles[0]['id']}")
                else:
                    print(f"  [{board}] 發現 {len(new_articles)} 篇新文章")

                new_articles = list(reversed(new_articles))

                if articles:
                    await client.post(
                        f"{API_WORKER_URL}/internal/board-snapshot",
                        json={"board": board, "last_article_id": articles[0]["id"]},
                        headers=INTERNAL_HEADERS,
                    )

                if new_articles and subscribers:
                    notifications = []
                    for sub in subscribers:
                        keywords = sub.get("keywords") or []
                        for article in new_articles:
                            if keywords and not any(
                                kw.lower() in article["title"].lower() for kw in keywords
                            ):
                                continue
                            notifications.append({
                                "user_id": sub["user_id"], "board": board,
                                "article_id": article["id"], "article_title": article["title"],
                                "article_url": article["url"], "article_replies": article["replies"],
                                "board_rank": sub["board_rank"],
                            })
                    for i in range(0, len(notifications), 50):
                        batch = notifications[i:i+50]
                        await client.post(
                            f"{API_WORKER_URL}/internal/queue",
                            json={"notifications": batch},
                            headers=INTERNAL_HEADERS,
                        )

            except Exception as e:
                print(f"Error crawling {board}: {repr(e)}")
                traceback.print_exc()

            try:
                await client.post(
                    f"{API_WORKER_URL}/internal/board-snapshot",
                    json={"board": board, "mark_done": True},
                    headers=INTERNAL_HEADERS,
                )
            except Exception as e:
                print(f"Error marking {board} done: {e}")

            await asyncio.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(main())
