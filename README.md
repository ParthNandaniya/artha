# Artha — AI Company Builder

Agents that build and run your company, 24/7. Describe your idea in one prompt, and Artha builds your company — mission, market research, website, email, and automated tasks.

## Monorepo Structure

This project uses **npm workspaces**. The dashboard lives at the root; shared packages live under `packages/`.

```
artha.run/
├── src/                          # Dashboard (Next.js app)
├── scripts/                      # CLI scripts (twitter bot, db setup, etc.)
├── packages/
│   ├── sdk/                      # @artha/sdk — shared utilities & client library
│   └── twitter-bot/              # @artha/twitter-bot — social bot
├── package.json                  # Root package (dashboard + workspaces config)
└── ...
```

All commands (dev, build, cron, social, worker) run from the root:

```bash
# Dashboard
npm run dev

# Run a script in a specific package
npm run build -w @artha/sdk

# Run a script across all packages
npm run build --workspaces

# Install a dep into a specific package
npm install zod -w @artha/sdk
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Neon (PostgreSQL, serverless)
- **Auth:** Google OAuth (cookie-based sessions via jose)
- **AI:** OpenAI + Anthropic (per-agent configurable via file); optional Tavily (web search), Supermemory
- **Payments:** Stripe (subscriptions + Connect for withdrawals)
- **Email:** Postmark (transactional + inbound)
- **Data Fetching:** React Query (TanStack Query v5) for caching and background sync
- **Styling:** Tailwind CSS + shadcn/ui

Optional integrations: GitHub (repos), Twitter/X (launch tweets), Cloudflare (site hosting).

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

Core required for end-to-end onboarding + dashboard:

- **Neon:** Create a project at [neon.tech](https://neon.tech), copy `DATABASE_URL`, `NEON_API_KEY`, and `NEON_ORG_ID` (Organization Settings)
- **Google OAuth:** Create credentials at [console.cloud.google.com](https://console.cloud.google.com/apis/credentials)
- **OpenAI:** Get an API key at [platform.openai.com](https://platform.openai.com)
- **Anthropic:** Get an API key at [console.anthropic.com](https://console.anthropic.com) (research, website, tasks)
- **Stripe:** Use [test keys](https://dashboard.stripe.com/test/apikeys) for development and set `STRIPE_PRO_PRICE_ID` + `STRIPE_CREDIT_PACK_PRICE_ID`
- **App domains:** Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_COMPANY_DOMAIN` for your deployment

Optional: `TAVILY_API_KEY_DEV` / `TAVILY_API_KEY_PROD` (web search; dev used locally, prod when deployed), `SUPERMEMORY_API_KEY`, `POSTMARK_*`, `GITHUB_TOKEN`, `TWITTER_*`, `TWITTER_TEST_*`, `CLOUDFLARE_*` for full feature set. Twitter/X now uses OAuth 2.0 app credentials plus a platform account refresh token in env.

For local Postmark testing, keep `NEXT_PUBLIC_APP_URL=http://localhost:3000`. If Postmark inbound stays pointed at production, set `POSTMARK_INBOUND_WEBHOOK_URL=https://your-live-domain/api/postmark/inbound` locally so email setup validates against the live webhook instead of localhost.

Validate your current env setup:

```bash
npm run env:check
```

Local development automatically uses `TWITTER_TEST_*` if those values are present; production uses `TWITTER_*`.

To generate a Twitter/X refresh token locally after you set either the `TWITTER_TEST_*` vars (recommended for dev) or the `TWITTER_*` vars plus a dedicated local redirect URI such as `http://127.0.0.1:3001/api/twitter/oauth/callback`, run:

```bash
npm run twitter:token
```

### Agent model/provider config

Edit [`src/config/agent-models.ts`](./src/config/agent-models.ts) to control each agent's model routing:

- `enabled`: `true` / `false`
- `provider`: `"openai"` or `"anthropic"`
- `model`: exact model id for that provider

If an agent is disabled (`enabled: false`), runtime calls for that agent are blocked with a clear error.

### 3. Set up the database

Apply the canonical platform schema in `schema/platform.sql` against your Neon database:

1. In Neon Dashboard → SQL Editor (or use `psql` with `DATABASE_URL`)
2. Run `schema/platform.sql`

Or apply the schema automatically:

```bash
npm run db:setup
```

Optional DB schema check:

```bash
npm run db:check
```

### 4. Set up Stripe

**Environment switching:**

