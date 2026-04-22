"""Shared utilities for crawler and notifier scripts."""
import os
import httpx

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ADMIN_TELEGRAM_ID = os.environ.get("ADMIN_TELEGRAM_ID", "")


async def send_admin_alert(client: httpx.AsyncClient, label: str, message: str) -> None:
    """Send a Telegram message to the admin. Best-effort; never raises."""
    if not TELEGRAM_BOT_TOKEN or not ADMIN_TELEGRAM_ID:
        return
    try:
        await client.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": ADMIN_TELEGRAM_ID, "text": f"🚨 [{label}] {message}"},
            timeout=10,
        )
    except Exception:
        pass
