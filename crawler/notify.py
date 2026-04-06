#!/usr/bin/env python3
"""PTT notification dispatcher — sends Telegram messages for pending notifications."""

import asyncio
import datetime
import html
import json
import os
import re
import time

import httpx

API_WORKER_URL = os.environ["API_WORKER_URL"].rstrip("/")
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
MINIAPP_URL = os.environ["MINIAPP_URL"].rstrip("/")

if not MINIAPP_URL.startswith("https://"):
    raise ValueError(f"MINIAPP_URL must be an https URL, got: {MINIAPP_URL!r}")

FREE_BOARDS_LIMIT = 2

TG_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}


# ── Telegram helpers ──────────────────────────────────────────────────────────

async def send_message(client: httpx.AsyncClient, chat_id: int, text: str, keyboard: list) -> None:
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": keyboard},
    }
    resp = await client.post(f"{TG_API}/sendMessage", json=payload, timeout=15)
    if not resp.is_success:
        print(f"  [Telegram] {resp.status_code}: {resp.text}")
    resp.raise_for_status()


TW_TZ = datetime.timezone(datetime.timedelta(hours=8))

def format_article_time(article_id: str) -> str:
    """從 article_id (M.{unix_ts}.A.xxx) 提取並格式化台灣時間"""
    m = re.match(r"M\.(\d+)\.", article_id or "")
    if not m:
        return ""
    dt = datetime.datetime.fromtimestamp(int(m.group(1)), tz=TW_TZ)
    return dt.strftime("%m/%d %H:%M")


def build_board_groups(notifications: list[dict], user_id: int) -> tuple[list[str], list[str]]:
    """從批次通知中分類看板，回傳 (free_boards, affected_boards)，各自依 board_rank 排序"""
    free: dict[str, int] = {}
    affected: dict[str, int] = {}
    for item in notifications:
        if item.get("user_id") != user_id:
            continue
        rank = item.get("board_rank") or 1
        board = item.get("board", "")
        if not board:
            continue
        if rank <= FREE_BOARDS_LIMIT:
            free.setdefault(board, rank)
        else:
            affected.setdefault(board, rank)
    free_boards     = sorted(free,     key=lambda b: free[b])
    affected_boards = sorted(affected, key=lambda b: affected[b])
    return free_boards, affected_boards


def format_affected_str(boards: list[str]) -> str:
    if not boards:
        return "部分看板"
    if len(boards) <= 2:
        return "、".join(boards)
    return f"{'、'.join(boards[:2])} 等 {len(boards)} 個看板"


def miniapp_button(label: str, action: str = None) -> dict:
    url = MINIAPP_URL
    if action:
        url += f"?action={action}"
    return {"text": label, "web_app": {"url": url}}


# ── Keyword highlight ─────────────────────────────────────────────────────────

def highlight_keywords(title: str, keywords: list[str]) -> str:
    """Bold-highlight matched keywords in title; HTML-escapes all other parts."""
    if not keywords or not title:
        return html.escape(title)
    pattern = re.compile(
        '(' + '|'.join(re.escape(kw) for kw in keywords) + ')',
        re.IGNORECASE,
    )
    parts = pattern.split(title)
    result = []
    for i, part in enumerate(parts):
        if i % 2 == 1:  # captured group = matched keyword
            result.append(f'<b><u>{html.escape(part)}</u></b>')
        else:
            result.append(html.escape(part))
    return ''.join(result)


# ── Notification senders ──────────────────────────────────────────────────────

async def send_full_notification(
    client: httpx.AsyncClient,
    n: dict,
) -> None:
    keywords = json.loads(n.get('keywords') or '[]')
    raw_title = n['article_title'] or ''
    title = highlight_keywords(raw_title, keywords)
    article_url = n.get("article_url") or ""
    pub_time = format_article_time(n.get("article_id", ""))

    text = f"📋 <b>{html.escape(n['board'])}</b> 新文章\n{title}"
    if pub_time:
        text += f"\n🕐 {pub_time}"
    if article_url:
        text += f"\n{article_url}"
    await send_message(client, n["user_id"], text, [])


