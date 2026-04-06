# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概覽

PTT 通知機器人：用戶訂閱 PTT 看板後，有新文章時透過 Telegram 主動推送通知。
架構：兩個 Cloudflare Workers + D1 資料庫 + Python 爬蟲（跑在 GitHub Actions）+ Telegram Mini App。

## 常用指令

```bash
# 開發
cd workers/bot && npm run dev        # Bot Worker 本地 server
cd workers/api && npm run dev        # API Worker 本地 server

# TypeScript 型別檢查（兩個 worker 各自執行）
cd workers/bot && npm run typecheck
cd workers/api && npm run typecheck

# D1 本地初始化
cd workers/bot
npx wrangler d1 execute ptt-notify-bot-db --local --file=src/db/schema.sql

# 部署
cd workers/bot && npx wrangler deploy
cd workers/api && npx wrangler deploy
cd miniapp && npx wrangler pages deploy . --project-name ptt-miniapp

# D1 schema 套用到正式環境
cd workers/bot
npx wrangler d1 execute ptt-notify-bot-db --remote --file=src/db/schema.sql
```

## 系統架構

### 兩個 Worker 的職責分工

| Worker | 職責 | D1 存取 |
|--------|------|---------|
| **bot** (`workers/bot`) | Telegram Webhook（`/webhook`）、Cron 排程、grammy bot | 直接 binding |
| **api** (`workers/api`) | Mini App 後端 + 爬蟲回呼（`/internal/*`）| 直接 binding（同一個 D1） |

兩者共用 `workers/shared/types.ts`（型別）和 `workers/shared/config.ts`（常數），`workers/api/src/db/queries.ts` 直接 re-export 自 `workers/bot/src/db/queries.ts`。

### Cron 資料流

```
[Bot Worker Cron */5]
  → enqueueCrawlBoards → D1: crawl_queue
  → getActiveCrawlRunCount (GitHub API)
  → dispatchCrawler (workflow_dispatch: crawl.yml)

[GitHub Actions: crawl.yml]
  → GET /internal/active-boards        ← fetchNextPendingCrawlBoard（atomic lock）
  → POST /internal/board-snapshot      ← updateBoardSnapshot
  → POST /internal/queue               ← enqueuePendingNotifications
  → POST /internal/board-snapshot { mark_done: true }

[Bot Worker Cron 2-57/5]
  → dispatchNotifier (workflow_dispatch: notify.yml)

[GitHub Actions: notify.yml]
  → GET /internal/pending-notifications
  → sendMessage (Telegram API) × N
  → POST /internal/notification-status
```

### API 路由結構（`workers/api/src/index.ts`）

- `/internal/*` — 爬蟲回呼，需 `X-Internal-Secret` header
- `/api/boards/popular`, `/api/boards/search` — 公開（無須登入）
- `/api/*` — 需 Telegram initData HMAC-SHA256 驗證（`Authorization: tma <initData>`）

### Notification 三層邏輯

1. `board_rank <= FREE_BOARDS_LIMIT`（≤2）：完整通知
2. `board_rank > 2` 且 `is_unlocked`（`ad_unlocked_at + 86400 > now`）：完整通知 + 延長解鎖按鈕
3. `board_rank > 2` 未解鎖：隱藏通知；`expiry_notified = 0` 時額外發一則到期提醒

### 可調整常數（`workers/shared/config.ts`）

| 常數 | 預設值 | 說明 |
|------|--------|------|
| `FREE_BOARDS_LIMIT` | 2 | 免費看板上限 |
| `AD_UNLOCK_DURATION` | 86400 | 廣告解鎖秒數（24h） |
| `MAX_CRAWL_WORKERS` | 1 | 同時執行的 crawl.yml 數量 |
| `NOTIFICATION_BATCH_SIZE` | 50 | 每次 notify.yml 處理筆數 |
| `NOTIFICATION_RETRY_MAX` | 3 | 超過後標記 failed |

## 新增 Bot 指令的步驟

1. 在 `workers/bot/src/handlers/` 新增 `<command>.ts`，export `handle<Command>(ctx, env)`
2. 在 `workers/bot/src/bot.ts` 用 `bot.command(...)` 註冊
3. 若需要新的 env 變數，同步更新 `workers/bot/src/env.ts` 和 `wrangler.toml [vars]`
4. 部署後在 @BotFather → `/setcommands` 更新指令清單

## Secrets 設定

### Bot Worker
```bash
cd workers/bot
npx wrangler secret put BOT_TOKEN          # Telegram Bot Token
npx wrangler secret put GH_TOKEN           # GitHub PAT（actions:write）
npx wrangler secret put GH_REPO            # owner/repo
npx wrangler secret put MINIAPP_URL        # https://your-miniapp.pages.dev
npx wrangler secret put INTERNAL_SECRET    # openssl rand -hex 32
npx wrangler secret put ADMIN_TELEGRAM_ID  # 管理員 Telegram User ID（@userinfobot 取得）
```

### API Worker
```bash
cd workers/api
npx wrangler secret put BOT_TOKEN
npx wrangler secret put INTERNAL_SECRET
```

### GitHub Actions Secrets

| Secret | 說明 |
|--------|------|
| `API_WORKER_URL` | API Worker URL |
| `INTERNAL_SECRET` | 與 wrangler secret 相同 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `MINIAPP_URL` | Mini App URL |
| `CLOUDFLARE_API_TOKEN` | 用於 deploy-bot/api workflow |

## 設定 Telegram Webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://ptt-notify-bot.<subdomain>.workers.dev/webhook"
```

## BotFather 指令清單（人工操作）

```
/setcommands → 選擇 @pttbell_bot → 輸入：
start - 開啟管理介面
feedback - 提供意見回饋
```

## 已知限制

- **關鍵字過濾**：`subscription_filters` 表已建立，Mini App 顯示「即將推出」，功能尚未實作
- **廣告 Mock**：`POST /api/ad/complete` 直接解鎖，尚未串接 Monetag SDK
- **PTT 反爬**：`crawler.py` 無 retry / rate-limit，高頻呼叫可能被封
- **MAX_CRAWL_WORKERS = 1**：調整時需同步修改 Bot Worker Cron 邏輯
