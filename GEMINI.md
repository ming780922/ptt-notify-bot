# GEMINI.md - PTT Notify Bot

## Project Overview
PTT Notify Bot is a notification service that monitors PTT boards and sends real-time updates to users via Telegram. It utilizes a modern serverless architecture combining Cloudflare Workers, Cloudflare D1 (SQLite), and GitHub Actions.

### Architecture
- **Bot Worker (`workers/bot`)**: Handles Telegram Webhook interactions, commands, and scheduled tasks (cron). Built with `grammy` and TypeScript.
- **API Worker (`workers/api`)**: Serves as the backend for the Telegram Mini App and handles callbacks from the crawler. Uses `INTERNAL_SECRET` for authentication.
- **Crawler (`crawler/`)**: A Python-based asynchronous crawler that runs on GitHub Actions to fetch PTT updates without consuming Cloudflare Worker CPU time.
- **Mini App (`miniapp/`)**: A pure HTML/JS frontend for users to manage their board subscriptions.
- **Database**: Cloudflare D1 (`ptt-notify-bot-db`) shared between both Workers.

## Key Technologies
- **Backend**: TypeScript, Cloudflare Workers, grammy (Telegram Bot Framework)
- **Database**: Cloudflare D1 (SQLite)
- **Crawler**: Python 3.12, httpx, BeautifulSoup4
- **Frontend**: Vanilla HTML/JS/CSS (Telegram Mini App)
- **CI/CD**: GitHub Actions

## Building and Running

### Development Commands
#### Bot Worker
```bash
cd workers/bot
npm install
npm run dev          # Start local development server
npm run typecheck    # Run TypeScript type checking
```

#### API Worker
```bash
cd workers/api
npm install
npm run dev          # Start local development server
npm run typecheck    # Run TypeScript type checking
```

#### Database (D1)
```bash
# Initialize local D1 database
cd workers/bot
npx wrangler d1 execute ptt-notify-bot-db --local --file=src/db/schema.sql

# Execute SQL on remote production database
npx wrangler d1 execute ptt-notify-bot-db --remote --file=src/db/schema.sql
```

### Deployment
- **Workers**: `npx wrangler deploy` within the respective worker directory.
- **Mini App**: `npx wrangler pages deploy . --project-name ptt-miniapp` within `miniapp/`.
- **Secrets**: Use `npx wrangler secret put` to set required environment variables (see `CLAUDE.md` for full list).

## Development Conventions
- **Shared Code**: Common types and configurations are located in `workers/shared/`.
- **Database Logic**: All D1 queries should be centralized in `queries.ts` files within each worker.
- **Internal Security**: Communication between the crawler and API Worker is secured via an `INTERNAL_SECRET` header (`X-Internal-Secret`).
- **Crawler Design**: The crawler uses a job queue (`crawl_queue`) in D1 to manage tasks and prevent duplicate runs.
- **Documentation**: `CLAUDE.md` serves as the primary operational guide for deployment, secrets, and system data flow.

## Key Files
- `workers/bot/src/bot.ts`: Telegram bot instance and middleware setup.
- `workers/bot/src/index.ts`: Entry point for Bot Worker (fetch & scheduled handlers).
- `workers/api/src/index.ts`: Routing logic for the API Worker.
- `crawler/crawler.py`: Main logic for fetching PTT articles and reporting back to the API.
- `workers/shared/types.ts`: TypeScript interfaces for the entire project.
- `workers/bot/src/db/schema.sql`: Database schema definition.
