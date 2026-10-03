# System Overview

## What Artha Is

Artha is an AI-powered company builder. A user describes their business idea in a single prompt, and Artha autonomously creates:

- Company name, mission, and tagline
- Market research and competitive analysis
- Landing page website (hosted at `{slug}.tryartha.com`)
- Email address (`{slug}@tryartha.com`)
- Launch tweet
- Initial task queue for ongoing execution

After onboarding, Artha continues to operate the company through AI agents — executing tasks nightly, sending digest emails, tracking site visitors, and managing leads.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Full-stack React with SSR |
| **Language** | TypeScript | Type-safe across frontend and backend |
| **UI** | Tailwind CSS + shadcn/ui | Component library and styling |
| **Database** | Neon (PostgreSQL serverless) | Platform DB + per-company isolated DBs |
| **AI (Primary)** | OpenAI (GPT-5.4 / GPT-5) | Text generation, research, task execution |
| **AI (Backup)** | Anthropic (Claude Sonnet / Haiku) | Fallback and specific agent tasks |
| **Email** | Postmark | Transactional email (dual-server: platform + company) |
| **Payments** | Stripe | Subscriptions, credit packs, Connect for marketplace |
| **Memory** | Supermemory | Semantic context storage and retrieval |
| **Web Search** | Tavily | Live web search for research agents |
| **Hosting** | Cloudflare Pages | Company website hosting and CDN |
| **Analytics** | PostHog (artha.run) + Custom (company sites) | User and visitor tracking |
| **Auth** | Google OAuth + jose (JWT) | Authentication and session management |
| **State** | React Query (TanStack) | Client-side data fetching and caching |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js App Router (React 19 + Tailwind + shadcn/ui)       │
│  ├── Dashboard (projects, tasks, chat, analytics, email)    │
│  ├── Landing Page (marketing)                                │
│  └── Company Sites (/site/[slug])                           │
└─────────────┬───────────────────────────────────────────────┘
              │ API Routes
