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


def miniapp_button(label: str, action: str = None) -> dict:
    url = MINIAPP_URL
    if action:
        url += f"?action={action}"
    return {"text": label, "web_app": {"url": url}}


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
        row = [read_btn, miniapp_button("🎬 延長解鎖", "unlock")]
    else:
        row = [read_btn]

    await send_message(client, n["user_id"], text, [row])


async def send_hidden_notification(client: httpx.AsyncClient, n: dict) -> None:
    text = f"📋 <b>{n['board']}</b> 有新文章\n\n觀看廣告查看標題及連結"
    keyboard = [[miniapp_button("🎬 解鎖 24 小時完整通知", "unlock")]]
    await send_message(client, n["user_id"], text, keyboard)


async def send_expiry_notice(client: httpx.AsyncClient, n: dict) -> None:
    # 這裡未來可以改進為查詢該使用者的所有看板名稱，目前先以簡單文字表示
    text = "⏰ <b>進階通知已到期</b>\n\n第 3 個以後看板的完整通知已停止\n請觀看廣告以解鎖 24 小時完整通知。"
    keyboard = [[miniapp_button("🎬 立即解鎖", "unlock")]]
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
                    # 1. 決定發送哪種通知
                    if board_rank <= FREE_BOARDS_LIMIT:
                        await send_full_notification(client, n)
                    elif is_unlocked:
                        await send_full_notification(client, n, show_extend=True)
                    else:
                        await send_hidden_notification(client, n)
                    
                    # 2. 如果已過期且尚未通知過，加發到期提醒 (並檢查本次是否已發過)
                    extra_update = {}
                    if board_rank > FREE_BOARDS_LIMIT and not is_unlocked and expiry_notified == 0 and not sent_expiry_this_run:
                        print("  [Action] Sending expiry notice...")
                        await send_expiry_notice(client, n)
                        extra_update = {"expiry_notified": 1}
                        sent_expiry_this_run = True # 標記已發送，避免同批次重複發送
                    
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
