# PTT Notify Bot — Claude Guide

## 專案架構

```
ptt-notify-bot/
├── workers/
│   ├── bot/          # Telegram Bot Worker（grammy + Cloudflare Workers）
│   │   └── src/
│   │       ├── index.ts          # fetch handler（/webhook）+ scheduled（cron）
│   │       ├── bot.ts            # grammy Bot 建立
│   │       ├── env.ts            # Env interface
│   │       ├── handlers/
│   │       │   └── start.ts      # /start 指令
│   │       ├── db/
│   │       │   ├── schema.sql    # D1 建表 SQL
│   │       │   └── queries.ts    # 所有 D1 查詢函式
│   │       └── utils/
│   │           └── dispatch.ts   # GitHub Actions dispatch + Telegram 推送
│   ├── api/          # API Worker（Mini App 後端 + 爬蟲回呼）
│   │   └── src/
│   │       ├── index.ts          # 所有路由
│   │       ├── env.ts            # Env interface
│   │       ├── db/
│   │       │   └── queries.ts    # re-export from bot/src/db/queries
│   │       └── utils/
│   │           ├── auth.ts       # Telegram initData HMAC-SHA256 驗證
│   │           └── cors.ts       # CORS headers 和 response helpers
│   └── shared/
│       ├── types.ts              # 全域型別定義
│       └── config.ts             # 全域常數（FREE_BOARDS_LIMIT 等）
├── crawler/
│   ├── crawler.py    # PTT 爬蟲（async，跑在 GitHub Actions）
│   ├── notify.py     # 通知派送（async，跑在 GitHub Actions）
│   └── requirements.txt
├── miniapp/
│   ├── index.html    # Telegram Mini App 入口
│   ├── app.js        # 純 JS，API_BASE 由 deploy 時替換
│   └── style.css     # Telegram CSS 變數主題
└── .github/workflows/
    ├── crawl.yml     # workflow_dispatch，由 CF Worker Cron 觸發
    ├── notify.yml    # workflow_dispatch，由 CF Worker Cron 觸發
    ├── deploy-bot.yml
    └── deploy-api.yml
```

## 系統資料流

```
[Cloudflare Bot Worker - Cron */5]
  → getActiveBoardsWithSubscribers (D1)
  → enqueueCrawlBoards (D1: crawl_queue)
  → getActiveCrawlRunCount (GitHub API)
  → dispatchCrawler (GitHub workflow_dispatch: crawl.yml)

[GitHub Actions: crawl.yml]
  → GET /internal/active-boards (API Worker)
      ← fetchNextPendingCrawlBoard (D1: crawl_queue → atomic lock)
  → fetch PTT index.json
  → POST /internal/board-snapshot (更新 last_article_id)
  → POST /internal/queue (寫入 pending_notifications)
  → POST /internal/board-snapshot { mark_done: true }

[Cloudflare Bot Worker - Cron 2-57/5]
  → dispatchNotifier (GitHub workflow_dispatch: notify.yml)
  → fetchPendingNotifications (D1)
  → sendMessage (Telegram API)

[GitHub Actions: notify.yml]
  → GET /internal/pending-notifications (API Worker)
  → sendMessage (Telegram API) × N
  → POST /internal/notification-status (API Worker)
```

## 設計決策

### 兩個 Worker 拆分原因
- **Bot Worker**：處理 Telegram Webhook 與 Cron，直接存取 D1
- **API Worker**：Mini App 後端 + 爬蟲回呼，以 `INTERNAL_SECRET` 區隔內外部 API
- 兩者共用同一個 D1 資料庫 `ptt-notify-bot-db`（透過 binding）

### 爬蟲設計
- 爬蟲跑在 GitHub Actions（免費），不佔用 CF Worker CPU 時間
- `crawl_queue` 作為 job queue，`fetchNextPendingCrawlBoard` 做 atomic lock（防雙跑）
- `crawl.yml` concurrency group = `crawl`，cancel-in-progress = false（跑完才允許下一次）

### Notification 三層邏輯
1. `board_rank <= FREE_BOARDS_LIMIT`（≤2）：完整通知
2. `board_rank > 2` 且 `is_unlocked`：完整通知 + 延長解鎖按鈕
3. `board_rank > 2` 未解鎖：隱藏通知；`expiry_notified = 0` 時額外發一則到期提醒

## 本地開發指令

```bash
# Bot Worker
cd workers/bot
npm install
npm run dev          # 本地 dev server
npm run typecheck    # tsc --noEmit

# API Worker
cd workers/api
npm install
npm run dev
npm run typecheck

# D1 本地初始化（不連線到 Cloudflare）
cd workers/bot
npx wrangler d1 execute ptt-notify-bot-db --local --file=src/db/schema.sql
```

## Wrangler Secrets 設定

### Bot Worker
```bash
cd workers/bot
npx wrangler secret put BOT_TOKEN          # Telegram Bot Token
npx wrangler secret put GH_TOKEN           # GitHub PAT（actions:write）
npx wrangler secret put GH_REPO            # owner/repo
npx wrangler secret put MINIAPP_URL        # https://your-miniapp.pages.dev
npx wrangler secret put INTERNAL_SECRET    # openssl rand -hex 32
```

### API Worker
```bash
cd workers/api
npx wrangler secret put BOT_TOKEN          # 與 bot worker 相同
npx wrangler secret put INTERNAL_SECRET    # 與 bot worker 相同
```

## D1 Migrate

```bash
# 正式環境（--remote）
cd workers/bot
npx wrangler d1 execute ptt-notify-bot-db --remote --file=src/db/schema.sql

# 驗證
npx wrangler d1 execute ptt-notify-bot-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## 設定 Telegram Webhook

```bash
# 部署 Bot Worker 後取得 URL，再執行：
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://ptt-notify-bot.<subdomain>.workers.dev/webhook"

# 確認
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## 部署指令

```bash
# Bot Worker
cd workers/bot && npx wrangler deploy

# API Worker
cd workers/api && npx wrangler deploy

# Mini App（Cloudflare Pages，手動上傳或 CLI）
cd miniapp
# 先替換 API_BASE URL：
sed -i '' 's|__API_BASE_URL__|https://ptt-notify-bot-api.<subdomain>.workers.dev|g' app.js
npx wrangler pages deploy . --project-name ptt-miniapp
```

## GitHub Actions Secrets 清單

在 GitHub repo → Settings → Secrets and variables → Actions 設定：

| Secret | 說明 |
|--------|------|
| `API_WORKER_URL` | API Worker URL，例如 `https://ptt-notify-bot-api.xxx.workers.dev` |
| `INTERNAL_SECRET` | 與 wrangler secret 相同的值 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `MINIAPP_URL` | Mini App URL |
| `CLOUDFLARE_API_TOKEN` | 用於 wrangler deploy（deploy-bot/api workflow 使用） |

## 第一版已知限制

- **關鍵字過濾**：`subscription_filters` 表已建立，Mini App 顯示「即將推出」，功能尚未實作
- **廣告 Mock**：`POST /api/ad/complete` 直接解鎖，尚未串接 Monetag SDK；notify.py 的 `is_unlocked` 邏輯已就位，待 SDK 串接後可直接生效
- **MAX_CRAWL_WORKERS = 1**：目前只允許一個 crawl.yml 同時執行，`config.ts` 可調整（需同步修改 Bot Worker Cron 邏輯）
- **PTT 反爬**：crawler.py 無 retry / rate-limit 邏輯，高頻呼叫可能被 PTT 封鎖
- **Notification 重試**：`NOTIFICATION_RETRY_MAX = 3`，超過後標記 failed 不再重試
