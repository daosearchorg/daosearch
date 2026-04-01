# DaoSearch

Discover, rank, and track web novel raws from Qidian (book.qq.com). Think of it as the place you go to find what to read next, keep track of what you're reading, and see what the community is into.

DaoSearch isn't a reading site — it's a discovery and curation platform. The data is scraped from Qidian, but the curation comes from you: your ratings, reviews, tags, and booklists shape what others discover.

**Live at [daosearch.io](https://daosearch.io)** | **[Discord](https://discord.gg/Gmd3JXDuEU)** | **[API Docs](https://daosearch.io/api-docs)**

---

## What you get

- **1M+ novels** from Qidian with auto-translated titles, synopses, and comments
- **Rankings** — Qidian official charts (trending, rising, free, finished, all-time) + community rankings based on what readers are actually reading
- **Booklists** — browse Qidian-curated lists and create your own, with tags and follower counts
- **Ratings & reviews** on every novel, plus community activity feeds
- **Reading tracker** — currently reading, plan to read, dropped, completed
- **"If you liked X, try Y"** recommendations pulled from Qidian data
- **Side-by-side comparison** of any two novels
- **RSS feeds** for new books, Qidian comments, and community activity
- **Search** with filters for genre, author, chapter count, word count, update date, audience, and more

## For developers

- **Public REST API** — 15+ endpoints covering books, search, rankings, genres, booklists, feed, and stats
- **MCP server** — Model Context Protocol for Claude and other AI agents
- **Discord bot** — 9 slash commands for search, rankings, reviews, recommendations, and more
- **ChatGPT** — custom GPT powered by the API

Full API docs at [daosearch.io/api-docs](https://daosearch.io/api-docs).

---

## Project structure

```
daosearch/
├── backend/          # Next.js app (frontend + API + MCP server)
├── scraper/          # Python scraper + translation pipeline
├── discord-bot/      # Discord.js bot
└── docker-compose.local.yml
```

### Backend — `backend/`

Next.js 16 with App Router, React 19, Tailwind CSS 4, shadcn/ui, Drizzle ORM, NextAuth.js. Handles the website, internal API routes, public API (v1), MCP server, RSS feeds, sitemap, and auth (Google + Discord OAuth).

### Scraper — `scraper/`

Python scraper with Redis Queue (RQ) workers. Six worker types:

- **Scraper workers** — extract book data, charts, booklists, and comments from Qidian with rotating proxies and browser fingerprinting
- **Translation workers** — auto-translate books, booklists, comments, nicknames, and chapters via Google Translate (with OpenAI fallback)
- **Maintenance workers** — find missing translations, stale books, missing fields, and schedule re-scrapes
- **General workers** — handle one-off and ad-hoc queue tasks
- **Auto-scheduler** — cron-like service that queues maintenance and refresh tasks on regular intervals
- **Discovery crawler** — Scrapy-based spider that crawls Qidian to find new books not yet in the database

### Discord bot — `discord-bot/`

Standalone Discord.js bot that calls the public API. Slash commands: `/book`, `/browse`, `/similar`, `/reviews`, `/rankings`, `/trending`, `/genres`, `/booklists`, `/stats`.

---

## Getting started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.13+ with [uv](https://docs.astral.sh/uv/)

### 1. Clone and configure

```bash
git clone https://github.com/geriatricvibes/daosearch.git
cd daosearch
cp .env.example .env.local
# Fill in your credentials in .env.local
```

### 2. Start databases

```bash
docker compose -f docker-compose.local.yml up postgres redis -d
```

### 3. Run the frontend

```bash
cd backend
npm install
npm run dev
# → http://localhost:8080
```

### 4. Run the scraper (optional)

```bash
cd scraper
uv sync
uv run python main.py scrape https://book.qq.com/book-detail/51637401
uv run python main.py stats
```

Or start all workers with Docker:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

### 5. Run the Discord bot (optional)

```bash
cd discord-bot
npm install
# Create discord-bot/.env with DISCORD_TOKEN and DAOSEARCH_API_URL
npm run dev
```

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Database | PostgreSQL 17, Drizzle ORM |
| Cache/Queue | Redis 7, RQ (Redis Queue) |
| Auth | NextAuth.js (Google + Discord OAuth) |
| Scraping | Python, BeautifulSoup, Scrapy, rotating proxies |
| Translation | Google Translate, OpenAI/OpenRouter fallback |
| Storage | Cloudflare R2 (S3-compatible) |
| Bot | Discord.js 14 |
| AI | MCP server, ChatGPT custom GPT |
| Infra | Docker, Dokploy |

## Environment variables

Copy `.env.example` and fill in your values. You'll need:

- PostgreSQL and Redis connection details
- Google and Discord OAuth credentials (for user auth)
- OpenAI/OpenRouter API key (for translation fallback)
- Cloudflare R2 credentials (for book cover storage)

The scraper can run with just database + Redis. The frontend needs most of the above for full functionality, but will work in read-only mode with just the database.

---

## Contributing

Open an issue or PR. Join the [Discord](https://discord.gg/Gmd3JXDuEU) if you want to chat about what you're working on.

## License

MIT