┌─────────────▼───────────────────────────────────────────────┐
│                     API LAYER                                │
│  ├── /api/auth/*        (Google OAuth, sessions)            │
│  ├── /api/ai/*          (pipeline, tasks, enhance)          │
│  ├── /api/projects/*    (CRUD, website, emails, settings)   │
│  ├── /api/tasks/*       (create, run, generate, reorder)    │
│  ├── /api/chat          (SSE streaming AI chat)             │
│  ├── /api/stripe/*      (checkout, webhooks, Connect)       │
│  ├── /api/site/[slug]/* (public site APIs)                  │
│  ├── /api/postmark/*    (inbound email webhook)             │
│  └── /api/cron/*        (scheduled jobs)                    │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                   BACKGROUND WORKER                          │
│  Polling loop (2s interval, 2 concurrent workers)           │
│  ├── Pipeline Processor   (14-step onboarding)              │
│  ├── Task Processor       (AI agent execution)              │
│  ├── Email Processor      (digest + outbound)               │
│  └── Task Generator       (AI task suggestions)             │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                   DATA & SERVICES                            │
│  ├── Neon (Platform DB)     — users, projects, jobs, tasks  │
│  ├── Neon (Company DBs)     — per-project isolated DBs      │
│  ├── Supermemory            — semantic context (BM25+embed) │
│  ├── Postmark               — email send/receive            │
│  ├── Stripe                 — billing, Connect, webhooks    │
│  ├── Cloudflare Pages       — company site hosting          │
│  ├── OpenAI / Anthropic     — AI model inference            │
│  ├── Tavily                 — web search                    │
│  └── PostHog                — artha.run analytics           │
└─────────────────────────────────────────────────────────────┘
```

## Key Directories

```
src/
├── app/                    # Next.js pages and API routes
│   ├── api/                # All API endpoints
│   │   ├── ai/             # Pipeline, task running, enhance
│   │   ├── auth/           # Google OAuth flow
│   │   ├── chat/           # AI chat endpoint
│   │   ├── cron/           # Scheduled jobs
│   │   ├── projects/       # Project CRUD, website, emails
│   │   ├── site/[slug]/    # Public company site APIs
│   │   ├── stripe/         # Billing webhooks and checkout
│   │   ├── tasks/          # Task management
│   │   └── postmark/       # Inbound email webhook
│   ├── (dashboard)/        # Dashboard pages
│   ├── dashboard/[slug]/   # Project workspace
│   └── site/[slug]/        # Company website rendering
├── components/             # React components
│   ├── panels/             # Dashboard tab panels
│   ├── modals/             # Dialogs (tasks, credits, paywall)
│   ├── slide-overs/        # Detail views
│   ├── chat/               # Chat sidebar
│   ├── onboarding/         # Pipeline progress UI
│   └── ui/                 # shadcn/ui primitives
├── hooks/                  # React Query data hooks
├── contexts/               # React context providers
├── config/                 # Credit costs, model routing
├── lib/                    # Core business logic
│   ├── agents/             # AI agent implementations
│   ├── ai/                 # Model wrappers, research, website builder
│   ├── ads/                # Ad campaign service
│   ├── database/           # Website DB query execution
│   └── site-api/           # Site API helpers (CORS, auth, rate limit)
└── worker/                 # Background job processing
    └── processors/         # Pipeline, tasks, email, generate-tasks
schema/
└── platform.sql            # Platform DB schema (idempotent)
docs/                       # This documentation
scripts/                    # Setup and maintenance scripts
```

## Daily Operations Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   ARTHA DAILY OPERATIONS                         │
│                                                                   │
│  MORNING (8 AM)                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ morning-     │────▶│ Build digest │────▶│ Send email  │    │
│  │ digest cron  │     │ (tasks +     │     │ to founder  │    │
│  │              │     │  analytics)  │     │             │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                   │
│  DAYTIME (User Active)                                           │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ User chats   │────▶│ AI agent     │────▶│ Execute     │    │
│  │ or runs      │     │ processes    │     │ task, save  │    │
│  │ tasks        │     │ request      │     │ results     │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                   │
│  EVENING (10 PM)                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ nightly-     │────▶│ Run top      │────▶│ Generate    │    │
│  │ tasks cron   │     │ queued task  │     │ new tasks   │    │
│  │              │     │ (if any)     │     │ (if empty)  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                   │
│  DAILY (6 AM)                                                    │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ site-nudge   │────▶│ Check site   │────▶│ Send re-    │    │
│  │ cron         │     │ traffic ≥3   │     │ engagement  │    │
│  │              │     │ visitors/7d  │     │ email       │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Core Design Principles

1. **One prompt, full company** — The onboarding pipeline creates everything from a single user input.
2. **Credit-based execution** — AI tasks cost credits, not flat rate. Users control spend.
3. **Per-company isolation** — Each project gets its own Neon database for website data.
4. **Two-tier memory** — Structured data in Neon (fast, deterministic) + semantic context in Supermemory (AI-searchable).
5. **Dual email scope** — Platform emails from `agents@artha.run`, company emails from `{slug}@tryartha.com`.
6. **Background processing** — Long-running AI tasks use a job queue with worker polling, not blocking API requests.
7. **Idempotent migrations** — Platform schema uses `IF NOT EXISTS` for safe, repeatable deployments.

## Authentication Model

- **Platform users** — Google OAuth with server-side sessions (stored in `sessions` table, accessed via `jose` JWT)
- **Site users** — Per-company user accounts with email/password auth (stored in company's website DB)
- **Webhooks** — Stripe uses signature verification; Postmark uses shared secret header; Cron uses bearer token

## Multi-Tenancy

Each project in Artha is an isolated tenant:

| Resource | Isolation Method |
|----------|-----------------|
| Website DB | Separate Neon database per project |
| Email | Unique address `{slug}@tryartha.com` per project |
| Website | Separate Cloudflare Pages project per company |
| Memory | Scoped Supermemory container `artha_company_{id}` |
| Analytics | Filtered by `project_id` in shared `site_analytics` table |
| Revenue | Separate Stripe Connect account per founder |