- **Production (deployed):** Use `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — set these to your live keys in your host’s env.
- **Development (local):** Set `STRIPE_USE_TEST_KEYS=true` and use test keys in `.env.local`.

**Local development (webhooks with test mode):**

1. Set `STRIPE_USE_TEST_KEYS=true` in `.env.local`
2. Add test keys: `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST`
3. Set `STRIPE_PRO_PRICE_ID` and `STRIPE_CREDIT_PACK_PRICE_ID` from Stripe Products
4. [Install Stripe CLI](https://docs.stripe.com/stripe-cli#install) and run `stripe login`
5. Run `npm run dev` in one terminal, `npm run stripe:listen` in another
6. Copy the webhook signing secret into `.env.local` as `STRIPE_WEBHOOK_SECRET_TEST`

**Production deployment:**

1. In your host (e.g. Vercel), set prod keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
2. Set live price IDs: `STRIPE_PRO_PRICE_ID`, `STRIPE_CREDIT_PACK_PRICE_ID`
3. Create a webhook endpoint at `https://your-domain.com/api/stripe/webhook`
4. Subscribe to events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`

### 4.5. Set up Postmark

Use two Postmark servers if you want clean separation between platform mail and user company mail:

- `agents@artha.run` and other Artha-originated email -> platform server
- `{slug}@tryartha.com` send/receive mail -> company server

Set the split env vars from [`.env.example`](./.env.example), then run:

```bash
npm run env:check
npm run postmark:check
```

The detailed operator checklist lives in [`docs/postmark-setup.md`](./docs/postmark-setup.md).

### 5. Run the app

**Web app:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Background worker (optional, for pipeline and email processing):**

```bash
npm run worker
```

For production, scheduled jobs are managed via [cron-job.org](https://cron-job.org). After deploy, hit `POST /api/admin/setup-crons` once on your live app domain to provision all system crons automatically:

```bash
curl -X POST https://artha.run/api/admin/setup-crons \
  -H "Authorization: Bearer $CRON_SECRET"
```

Key cron endpoints:

| Endpoint | Frequency | Purpose |
|---|---|---|
| `/api/cron/nightly-tasks` | Every 4h | Execute queued agent tasks |
| `/api/cron/morning-digest` | Daily 8am | Morning summary email |
| `/api/cron/follow-up-sequences` | Every 4h | Drip email sequences |
| `/api/cron/post-scheduled-content` | Every 30min | Publish scheduled social posts |
| `/api/cron/analytics-actions` | Weekly Mon | AI analytics review |
| `/api/cron/competitive-check` | Weekly Mon | Competitive intelligence |
| `/api/cron/seo-review` | Monthly 1st | SEO audit |
| `/api/cron/ab-test-evaluation` | Every 6h | A/B test result checks |
| `/api/cron/churn-monitoring` | Daily 7am | Churn risk alerts |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`. Set `CRONJOB_ORG_API_KEY` for automated provisioning.

## Architecture

- `/dashboard` — Companies list
- `/dashboard/[slug]` — Single-page dashboard (Overview, Tasks, Documents, Landing Page, Email, Revenue, Settings)
- `/site/[slug]` — Public landing pages
- `/api/ai/run-pipeline` — SSE-based onboarding pipeline
- `/api/ai/run-task` — AI task orchestrator
- `/api/projects/integrations` — Manual integration recovery actions (create email, post launch tweet)
- `/api/projects/custom-domain` — Custom domain setup (Pro only, Cloudflare)
- `/api/projects/custom-email-domain` — Custom email domain + DNS verification (Pro only, Postmark)
- `/api/site/[slug]/chat` — Embeddable chat widget API for company landing pages
- `/api/cron/*` — Scheduled job endpoints (see cron table below)
- **Worker** — Polls for pipeline and email jobs; run with `npm run worker`

### Autonomy Agents

New agents that run autonomously on cron schedules or in response to events:

| Agent | Purpose | Trigger |
|---|---|---|
| `email_replier` | Auto-draft replies to inbound emails | Inbound webhook |
| `content_planner` | Schedule social content across platforms | Cron (content planning) |
| `analytics_agent` | Weekly analytics review + action items | Cron (weekly) |
| `competitive_monitor` | Track competitor changes | Cron (weekly) |
| `seo_agent` | SEO audit + recommendations | Cron (monthly) |

Agentic configuration (iterations, tools, thinking budgets) is in [`src/config/agent-agentic-config.ts`](./src/config/agent-agentic-config.ts).

### Custom Domains & Email Domains

Pro subscribers can configure:
- **Custom domain** — point a CNAME to `{slug}.pages.dev` via Settings panel
- **Custom email domain** — register with Postmark, get DNS records, verify

See [`docs/custom-domains.md`](./docs/custom-domains.md) for the DNS guide.

### Docs

- `docs/site-analytics.md` — analytics module flow reference
- `docs/worker-onboarding.md` — instant onboarding start, worker responsibilities, onboarding steps, and recovery
- `docs/marketing-ads-flow.md` — Meta Ads workflow, billing split, and optional env vars
- `docs/research/target-audience-and-critical-analysis.md` — target audience analysis and product assessment

**Frontend Notes:**
- We use **React Query** for all data-fetching panels (Twitter, Email, Revenue). 
- Hooks live in `src/hooks/use-*.ts` (e.g., `useTweets`, `useEmails`).
- Default `staleTime` is 30s to allow instant cache display with background refetch.
- The AI Assistant has a fixed-input, scrollable-chat layout and a width of `w-96`.


See `docs/agents/README.md` for the multi-agent design (Research, Website Builder, Email Writer, Task Generator, Twitter, Email Replier, Content Planner, Analytics, Competitive Monitor, SEO).

## Subscription & Credits

- **Free:** Onboarding pipeline (mission, research, landing page, email, task queue)
- **Pro ($49/mo):** 35 credits per billing cycle (40 in the first month); nightly + on-demand task runs consume credits
- **Credit pack:** $25 one-time → 15 credits (same pool, no subscription)

One credit per task execution (any agent). See `docs/pricing/credits-and-pricing.md` for details.