async def send_hidden_notification(client: httpx.AsyncClient, n: dict) -> None:
    text = (
        f"📋 <b>{html.escape(n['board'])}</b> 有新文章\n"
        f"完整內容已隱藏\n"
        f"觀看廣告啟用完整通知功能 24 小時。"
    )
    keyboard = [[miniapp_button("🎬 解鎖完整通知功能", "unlock")]]
    await send_message(client, n["user_id"], text, keyboard)


async def send_expiry_notice(
    client: httpx.AsyncClient,
    n: dict,
    free_boards: list[str],
    affected_boards: list[str],
) -> None:
    affected_str = format_affected_str(affected_boards)
    free_str = "、".join(free_boards) if free_boards else f"前 {FREE_BOARDS_LIMIT} 個訂閱看板"
    text = (
        f"⏰ <b>完整通知功能已到期</b>\n"
        f"{html.escape(affected_str)}已無法收到完整通知\n"
        f"{html.escape(free_str)} 訂閱不受影響\n"
        f"觀看廣告啟用完整通知功能 24 小時。"
    )
    keyboard = [[miniapp_button("🎬 解鎖完整通知功能", "unlock")]]
    await send_message(client, n["user_id"], text, keyboard)


# ── Main loop ─────────────────────────────────────────────────────────────────

async def main() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            # 1. Fetch a batch of pending notifications
            try:
                resp = await client.get(
                    f"{API_WORKER_URL}/internal/pending-notifications",
                    headers=INTERNAL_HEADERS,
                    timeout=15,
                )
                resp.raise_for_status()
                notifications = resp.json()
            except Exception as e:
                print(f"Error fetching pending notifications: {e}")
                break

            if not notifications:
                print("No pending notifications, exiting")
                break

            print(f"Processing {len(notifications)} notification(s)…")
            updates: list[dict] = []
            sent_expiry_this_run = False # 確保本次執行只發送一次提醒

            for n in notifications:
                board_rank: int = n.get("board_rank") or 1
                ad_unlocked_at: int = n.get("ad_unlocked_at") or 0
                expiry_notified: int = n.get("expiry_notified") or 0
                is_unlocked = (time.time() - ad_unlocked_at) < 86400
                
                print(f"  [Debug] ID: {n['id']}, Rank: {board_rank}, UnlockedAt: {ad_unlocked_at}, ExpiryNotified: {expiry_notified}, IsUnlocked: {is_unlocked}")

                try:
                    extra_update = {}
                    needs_expiry = (
                        board_rank > FREE_BOARDS_LIMIT
                        and not is_unlocked
                        and expiry_notified == 0
                        and not sent_expiry_this_run
                    )

                    # 1. 到期提醒優先發送，讓使用者先看到說明再看隱藏通知
                    if needs_expiry:
                        print("  [Action] Sending expiry notice...")
                        free_boards, affected_boards = build_board_groups(notifications, n["user_id"])
                        await send_expiry_notice(client, n, free_boards, affected_boards)
                        extra_update = {"expiry_notified": 1}
                        sent_expiry_this_run = True
                        await asyncio.sleep(0.1)

                    # 2. 發送文章通知
                    if board_rank <= FREE_BOARDS_LIMIT or is_unlocked:
                        await send_full_notification(client, n)
                    else:
                        await send_hidden_notification(client, n)

                    # 3. 記錄狀態更新
                    updates.append({"id": n["id"], "status": "sent", **extra_update})

                except Exception as e:
                    print(f"Error sending notification {n['id']}: {e}")
                    updates.append({"id": n["id"], "status": "failed"})

                await asyncio.sleep(0.1)

            # 2. Batch-update statuses
            if updates:
                try:
                    await client.post(
                        f"{API_WORKER_URL}/internal/notification-status",
                        json={"updates": updates},
                        headers=INTERNAL_HEADERS,
                        timeout=15,
                    )
                except Exception as e:
                    print(f"Error updating notification statuses: {e}")


if __name__ == "__main__":
    asyncio.run(main())
