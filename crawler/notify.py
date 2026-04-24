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
from shared import send_admin_alert

API_WORKER_URL = os.environ.get("API_WORKER_URL", "").rstrip("/")
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
MINIAPP_URL = os.environ.get("MINIAPP_URL", "").rstrip("/")

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
    # PTT 原生格式：Wed Apr  8 11:30:44 2026（個位數日期補空格）
    day = dt.strftime("%d").lstrip("0")
    return dt.strftime(f"%a %b {day:>2} %H:%M:%S %Y")



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

    text = f"<b>[{html.escape(n['board'])}]</b> 📢\n{title}"
    if pub_time:
        text += f"\n{pub_time}"
    if article_url:
        text += f"\n{article_url}"

    article_id = n.get("article_id", "")
    keyboard = [[{"text": "💬追蹤新推文", "callback_data": f"watch:{article_id}"}]] if article_id else []
    await send_message(client, n["user_id"], text, keyboard)


async def send_reply_notification(client: httpx.AsyncClient, n: dict) -> None:
    article_id = n.get("article_id", "")
    article_url = n.get("article_url") or ""
    raw_title = n.get("article_title") or ""
    reply_count = n.get("article_replies") or 0

    text = f"<b>[{html.escape(n['board'])}]</b> 💬 {reply_count} 則推文\n{html.escape(raw_title)}"
    if article_url:
        text += f"\n{article_url}"

    keyboard = [[{"text": "❌取消追蹤", "callback_data": f"unwatch:{article_id}"}]] if article_id else []
    await send_message(client, n["user_id"], text, keyboard)


async def send_hidden_notification(client: httpx.AsyncClient, n: dict) -> None:
    text = (
        f"<b>[{html.escape(n['board'])}]</b>\n"
        f"完整通知已暫停（前 {FREE_BOARDS_LIMIT} 個看板不受影響）\n"
        f"觀看廣告解鎖 24 小時完整通知。"
    )
    keyboard = [[miniapp_button("🎬 解鎖完整通知功能", "unlock")]]
    await send_message(client, n["user_id"], text, keyboard)


async def send_expiry_notice(client: httpx.AsyncClient, n: dict) -> None:
    text = (
        f"⏰ <b>完整通知功能已到期</b>\n"
        f"觀看廣告啟用完整通知功能 24 小時。"
    )
    keyboard = [[miniapp_button("🎬 解鎖完整通知功能", "unlock")]]
    await send_message(client, n["user_id"], text, keyboard)


# ── Main loop ─────────────────────────────────────────────────────────────────

async def main(client: httpx.AsyncClient) -> None:
    while True:
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
        expiry_sent_users: set[int] = set()

        for n in notifications:
            board_rank = n.get("board_rank")  # None for reply notifications; never coerce to int
            ad_unlocked_at: int = n.get("ad_unlocked_at") or 0
            expiry_notified: int = n.get("expiry_notified") or 0
            is_unlocked = ad_unlocked_at > time.time()
            user_id: int = n["user_id"]

            print(f"  [Debug] ID: {n['id']}, Rank: {board_rank}, UnlockedAt: {ad_unlocked_at}, ExpiryNotified: {expiry_notified}, IsUnlocked: {is_unlocked}")

            try:
                extra_update = {}
                needs_expiry = (
                    board_rank is not None
                    and board_rank > FREE_BOARDS_LIMIT
                    and not is_unlocked
                    and expiry_notified == 0
                    and user_id not in expiry_sent_users
                )

                if needs_expiry:
                    print("  [Action] Sending expiry notice...")
                    await send_expiry_notice(client, n)
                    extra_update = {"expiry_notified": 1}
                    expiry_sent_users.add(user_id)
                    await asyncio.sleep(0.1)

                if board_rank is None:
                    await send_reply_notification(client, n)
                elif board_rank <= FREE_BOARDS_LIMIT or is_unlocked:
                    await send_full_notification(client, n)
                else:
                    await send_hidden_notification(client, n)

                updates.append({"id": n["id"], "status": "sent", **extra_update})

            except Exception as e:
                print(f"Error sending notification {n['id']}: {e}")
                updates.append({"id": n["id"], "status": "failed"})

            await asyncio.sleep(0.1)

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


async def _run() -> None:
    if len(INTERNAL_SECRET) < 32:
        raise ValueError("INTERNAL_SECRET must be at least 32 characters")
    if not MINIAPP_URL.startswith("https://"):
        raise ValueError(f"MINIAPP_URL must be an https URL, got: {MINIAPP_URL!r}")

    async with httpx.AsyncClient() as client:
        try:
            await main(client)
        except Exception as e:
            await send_admin_alert(client, "Notifier", f"Notifier crashed: {repr(e)}")
            raise


if __name__ == "__main__":
    asyncio.run(_run())
