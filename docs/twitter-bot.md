# Twitter Growth Bot

Automated Twitter bot for **@tryarthaHQ** that generates and posts content to grow the account and drive signups to artha.run. Posts across Twitter, Bluesky, and LinkedIn.

## Quick Start

```bash
# Preview what would be posted (no actual tweeting)
npm run twitter:bot:dry

# Post one item (auto-picks best category based on daily quota)
npm run twitter:bot

# Run in loop mode — posts on a PST schedule automatically
npm run social:loop

# Loop in dry-run mode
npm run social:loop -- --dry-run
```

**No CRON_SECRET needed for local runs.** The local script (`scripts/run-twitter-bot.ts`) reads `.env.local` directly and calls the bot logic without going through the HTTP cron endpoint. You only need CRON_SECRET when calling the cron endpoint via curl (for deployed environments).

## What It Posts

| Category | Quota/day | Priority | Description |
|----------|-----------|----------|-------------|
| **Trending** | 4 | 1 (highest) | Hot takes, news reactions, and QRT-style posts on trending AI/tech/startup topics |
| **Showcase** | 5 | 2 | Highlights a real company built on Artha with a screenshot of its live site |
| **Founder Story** | 5 | 3 | Viral founder revenue stories scraped from TrustMRR/Indie Hackers |
| **Tips** | 5 | 4 | Punchy SaaS/startup building tips with branded cards |
| **Threads** | 4 | 5 | 4-6 tweet deep-dives on AI company building |
| **Articles** | 1 (Mon-Fri) | 6 | 8-12 tweet long-form educational mega-threads |
| **Shorts** | 2 | 7 | AI-generated video shorts via InVideo |

Total: ~26 posts/day. In loop mode, the bot posts at 14 scheduled PST time slots (including 4 dedicated trending slots).

## Commands

```bash
# Basic
npm run twitter:bot                              # post 1 item, auto-pick category
npm run twitter:bot:dry                           # dry-run (generate content, don't post)

# Force a specific category
npm run twitter:bot -- --category=showcase
npm run twitter:bot -- --category=tip
npm run twitter:bot -- --category=thread
npm run twitter:bot -- --category=article
npm run twitter:bot -- --category=trending
npm run twitter:bot -- --category=founder_story
npm run twitter:bot -- --category=shorts

# Post multiple items at once
npm run twitter:bot -- --count=3

# Platform targeting
npm run twitter:bot -- --platform=twitter         # Twitter only
npm run twitter:bot -- --platform=bluesky         # Bluesky only
npm run twitter:bot -- --platform=linkedin        # LinkedIn only

# Combine flags
npm run twitter:bot -- --dry-run --category=trending --count=2

# Loop mode — leave your machine on, it keeps posting on schedule
npm run social:loop                               # full loop with replies
npm run social:loop -- --dry-run                   # loop but don't actually post

# Reply engine (standalone)
npm run twitter:bot -- --replies                   # check and reply to mentions
npm run twitter:bot -- --replies --dry-run         # dry-run replies
```

## Environment Variables Required

The bot reads from `.env.local`. These are the same Twitter credentials the platform already uses:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `TWITTER_CLIENT_ID` | Yes | Twitter OAuth2 app client ID |
| `TWITTER_CLIENT_SECRET` | Yes | Twitter OAuth2 app client secret |
| `TWITTER_REFRESH_TOKEN` | Yes | Platform account refresh token |
| `OPENAI_API_KEY` | Yes | For AI content generation (GPT-4o) |
| `ANTHROPIC_API_KEY` | Yes | Fallback AI provider (Claude Sonnet) |
| `BRAVE_SEARCH_API_KEY` | No | For trending topic discovery via Brave Search |
| `TWITTER_ACCOUNT_USERNAME` | No | Defaults to resolving from API |
| `TWITTER_API_KEY` | No | OAuth 1.0a for media uploads |
| `TWITTER_API_SECRET` | No | OAuth 1.0a for media uploads |
| `TWITTER_ACCESS_TOKEN` | No | OAuth 1.0a for media uploads |
| `TWITTER_ACCESS_TOKEN_SECRET` | No | OAuth 1.0a for media uploads |
| `BLUESKY_IDENTIFIER` | No | Bluesky handle for cross-posting |
| `BLUESKY_PASSWORD` | No | Bluesky app password |
| `LINKEDIN_PLATFORM_ACCESS_TOKEN` | No | LinkedIn cross-posting |
| `R2_ACCESS_KEY_ID` | No | Only needed if using R2 screenshot cache |
| `R2_SECRET_ACCESS_KEY` | No | Only needed if using R2 screenshot cache |

If you haven't set up Twitter credentials yet, run:
```bash
npm run twitter:token
```

## How It Works

1. **Scheduler** (`src/lib/growth/scheduler.ts`) checks daily quotas and picks the next content category by priority
2. **Trending Discovery** (`src/lib/growth/trending.ts`) finds trending topics from Brave Search + Twitter Search API
3. **Content Generator** (`src/lib/growth/content-generator.ts`) uses GPT-4o to write the tweet/thread
4. **Card Generator** (`src/lib/growth/card-generator.ts`) creates branded PNG cards via Satori + Resvg
5. **Screenshot** (`src/lib/screenshot.ts`) captures live sites for showcase tweets (Playwright + Chromium)
6. **Multi-Platform Posting** (`src/lib/growth/runner.ts`) posts to Twitter, Bluesky, and LinkedIn in parallel
7. **Reply Engine** (`src/lib/growth/reply-engine.ts`) monitors and responds to replies (max 15/day)
8. **Tracking** — every post is recorded in `twitter_bot_posts` table for dedup and metrics

