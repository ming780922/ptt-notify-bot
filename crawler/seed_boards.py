#!/usr/bin/env python3
import httpx
import sys
import time

def generate_sql():
    # 抓取 PTT 熱門看板 HTML 版本
    url = "https://www.ptt.cc/bbs/hotboards.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Cookie": "over18=1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8",
        "Referer": "https://www.ptt.cc/bbs/index.html"
    }

    print("Fetching popular boards from PTT (HTML mode)...", file=sys.stderr)
    
    # 使用字典進行去重，Key 為小寫看板名稱
    unique_boards = {}
    
    # 預填基礎看板
    essentials = [
        ("LifeIsMoney", "省錢"),
        ("Gossiping", "八卦"),
        ("Stock", "股票"),
        ("Baseball", "棒球"),
        ("NBA", "籃球"),
        ("movie", "電影"),
        ("Car", "汽車"),
        ("PC_Shopping", "電蝦"),
        ("iOS", "蘋果"),
        ("Gamesale", "二手遊戲"),
        ("HardwareSale", "硬體買賣"),
        ("C_Chat", "希洽"),
    ]
    for name, disp in essentials:
        unique_boards[name.lower()] = (name, disp)

    # 抓取熱門看板
    try:
        with httpx.Client(http2=False, timeout=30.0, follow_redirects=True) as client:
            for attempt in range(3):
                try:
                    resp = client.get(url, headers=headers)
                    resp.raise_for_status()
                    
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for ent in soup.select(".b-ent"):
                        name_el = ent.select_one(".board-name")
                        title_el = ent.select_one(".board-title")
                        if name_el and title_el:
                            name = name_el.text.strip()
                            title = title_el.text.strip()
                            # 只有在還沒看過這個看板時才加入
                            if name.lower() not in unique_boards:
                                unique_boards[name.lower()] = (name, title)
                    break
                except Exception as e:
                    if attempt == 2: raise
                    print(f"Attempt {attempt+1} failed: {e}. Retrying...", file=sys.stderr)
                    time.sleep(2)
    except Exception as e:
        print(f"Final Error: {e}", file=sys.stderr)
        return

    # 使用 INSERT OR IGNORE 確保不與資料庫現有資料衝突
    sql_lines = [
        "-- PTT Popular Boards Seed SQL",
        "INSERT OR IGNORE INTO boards (name, display_name, is_popular, is_verified) VALUES"
    ]

    entries = []
    # 依照名稱排序
    sorted_keys = sorted(unique_boards.keys())
    for key in sorted_keys:
        name, title = unique_boards[key]
        safe_title = title.replace("'", "''")
        entries.append(f"('{name}', '{safe_title}', 1, 1)")

    sql_lines.append(",\n".join(entries) + ";")
    
    with open("seed_boards.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))
    
    print(f"Successfully generated seed_boards.sql with {len(entries)} UNIQUE boards!", file=sys.stderr)

if __name__ == "__main__":
    generate_sql()
