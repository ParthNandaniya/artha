# Artha Documentation

Artha is an AI-powered company builder. Users describe their business idea in one prompt, and Artha builds their entire company — mission, market research, landing page, email, tasks, and more. Each project gets an isolated Neon database and a website at `{slug}.tryartha.com`.

## Documentation Index

### Architecture

- [System Overview](./architecture/system-overview.md) — High-level architecture, tech stack, and how components connect
- [Database Schema](./architecture/database-schema.md) — Platform DB tables, per-company DBs, and key relationships
- [Data Flow](./architecture/data-flow.md) — How data moves through the system (onboarding, task execution, emails, billing)

### Agents (AI)

- [Agent Architecture](./agents/README.md) — Multi-agent system overview, orchestrator, credit model
- [Research Agent](./agents/research-agent.md) — Market research, user research, competitive analysis
- [Website Builder Agent](./agents/website-builder-agent.md) — Landing page generation and deployment
- [Email Writer Agent](./agents/email-writer-agent.md) — Email composition (welcome, digest, outreach, newsletter)
- [Task Generator Agent](./agents/task-generator-agent.md) — AI-generated task queue management
- [Twitter Agent](./agents/twitter-agent.md) — Tweet generation and posting
- [Chat & Email Orchestration](./agents/chat-and-email.md) — Chat interface and email-triggered task routing
- [Model Routing](./agents/model-routing.md) — Which AI model is used for each task and why

### API Reference

- [Authentication API](./api/authentication.md) — Google OAuth, sessions, site user auth
- [Projects API](./api/projects.md) — CRUD, settings, integrations, website, emails
- [Tasks API](./api/tasks.md) — Task creation, execution, reordering, generation
- [Chat API](./api/chat.md) — Streaming chat with AI assistant
- [Site API](./api/site-api.md) — Public APIs for company websites (auth, data, forms, payments, analytics)
- [Billing API](./api/billing.md) — Stripe checkout, webhooks, credit packs, Connect
- [Cron Jobs](./api/cron-jobs.md) — Scheduled jobs (digest, nightly tasks, nudge, billing, cleanup)

### Features

- [Onboarding Pipeline](./features/onboarding-pipeline.md) — 14-step company creation from a single prompt
- [Task System](./features/task-system.md) — Task lifecycle, credit-based execution, nightly automation
- [Email System](./features/email-system.md) — Inbound/outbound email, threads, digest, nudge emails
- [Website Hosting](./features/website-hosting.md) — Landing page generation, GitHub + Cloudflare Pages deploy
- [Chat Interface](./features/chat-interface.md) — AI chat with multi-agent orchestration
- [Analytics](./features/analytics.md) — Site visitor tracking (company sites) and PostHog (artha.run)
- [Leads & Outreach](./features/leads-and-outreach.md) — AI-powered lead discovery and cold outreach
- [Revenue & Marketplace](./features/revenue-and-marketplace.md) — Stripe Connect, customer subscriptions, payouts
- [Ads](./features/ads.md) — Ad campaign creation (Meta Ads integration)

### Worker & Background Jobs

- [Worker Architecture](./worker/architecture.md) — Job queue, polling, concurrency, stall detection
- [Pipeline Processor](./worker/pipeline-processor.md) — Onboarding pipeline step-by-step
- [Task Processor](./worker/task-processor.md) — Task execution flow
- [Email Processor](./worker/email-processor.md) — Digest and outbound email jobs

### Integrations

- [Supermemory](./integrations/supermemory.md) — Semantic AI memory (ingestion, retrieval, context building)
- [Postmark](./integrations/postmark.md) — Email delivery setup and configuration
- [Cloudflare](./integrations/cloudflare.md) — Pages deployment and DNS
- [Stripe](./integrations/stripe.md) — Subscriptions, Connect, webhooks
- [Tavily](./integrations/tavily.md) — Web search for research agents

### Deployment & Operations

- [Environment Variables](./deployment/environment-variables.md) — All required env vars and their purpose
- [Local Development](./deployment/local-development.md) — Setup, running, and testing locally
- [Cron Configuration](./deployment/cron-configuration.md) — Scheduled job setup and monitoring

### Pricing & Billing

- [Credits & Pricing](./pricing/credits-and-pricing.md) — Credit system, subscription tiers, cost analysis
- [Stripe Pricing Flow](./stripe-pricing-flow.md) — Connect, destination charges, revenue split
- [Marketplace Flow](./users/stripe-marketplace-flow.md) — End-customer subscriptions and payouts
- [Cost Analysis](./cost-analysis.md) — AI compute costs per operation

### Legacy / Reference

- [First Prompt Flow](./first-prompt.md) — Entry point flow for new users
- [User Flow](./user-flow.md) — User journey mapping
- [Marketing & Ads Flow](./marketing-ads-flow.md) — Ad campaign architecture (partial implementation)

## Quick Start

See the [root README](../README.md) for setup instructions, or jump to [Local Development](./deployment/local-development.md) for a detailed guide.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Project** | A company built by Artha. One user can have multiple projects. |
| **Pipeline** | The 14-step onboarding process that creates a company from a prompt. |
| **Agent** | A specialized AI module (research, website, email, tasks, twitter). |
| **Credits** | Currency for AI task execution. Pro = 35/month, Pack = 15 one-time. |
| **Website DB** | Per-company isolated Neon database (subscription-gated). |
| **Slug** | URL-safe project identifier. Used for `{slug}.tryartha.com` and `{slug}@tryartha.com`. |