### Trending Content (New)

The trending system discovers what's hot and generates timely takes:

1. **Discovery** — runs two sources in parallel:
   - **Brave Search**: queries for breaking AI/tech/startup news (past 24h)
   - **Twitter Search API**: finds viral tweets sorted by engagement (likes + retweets + replies)
2. **AI Ranking** — GPT-4o picks the top 3 items most relevant to Artha's audience
3. **A/B Testing** — generates 3 caption options per item, AI picks the strongest
4. **Formats**: `hot_take` (opinionated reaction), `news_react` (share + angle), `qrt` (quote-tweet style), `insight` (broader lesson)
5. **Dedup** — recent topics are tracked to avoid repeating the same news

### Content Rotation Logic

The scheduler maintains daily quotas. Each run:
1. Queries `twitter_bot_posts` for today's posted counts per category
2. Compares against quotas (trending: 4, showcase: 5, tip: 5, founder_story: 5, thread: 4, article: 0-1, shorts: 2)
3. Returns the first category with remaining quota, prioritized: trending > showcase > founder_story > tip > thread > article > shorts
4. If all quotas filled, returns null and the bot skips

### Showcase Dedup

Projects are not showcased more than once per 7 days. The query excludes any project that has a "posted" showcase tweet within the last week. Projects are ranked by visitor count (most traffic first).

### Loop Schedule (PST)

The loop runs 14 posting slots per day with ±15 min jitter:

| Time | Purpose |
|------|---------|
| 7:30 AM | Early morning |
| 8:45 AM | Morning ramp-up |
| 9:45 AM | Trending check |
| 10:00 AM | Mid-morning |
| 11:30 AM | Late morning |
| 12:15 PM | Trending check |
| 1:00 PM | Lunch break |
| 2:30 PM | Early afternoon |
| 3:15 PM | Trending check |
| 4:00 PM | Mid-afternoon |
| 5:30 PM | End of workday |
| 6:15 PM | Trending check |
| 7:00 PM | Dinner scroll |
| 8:30 PM | Evening scroll |

Reply checks run every hour during 8 AM - 9 PM PST while the loop is waiting between posting slots.

## Cron Endpoint (Deployed Environments)

For running on a server instead of locally:

```bash
# Post 1 item
curl -X POST https://artha.run/api/cron/twitter-growth \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Post 3 items
curl -X POST "https://artha.run/api/cron/twitter-growth?count=3" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Force category
curl -X POST "https://artha.run/api/cron/twitter-growth?category=tip" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Dry run
curl -X POST "https://artha.run/api/cron/twitter-growth?dry=true" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

The `CRON_SECRET` is set in your deployment environment variables (Render/Vercel). It's the same secret used by other cron endpoints like `site-nudge` and `nightly-tasks`. You can find it in your Render dashboard under Environment → `CRON_SECRET`, or set any random string if creating new.

## Database

The bot tracks all posts in the `twitter_bot_posts` table:

```sql
twitter_bot_posts (
  id UUID,
  category TEXT,        -- 'trending', 'showcase', 'tip', 'thread', 'article', 'founder_story', 'shorts'
  tweet_ids TEXT[],      -- array of tweet IDs (for threads)
  tweet_urls TEXT[],     -- includes Twitter, Bluesky, LinkedIn URLs
  content TEXT,
  project_id UUID,       -- links to projects table (for showcases)
  status TEXT,           -- 'draft', 'posted', 'failed'
  topic TEXT,            -- short label for dedup
  error TEXT,
  metadata JSONB,        -- bluesky_uris, linkedin_urls, source_url, format, tweet_context, etc.
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

For trending posts, `metadata` includes:
- `source_url` — original news article or tweet URL
- `source_type` — `"news"` or `"tweet"`
- `format` — `"hot_take"`, `"news_react"`, `"qrt"`, or `"insight"`
- `tweet_context` — `{ authorUsername, tweetId, engagement }` (for tweet-sourced items)

Run `npm run db:setup` if the table doesn't exist yet (it's in `schema/platform.sql`).

## File Structure

```
src/lib/growth/
  trending.ts             — trending topic discovery (Brave Search + Twitter API)
  content-generator.ts    — AI prompts for 7 content categories
  card-generator.ts       — branded PNG card generation (Satori + Resvg)
  scheduler.ts            — daily quotas, rotation logic, DB queries
  runner.ts               — main orchestrator, multi-platform posting
  reply-engine.ts         — AI-driven reply system
  story-scraper.ts        — TrustMRR/Indie Hackers scraper for founder stories
  bluesky.ts              — Bluesky AT Protocol client
  linkedin.ts             — LinkedIn platform posting
src/lib/screenshot.ts     — Playwright screenshot utility
src/lib/twitter.ts        — Twitter API client (post, thread, search, mentions)
src/lib/search.ts         — Web search (Brave, Exa, Tavily)
src/app/api/cron/twitter-growth/route.ts  — HTTP cron endpoint
scripts/run-twitter-bot.ts               — local runner CLI
```

## Troubleshooting

**"Twitter platform account not configured"**
Set `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, and `TWITTER_REFRESH_TOKEN` in `.env.local`. Run `npm run twitter:token` to generate a refresh token.

**"relation twitter_bot_posts does not exist"**
Run `npm run db:setup` to apply the latest schema migration.

**Screenshot fails**
Make sure Playwright's Chromium is installed: `npx playwright install chromium`. The bot falls back to text-only tweets if screenshots fail.

**"All daily quotas filled"**
The bot has already posted the maximum for today. Wait until midnight UTC or force a specific category with `--category=tip`.
