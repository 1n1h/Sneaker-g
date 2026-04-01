# Sneaker G

A sneaker release monitoring tool for resellers with a two-way Telegram bot interface and AI-powered features. Built with Vite + React + TypeScript, deployed on Vercel.

## Features

- Real-time sneaker stock monitoring with configurable scrape intervals
- Two-way Telegram bot for managing watchlist, searching releases, and receiving alerts
- AI-powered image identification (snap a photo, get the shoe details)
- Release date research with retail/resale price estimates
- Dark-themed dashboard with live stats, watchlist management, and scrape history
- Automatic drop alerts via Telegram when stock is detected

## Setup Instructions

### Prerequisites

- Node.js 18+
- A Vercel account
- A Telegram bot (created via BotFather)
- An Upstash Redis database
- A Together AI API key

### 1. Clone and Install

```bash
git clone https://github.com/1n1h/Sneaker-g.git
cd Sneaker-g
npm install
```

### 2. Get a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to name your bot
3. BotFather will give you a **bot token** like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
4. Save this as your `TELEGRAM_BOT_TOKEN`
5. Send a message to your new bot, then visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to find your **chat ID** in the response JSON under `message.chat.id`
6. Save this as your `TELEGRAM_CHAT_ID`

### 3. Set Up Upstash Redis

1. Go to [upstash.com](https://upstash.com) and create an account
2. Create a new **Redis** database
3. In the database details page, find **REST API** section
4. Copy the **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**
5. These map to your env vars:
   - `STORAGE_KV_REST_API_URL` = REST URL
   - `STORAGE_KV_REST_API_TOKEN` = REST Token
   - `STORAGE_KV_REST_API_READ_ONLY_TOKEN` = Read-Only Token

### 4. Get Together AI API Key

1. Go to [together.ai](https://together.ai) and create an account
2. Navigate to **API Keys** in your dashboard
3. Create a new API key
4. Save as `TOGETHER_API_KEY`

### 5. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
TOGETHER_API_KEY=your_together_ai_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
STORAGE_KV_REST_API_URL=your_upstash_redis_rest_url
STORAGE_KV_REST_API_TOKEN=your_upstash_redis_rest_token
STORAGE_KV_REST_API_READ_ONLY_TOKEN=your_upstash_redis_read_only_token
```

For Vercel deployment, add these same variables in your Vercel project settings under **Environment Variables**.

### 6. Run Locally

```bash
npm install -g vercel
vercel dev
```

This starts the Vite dev server and Vercel serverless functions locally.

### 7. Deploy to Vercel

```bash
vercel --prod
```

### 8. Register Telegram Webhook

After deploying, register the webhook so Telegram sends messages to your bot:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-vercel-domain>/api/telegram/webhook"
```

Replace `<TELEGRAM_BOT_TOKEN>` with your actual token and `<your-vercel-domain>` with your Vercel deployment URL.

## Environment Variables Reference

| Variable | Description |
|---|---|
| `TOGETHER_API_KEY` | Together AI API key for LLM models |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID for notifications |
| `STORAGE_KV_REST_API_URL` | Upstash Redis REST API URL |
| `STORAGE_KV_REST_API_TOKEN` | Upstash Redis REST API token |
| `STORAGE_KV_REST_API_READ_ONLY_TOKEN` | Upstash Redis read-only token |

## Telegram Bot Commands

The bot understands natural language. Here are example messages:

| Command / Message | Action |
|---|---|
| `Add Jordan 1 Retro High OG` | Adds shoe to watchlist and searches for release info |
| `Remove Jordan 1 from watchlist` | Removes shoe from watchlist |
| `Search Nike Dunk Low Panda` | Searches release date, price, retailers |
| `List my watchlist` | Shows all monitored shoes |
| `Set delay 5 minutes for Jordan 1` | Updates scrape interval for a shoe |
| `Check status` | Returns bot health and last scrape times |
| `Show calendar` | Shows upcoming drops in next 30 days |
| `Pause monitoring` | Pauses all scraping |
| `Resume monitoring` | Resumes scraping |
| Send a shoe photo | Identifies the shoe and returns release/resale info |

## AI Models Used

| Model | Purpose |
|---|---|
| `meta-llama/Llama-4-Scout-17B-16E-Instruct` | Intent parsing and command classification |
| `meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo` | Release research, reasoning, scrape classification |
| `meta-llama/Llama-4-Maverick-17B-128E-Instruct-Turbo` | Image identification (vision/multimodal) |

## Project Structure

```
sneaker-g/
  api/
    telegram/webhook.ts    # Telegram bot webhook handler
    watchlist/index.ts     # Watchlist CRUD API
    scrape/check.ts        # Cron-triggered scrape job
    search/release.ts      # Release info search API
    identify/image.ts      # Image identification API
  src/
    components/
      Layout.tsx           # App layout with sidebar nav
      StatusBadge.tsx      # Reusable status badge
    pages/
      Dashboard.tsx        # Main dashboard with stats
      Watchlist.tsx        # Watchlist management
      Search.tsx           # Release search
      Identify.tsx         # Image identification
      History.tsx          # Scrape history log
      Settings.tsx         # App settings
    lib/
      api.ts               # API client helpers
    types/
      index.ts             # Shared TypeScript types
    App.tsx
    main.tsx
    index.css
  vercel.json              # Cron job and build config
  .env.local               # Environment variables (not committed)
```

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Vercel Serverless Functions
- **Database**: Upstash Redis
- **AI**: Together AI (Llama models)
- **Bot**: Telegram Bot API
- **Deployment**: Vercel
