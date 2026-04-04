#!/usr/bin/env python3
"""PTT board crawler — runs inside GitHub Actions, exits after CRAWL_MAX_RUNTIME."""

import asyncio
import os
import time
import re

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
    "Cookie": "over18=1"
}

def extract_article_id(href: str) -> str | None:
    """從 href 路徑提取文章 ID，例如 M.1234567890.A.ABC"""
    m = re.search(r"/(M\.\d+\.\w+\.\w+)\.html", href)
    return m.group(1) if m else None

def extract_timestamp(article_id: str) -> int:
    """從文章 ID 提取 Unix timestamp，例如 M.1774255579.A.130 → 1774255579"""
    m = re.match(r"M\.(\d+)\.", article_id)
    return int(m.group(1)) if m else 0

def parse_ptt_html(html: str) -> list[dict]:
    """Parse PTT board index HTML and return list of articles."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        articles = []
        
        # PTT 網頁版文章列表，我們只抓取一般文章區塊（r-list-sep 以上的內容）
        main_content = soup.select_one(".r-list-container") or soup
        for child in main_content.children:
            if child.name == "div" and "r-list-sep" in child.get("class", []):
                break # 遇到分隔線就停止，不抓取下方的置底公告
            
            if child.name == "div" and "r-ent" in child.get("class", []):
                ent = child
                title_el = ent.select_one(".title a")
                if not title_el:
                    continue # 跳過已刪除的文章
                
                href = title_el["href"]
                article_id = extract_article_id(href)
                if not article_id:
                    continue
                    
                nrec_el = ent.select_one(".nrec span")
                nrec_text = nrec_el.text if nrec_el else "0"
                
                # 處理推文數格式 ("爆", "X1", etc.)
                if nrec_text == "爆":
                    nrec = 100
                elif nrec_text.startswith("X"):
                    nrec = -10
                else:
                    try:
                        nrec = int(nrec_text) if nrec_text.isdigit() else 0
                    except ValueError:
                        nrec = 0
                        
                articles.append({
                    "id": article_id,
                    "title": title_el.text.strip(),
                    "url": f"https://www.ptt.cc{href}",
                    "replies": nrec,
                    "timestamp": extract_timestamp(article_id)
                })
            
        # PTT index.html 是由舊到新，我們將其反轉，讓最前面的文章是最新
        return list(reversed(articles))
    except Exception as e:
        print(f"  [Parser Error] {e}")
        return []

async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=CRAWL_JOB_TIMEOUT) as client:
        while True:
            # ── Time-limit guard ─────────────────────────────────────────────
            if time.time() - start_time > CRAWL_MAX_RUNTIME:
                print("Approaching time limit, exiting gracefully")
                break

            # ── 1. 獲取下一個待爬取的看板 ─────────────────────────────────────
            try:
                resp = await client.get(
                    f"{API_WORKER_URL}/internal/active-boards",
                    headers=INTERNAL_HEADERS,
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

            last_ts = extract_timestamp(last_article_id) if last_article_id else 0
            print(f"Crawling {board} (last_article_id={last_article_id}, ts={last_ts})…")

import traceback

# ... (中間代碼不變) ...

            try:
                # ── 2. 爬取 PTT HTML ─────────────────────────────────────────
                url = f"https://www.ptt.cc/bbs/{board}/index.html"
                print(f"  [{board}] Fetching: {url}")
                ptt_resp = await client.get(
                    url,
                    headers=PTT_HEADERS,
                )
                print(f"  [{board}] HTTP Status: {ptt_resp.status_code}")
                if ptt_resp.status_code != 200:
                    print(f"  [{board}] Response Body (first 500 chars): {ptt_resp.text[:500]}")
                ptt_resp.raise_for_status()
                
                # ── 3. 解析文章 ──────────────────────────────────────────────
                articles = parse_ptt_html(ptt_resp.text)
                if not articles:
                    print(f"  [{board}] 解析失敗或無文章，跳過")
                    continue
                print(f"  [{board}] 解析完成，取得 {len(articles)} 篇文章")

                # ── 4. 計算新文章 (比對 ID 或時間戳記) ─────────────────────────
                new_articles = []
                for a in articles:
                    if last_article_id is None:
                        # 首次爬取：僅更新狀態，不發送通知
                        break
                    
                    if a["id"] == last_article_id:
                        continue
                    
                    # 容錯：如果原 ID 被刪除，則比對時間戳記
                    if a["timestamp"] <= last_ts:
                        continue
                        
                    new_articles.append(a)
                
                if last_article_id is None:
                    print(f"  [{board}] 首次紀錄 (Snapshot 為空)，設定最新 ID={articles[0]['id']}，本次不發送通知")
                else:
                    print(f"  [{board}] 發現 {len(new_articles)} 篇新文章")
                    for na in new_articles:
                        print(f"    - [新文章] {na['id']} | {na['title']}")

                # 反轉回由舊到新，確保通知順序正確
                new_articles = list(reversed(new_articles))

                # ── 5. 更新看板快照 (最新文章 ID) ─────────────────────────────
                if articles:
                    await client.post(
                        f"{API_WORKER_URL}/internal/board-snapshot",
                        json={"board": board, "last_article_id": articles[0]["id"]},
                        headers=INTERNAL_HEADERS,
                    )

                # ── 6. 推送新文章通知 (每 50 筆一批) ──────────────────────────
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
                        batch = notifications[i:i+50]
                        push_resp = await client.post(
                            f"{API_WORKER_URL}/internal/queue",
                            json={"notifications": batch},
                            headers=INTERNAL_HEADERS,
                        )
                        push_resp.raise_for_status()
                        print(f"  已將 {len(batch)} 筆通知加入隊列 (API 回傳: {push_resp.json()})")

            except Exception as e:
                print(f"Error crawling {board}: {e}")

            # ── 7. 標記工作完成 ─────────────────────────────────────────────
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
