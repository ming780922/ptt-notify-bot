#!/usr/bin/env python3
import httpx
import sys
import time

def generate_fix_sql():
    # 抓取熱門看板 HTML 版本 (比 JSON 更穩定)
    url = "https://www.ptt.cc/bbs/hotboards.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Cookie": "over18=1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Referer": "https://www.ptt.cc/bbs/index.html"
    }

    print("Fetching top popular boards from PTT (HTML mode)...", file=sys.stderr)
    
    top_50 = []
    
    # 使用 HTTP/1.1 並增加重試
    try:
        with httpx.Client(http2=False, timeout=30.0, follow_redirects=True) as client:
            for attempt in range(3):
                try:
                    resp = client.get(url, headers=headers)
                    resp.raise_for_status()
                    
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(resp.text, "html.parser")
                    # 我們只抓取前 50 個
                    for ent in soup.select(".b-ent")[:50]:
                        name_el = ent.select_one(".board-name")
                        if name_el:
                            top_50.append(name_el.text.strip())
                    break
                except Exception as e:
                    if attempt == 2: raise
                    print(f"Attempt {attempt+1} failed: {e}. Retrying...", file=sys.stderr)
                    time.sleep(2)
    except Exception as e:
        print(f"Final Error: {e}", file=sys.stderr)
        return

    if not top_50:
        print("Error: No boards found.", file=sys.stderr)
        return

    names_str = ", ".join([f"'{n}'" for n in top_50])

    sql_lines = [
        "-- Reset all popular status",
        "UPDATE boards SET is_popular = 0;",
        "",
        "-- Set top 50 boards as popular",
        f"UPDATE boards SET is_popular = 1 WHERE name IN ({names_str});"
    ]

    with open("fix_popular.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))
    
    print(f"Successfully generated fix_popular.sql with {len(top_50)} boards!", file=sys.stderr)

if __name__ == "__main__":
    generate_fix_sql()
