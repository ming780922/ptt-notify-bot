# PTT Notify Bot

[![Test](https://github.com/ming780922/ptt-notify-bot/actions/workflows/test.yml/badge.svg)](https://github.com/ming780922/ptt-notify-bot/actions/workflows/test.yml)

訂閱 PTT 看板，有新文章時透過 Telegram 通知你。

## 架構

```
┌─────────────────────────────────────────────────────┐
│                  GitHub Actions                      │
│                                                      │
│  ┌─────────────┐   Cron dispatch  ┌───────────────┐  │
│  │  crawl.yml  │─────────────────▶│  crawler.py   │  │
│  └─────────────┘                  └───────┬───────┘  │
│  ┌─────────────┐   Cron dispatch  ┌───────▼───────┐  │
│  │  notify.yml │─────────────────▶│   notify.py   │  │
│  └─────────────┘                  └───────┬───────┘  │
└──────────────────────────────────────────┼───────────┘
                                           │ /internal/*
                                           ▼
┌─────────────────────────────────────────────────────┐
│              Cloudflare Workers                      │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │     API Worker       │  │     Bot Worker       │  │
│  │  ptt-notify-bot-api  │  │   ptt-notify-bot     │  │
│  │                      │  │                      │  │
│  │  /internal/* (crawl) │  │  /webhook (Telegram) │  │
│  │  /api/*    (miniapp) │  │  Cron: */5 * * * *   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             └──────────────┬──────────┘               │
│                            ▼                          │
│                 ┌─────────────────┐                   │
│                 │   D1 Database   │                   │
│                 │ ptt-notify-bot-db│                  │
│                 └─────────────────┘                   │
└─────────────────────────────────────────────────────┘
                             │ sendMessage
                             ▼
                  ┌─────────────────┐
                  │  Telegram API   │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   User's Phone  │
                  │  🔔 新文章通知   │
                  └─────────────────┘
```

## 技術棧

| 元件 | 技術 |
|------|------|
| Bot Worker | TypeScript + Cloudflare Workers + grammy |
| API Worker | TypeScript + Cloudflare Workers |
| 資料庫 | Cloudflare D1 (SQLite) |
| 爬蟲 / 通知 | Python 3.11 + httpx |
| 排程 | GitHub Actions（Bot Worker Cron 觸發）|
| Mini App | Next.js 15 + React 19 + Tailwind CSS |

## 功能

- 訂閱 PTT 看板，有新文章即時通知
- 支援多看板訂閱與關鍵字過濾
- Telegram Mini App 管理訂閱（BackButton、HapticFeedback、Dark/Light 主題自適應）
- 廣告解鎖功能：每項廣告門控可獨立透過 env var 開關
- 免費版：最多 2 個看板，每板 1 個關鍵字過濾

## 快速開始

詳見 [CLAUDE.md](./CLAUDE.md) 的部署步驟。
