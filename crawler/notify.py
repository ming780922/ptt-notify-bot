#!/usr/bin/env python3
"""PTT notification dispatcher — sends Telegram messages for pending notifications."""

import asyncio
import os
import time

import httpx

API_WORKER_URL = os.environ["API_WORKER_URL"].rstrip("/")
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
MINIAPP_URL = os.environ["MINIAPP_URL"]

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
    resp.raise_for_status()


def miniapp_button(label: str) -> dict:
    return {"text": label, "web_app": {"url": MINIAPP_URL}}


def url_button(label: str, url: str) -> dict:
    return {"text": label, "url": url}


# ── Notification senders ──────────────────────────────────────────────────────

async def send_full_notification(
    client: httpx.AsyncClient,
    n: dict,
    show_extend: bool = False,
) -> None:
    text = f"📋 <b>{n['board']}</b> 新文章\n\n標題：{n['article_title']}"
    read_btn = url_button("閱讀全文", n["article_url"])

    if show_extend:
        row = [read_btn, miniapp_button("🎬 延長解鎖")]
    else:
        row = [read_btn]

    await send_message(client, n["user_id"], text, [row])


async def send_hidden_notification(client: httpx.AsyncClient, n: dict) -> None:
    text = f"📋 <b>{n['board']}</b> 有新文章\n\n觀看廣告查看標題及連結"
    keyboard = [[miniapp_button("🎬 解鎖 24 小時完整通知")]]
    await send_message(client, n["user_id"], text, keyboard)


async def send_expiry_notice(client: httpx.AsyncClient, n: dict) -> None:
    text = "⏰ 進階通知已到期\n\n部分看板的完整通知已停止"
    keyboard = [[miniapp_button("🎬 立即解鎖")]]
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
                data = resp.json()
            except Exception as e:
                print(f"Error fetching pending notifications: {e}")
                break

            notifications: list[dict] = data if isinstance(data, list) else data.get("notifications", [])

            if not notifications:
                print("No pending notifications, exiting")
                break

            print(f"Processing {len(notifications)} notification(s)…")
            updates: list[dict] = []

            for n in notifications:
                board_rank: int = n.get("board_rank") or 1
                ad_unlocked_at: int = n.get("ad_unlocked_at") or 0
                expiry_notified: int = n.get("expiry_notified") or 0
                is_unlocked = (time.time() - ad_unlocked_at) < 86400

                try:
                    if board_rank <= FREE_BOARDS_LIMIT:
                        await send_full_notification(client, n)

                    elif is_unlocked:
                        await send_full_notification(client, n, show_extend=True)

                    else:
                        await send_hidden_notification(client, n)

                        if expiry_notified == 0:
                            await send_expiry_notice(client, n)
                            updates.append({"id": n["id"], "status": "sent", "expiry_notified": 1})
                            await asyncio.sleep(0.1)
                            continue

                    updates.append({"id": n["id"], "status": "sent"})

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
