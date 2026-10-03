<p align="center">
  <img src="public/artha-logo.svg" alt="Artha" width="72" />
</p>

<h1 align="center">Artha</h1>

<p align="center"><strong>AI that runs your company 24/7.</strong></p>

<p align="center">
  <a href="https://artha.run">artha.run</a>
</p>

---

Describe your idea in one prompt. Artha builds the company around it — mission, market research, a live website, a company email inbox, and a queue of work — and then a team of AI agents keeps running it while you sleep.

## What it does

**Onboarding (one prompt → a company)**

- **Mission & positioning** — turns a rough idea into a clear mission and value proposition
- **Market research** — competitors, target audience and market sizing, pulled from live web search (Exa + Brave)
- **Website** — a landing page generated and deployed to `{slug}.tryartha.com`, with built-in analytics and an embeddable chat widget
- **Email** — a working company inbox at `{slug}@tryartha.com` for sending and receiving
- **Isolated database** — every company gets its own Neon Postgres database
- **Task queue** — a prioritized backlog of the next things the business needs

**Autonomy (the 24/7 part)**

Once a company exists, agents run on schedules and react to events:

| Agent | What it does | Trigger |
|---|---|---|
| Task executor | Picks the top task from the queue and does it | Every 4h |
| Email replier | Drafts replies to inbound email | Inbound webhook |
| Content planner | Plans and schedules social posts (X, Bluesky, LinkedIn) | Scheduled |
| Analytics agent | Reviews site traffic and proposes actions | Weekly |
| Competitive monitor | Tracks competitor changes | Weekly |
| SEO agent | Audits the site and recommends fixes | Monthly |
| Morning digest | Emails the founder what got done and what's next | Daily |

Founders can also chat with their company's AI assistant, run tasks on demand, connect custom domains, and run Meta ad campaigns.

## How it works

```
prompt ─► onboarding pipeline ─► company (DB, site, inbox, tasks)
                                        │
             cron + webhooks ◄──────────┘
                    │
                    ▼
         orchestrator ─► specialized agents ─► actions (site edits, email,
                                                 posts, research, docs)
                    │
                    ▼
            memory (Supermemory) + daily digest to the founder
```

- **Model routing** is per agent and lives in [`src/config/agent-models.ts`](./src/config/agent-models.ts) — each agent can use OpenAI or Anthropic models.
- **Agentic settings** (iterations, tools, thinking budgets) are in [`src/config/agent-agentic-config.ts`](./src/config/agent-agentic-config.ts).
- **Search routing** is in [`src/config/search-engines.ts`](./src/config/search-engines.ts).
- Full design notes: [`docs/agents/README.md`](./docs/agents/README.md).

## Tech stack

| Area | Tools |
|---|---|
| App | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Data | Neon (serverless Postgres) — one platform DB + one DB per company |
| AI | Anthropic, OpenAI, Supermemory |
| Search | Exa, Brave Search, Tavily (fallback) |
| Email | Postmark (transactional + inbound) |
| Hosting | Render (app, worker, cron), Cloudflare Pages (company sites) |
| Payments | Stripe |
| Observability | Sentry, PostHog |

## Repo layout

```
├── src/
│   ├── app/            # Next.js routes: dashboard, public sites, API, cron endpoints
│   ├── lib/            # DB, AI routing, search, email, integrations
│   ├── config/         # Agent model / search / agentic config
│   └── worker/         # Background worker (onboarding pipeline, email jobs)
├── packages/
│   ├── sdk/            # @artha/sdk — shared utilities
│   └── twitter-bot/    # @artha/twitter-bot — social bot
├── schema/             # Platform DB schema (platform.sql)
├── scripts/            # Setup, checks and one-off ops scripts
└── docs/               # Architecture, agents, integrations, pricing
```

## Running it locally

**Requirements:** Node 22+, a Neon account, Google OAuth credentials, and an OpenAI and/or Anthropic API key.

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run env:check            # validate env
npm run db:setup             # apply schema/platform.sql
npm run dev                  # http://localhost:3000
```

Optional processes:

```bash
npm run worker               # background worker (onboarding pipeline, email jobs)
npm run stripe:listen        # forward Stripe webhooks in test mode
```

Everything beyond the core (Postmark, Stripe, Cloudflare, Twitter/X, Bluesky, LinkedIn, Meta Ads, Supermemory, search engines) is optional and documented in [`.env.example`](./.env.example). Setup guides:

- [Postmark](./docs/postmark-setup.md)
- [Worker & onboarding](./docs/worker-onboarding.md)
- [Meta Ads flow](./docs/marketing-ads-flow.md)
- [Site analytics](./docs/site-analytics.md)

### Scheduled jobs

In production, crons are provisioned on [cron-job.org](https://cron-job.org) by calling `POST /api/admin/setup-crons` once after deploy. Every `/api/cron/*` endpoint requires `Authorization: Bearer $CRON_SECRET`.

## Pricing model

- **Free** — the full onboarding pipeline
- **Pro ($49/mo)** — 35 credits per month for autonomous and on-demand tasks
- **Credit pack ($25)** — 15 one-time credits

One credit = one task execution. Details in [`docs/pricing/credits-and-pricing.md`](./docs/pricing/credits-and-pricing.md).
