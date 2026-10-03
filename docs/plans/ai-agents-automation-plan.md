# AI Agents That Run Artha 24/7

> "We don't just build AI companies — we ARE one."
>
> Artha's own business runs on the same AI agent infrastructure we give to users.
> This plan turns Artha into a living showcase of autonomous AI operations.

---

## Why This Matters

1. **Dogfooding at its finest** — Users see Artha running on its own agents. Proof that the platform works.
2. **Marketing flywheel** — Every autonomous action (tweet, email, research report) generates content that attracts more users.
3. **Reduced ops burden** — Founders spend less time on repetitive business tasks.
4. **Competitive moat** — "The company that runs itself" is a powerful narrative.

---

## Current State

Artha already has strong foundations:
- **13 specialized AI agents** (research, email, twitter, leads, analytics, SEO, etc.)
- **Background worker** with job queue (PostgreSQL-backed, 2 concurrent workers)
- **14 cron jobs** via cron-job.org (nightly tasks, digests, content scheduling)
- **Agentic framework** with ReAct loops, tool registry, quality validation
- **Supermemory** for persistent AI memory across sessions

**What's missing:** These agents only serve *user projects*. None of them run Artha's own business operations. The crons are basic schedulers, not intelligent autonomous agents.

---

## The Plan: 7 Always-On Agents for Artha

### Agent 1: Growth Agent (Marketing & Content)

**Runs:** Every 4 hours
**Purpose:** Creates and publishes content that markets Artha

| Capability | Details |
|------------|---------|
| **Twitter/X posts** | 3-4 tweets/day about AI company building, showcasing live builds, sharing tips |
| **Blog/thread generation** | Weekly long-form content about what Artha built this week |
| **Live feed curation** | Selects the most impressive recent company builds for `/live` page highlights |
| **Trend monitoring** | Watches AI/startup Twitter for relevant conversations to engage with |

**Implementation:**

```
src/lib/agents/artha-ops/growth-agent.ts
```

- New `artha_growth` agent type added to agent registry
- Uses existing `twitter` agent as a sub-agent for posting
- New tool: `get_artha_stats` — pulls platform metrics (total companies built, active users, revenue)
- New tool: `get_recent_builds` — fetches impressive recent company builds (anonymized)
- Stores content calendar in Supermemory for consistency
- Cron: `POST /api/cron/artha-growth` every 4h

**New files:**
- `src/lib/agents/artha-ops/growth-agent.ts` — Agent logic
- `src/app/api/cron/artha-growth/route.ts` — Cron endpoint
- `src/lib/agents/artha-ops/tools/artha-stats.ts` — Platform stats tool

---

### Agent 2: Support Agent (Customer Success)

**Runs:** Continuously (event-driven via webhook + every 30 min sweep)
**Purpose:** Handles user support, answers questions, triages issues

| Capability | Details |
|------------|---------|
| **Inbound email triage** | Auto-respond to support@tryartha.com with helpful answers |
| **Onboarding follow-up** | Check new users 24h after signup, send personalized tips |
| **Churn detection** | Flag users who haven't logged in for 7 days, send re-engagement |
| **Feature guidance** | Proactively suggest underused features based on user behavior |

**Implementation:**

```
src/lib/agents/artha-ops/support-agent.ts
```

- Hooks into existing Postmark inbound webhook (`/api/emails/inbound`)
- New `artha_support` agent type
- Tools: `query_user_activity`, `send_support_email`, `query_memory`, `escalate_to_human`
- Escalation: If confidence < 0.7 or topic is billing/refund, flags for human review
- Stores support knowledge base in Supermemory (learns from past interactions)
- New DB table: `support_tickets` (tracks conversations, resolution status, response time)

**New files:**
- `src/lib/agents/artha-ops/support-agent.ts`
- `src/app/api/cron/artha-support-sweep/route.ts`
- `src/lib/agents/artha-ops/tools/user-activity.ts`
- Migration: `schema/migrations/003_support_tickets.sql`

---

### Agent 3: Sales Agent (Revenue & Conversion)

**Runs:** Every 2 hours
**Purpose:** Converts free users to paid, optimizes pricing signals

| Capability | Details |
|------------|---------|
| **Trial-to-paid nudges** | Identifies free users with high engagement, sends targeted upgrade prompts |
| **Credit usage alerts** | Notifies users approaching credit limits with upgrade options |
| **Win-back campaigns** | Re-engages churned subscribers with personalized offers |
| **Usage pattern analysis** | Identifies which features drive conversion, reports weekly |

**Implementation:**

```
src/lib/agents/artha-ops/sales-agent.ts
```

- New `artha_sales` agent type
- Tools: `get_conversion_funnel`, `get_user_segments`, `send_sales_email`, `query_memory`
- Segments users: free-active, free-dormant, trial-expiring, paid-at-risk, churned
- Each segment gets different messaging cadence and content
- Respects email frequency caps (max 1 sales email per user per week)
- Cron: `POST /api/cron/artha-sales` every 2h

**New files:**
- `src/lib/agents/artha-ops/sales-agent.ts`
- `src/app/api/cron/artha-sales/route.ts`
- `src/lib/agents/artha-ops/tools/conversion-funnel.ts`

---

### Agent 4: Analytics Agent (Business Intelligence)

**Runs:** Daily (6 AM) + weekly deep dive (Sundays)
**Purpose:** Generates business intelligence reports, surfaces insights

| Capability | Details |
|------------|---------|
| **Daily dashboard** | KPIs: new signups, active users, revenue, credit consumption, churn rate |
| **Weekly deep dive** | Cohort analysis, feature adoption, agent performance, cost analysis |
| **Anomaly detection** | Flags unusual patterns (spike in signups, drop in conversions, agent failures) |
| **Cost tracking** | Monitors AI API spend vs revenue, alerts if margins shrink |

**Implementation:**

```
src/lib/agents/artha-ops/analytics-agent.ts
```

- New `artha_analytics` agent type
- Tools: `query_platform_db`, `get_stripe_metrics`, `get_api_costs`, `query_memory`
- Outputs stored as documents in a dedicated Artha "meta-project"
- Anomaly detection: compares today's metrics to 7-day rolling average, flags >2 std dev
- Weekly report posted to a private Slack/Discord webhook (or email to founders)
- Cron: `POST /api/cron/artha-analytics` daily at 6 AM, weekly at Sunday 6 AM

**New files:**
- `src/lib/agents/artha-ops/analytics-agent.ts`
- `src/app/api/cron/artha-analytics/route.ts`
- `src/lib/agents/artha-ops/tools/platform-metrics.ts`

---

### Agent 5: Ops Agent (Infrastructure & Reliability)

**Runs:** Every 15 minutes
**Purpose:** Monitors system health, auto-heals common issues

| Capability | Details |
|------------|---------|
| **Worker health check** | Verifies worker is processing jobs, restarts if stalled |
| **API endpoint monitoring** | Pings critical endpoints, alerts on failures |
| **Database connection pool** | Monitors Neon connection health across all project DBs |
| **Stale job cleanup** | Reaps jobs stuck in `running` state beyond timeout (enhances existing reaper) |
| **Error rate tracking** | Aggregates Sentry errors, groups by agent/endpoint, alerts on spikes |

**Implementation:**

```
src/lib/agents/artha-ops/ops-agent.ts
```

- New `artha_ops` agent type (lightweight — uses GPT-4o-mini for speed)
- Tools: `check_worker_health`, `check_endpoint`, `get_error_rates`, `restart_worker`
- Runs as a lightweight cron, not through the heavyweight agentic framework
- Direct SQL queries for job queue health
- Alerts via email to founders + optional webhook
- Cron: `POST /api/cron/artha-ops-health` every 15 min

**New files:**
- `src/lib/agents/artha-ops/ops-agent.ts`
- `src/app/api/cron/artha-ops-health/route.ts`

---

### Agent 6: Product Agent (User Research & Roadmap)

**Runs:** Weekly (Mondays)
**Purpose:** Analyzes user behavior and feedback to suggest product improvements

| Capability | Details |
|------------|---------|
| **Feature usage analysis** | Which panels/agents are most/least used |
| **User feedback synthesis** | Aggregates support emails, chat messages for common themes |
| **Competitor tracking** | Monitors competitor products (using existing competitive_monitor) |
| **Roadmap suggestions** | Weekly doc with prioritized feature recommendations |

**Implementation:**

```
src/lib/agents/artha-ops/product-agent.ts
```

- New `artha_product` agent type
- Tools: `get_feature_usage`, `get_user_feedback`, `web_search`, `query_memory`
- Uses research agent as sub-agent for competitive analysis
- Outputs a structured "Product Weekly" document
- Cron: `POST /api/cron/artha-product-review` Mondays at 9 AM

**New files:**
- `src/lib/agents/artha-ops/product-agent.ts`
- `src/app/api/cron/artha-product-review/route.ts`

---

### Agent 7: Community Agent (Social & Engagement)

**Runs:** Every 1 hour
**Purpose:** Engages with the community, responds to mentions, builds presence

| Capability | Details |
|------------|---------|
| **Twitter mention monitoring** | Responds to @mentions and relevant keyword discussions |
| **Showcase generation** | Creates "Built with Artha" showcases from successful projects |
| **User milestone celebrations** | Tweets/emails when users hit milestones (first lead, first sale) |
| **Community content** | Curates weekly "Top Builds" showcase for the live feed |

**Implementation:**

```
src/lib/agents/artha-ops/community-agent.ts
```

- New `artha_community` agent type
- Tools: `search_twitter_mentions`, `get_user_milestones`, `post_tweet`, `query_memory`
- Personality: enthusiastic but not spammy, authentic
- Rate limited: max 10 tweets/day, max 1 DM per user per week
- Cron: `POST /api/cron/artha-community` every 1h

**New files:**
- `src/lib/agents/artha-ops/community-agent.ts`
- `src/app/api/cron/artha-community/route.ts`

---

## Architecture

### Directory Structure

```
src/lib/agents/artha-ops/
├── index.ts                    # Registry & shared types
├── growth-agent.ts             # Agent 1: Marketing & Content
├── support-agent.ts            # Agent 2: Customer Success
├── sales-agent.ts              # Agent 3: Revenue & Conversion
├── analytics-agent.ts          # Agent 4: Business Intelligence
├── ops-agent.ts                # Agent 5: Infrastructure
├── product-agent.ts            # Agent 6: User Research
├── community-agent.ts          # Agent 7: Social & Engagement
├── tools/
│   ├── artha-stats.ts          # Platform metrics
│   ├── user-activity.ts        # User behavior queries
│   ├── conversion-funnel.ts    # Sales/conversion data
│   ├── platform-metrics.ts     # BI metrics
│   └── common.ts               # Shared utilities
└── config.ts                   # Agent schedules, thresholds, limits
```

### How They Integrate with Existing Infrastructure

```
┌─────────────────────────────────────────────────┐
│                 cron-job.org                      │
│  (external scheduler - hits HTTP endpoints)      │
└────────────┬────────────────────────────────────┘
             │ POST /api/cron/artha-*
             ▼
┌─────────────────────────────────────────────────┐
│           Next.js API Routes                     │
│  /api/cron/artha-growth                          │
│  /api/cron/artha-support-sweep                   │
│  /api/cron/artha-sales                           │
│  /api/cron/artha-analytics                       │
│  /api/cron/artha-ops-health                      │
│  /api/cron/artha-product-review                  │
│  /api/cron/artha-community                       │
└────────────┬────────────────────────────────────┘
             │ enqueue job
             ▼
┌─────────────────────────────────────────────────┐
│            job_queue (PostgreSQL)                 │
│  type: 'artha_growth' | 'artha_support' | ...    │
└────────────┬────────────────────────────────────┘
             │ claimed by
             ▼
┌─────────────────────────────────────────────────┐
│          Background Worker                       │
│  New processor: processArthaOpsJob()             │
│  Routes to appropriate agent                     │
└────────────┬────────────────────────────────────┘
             │ executes
             ▼
┌─────────────────────────────────────────────────┐
│        Agentic Framework (existing)              │
│  ReAct loops, tools, quality validation          │
│  Extended thinking, sub-agents                   │
└────────────┬────────────────────────────────────┘
             │ uses
             ▼
┌─────────────────────────────────────────────────┐
│           External Services                      │
│  Claude/OpenAI, Postmark, Twitter, Stripe,       │
│  Supermemory, Neon, Sentry                       │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Same infrastructure as user agents** — Artha ops agents use the same agentic framework, worker, and job queue. This is the whole point: dogfooding.

2. **Dedicated "Artha meta-project"** — A special project in the platform DB that represents Artha itself. Agents store their outputs (reports, content plans, support knowledge) as documents in this project. This means we can view Artha's own operations through the same dashboard UI.

3. **No special privileges** — Artha ops agents don't bypass the agentic framework's quality checks or validation. They go through the same ReAct loops and quality judges. This keeps us honest.

4. **Human-in-the-loop for high-stakes actions** — Sending sales emails, publishing blog posts, and replying to support tickets all go through an approval queue by default. Can be toggled to auto-approve per agent as confidence builds.

5. **Cost-aware execution** — Each artha-ops agent has a daily API budget cap. If the analytics agent detects API costs exceeding thresholds, it can reduce execution frequency for other agents.

---

## Database Changes

### New table: `artha_ops_runs`

Tracks every autonomous agent execution for auditing and the public showcase.

```sql
CREATE TABLE artha_ops_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,           -- 'growth', 'support', 'sales', etc.
  trigger TEXT NOT NULL,              -- 'cron', 'webhook', 'manual'
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  input JSONB,                        -- What the agent received
  output JSONB,                       -- What the agent produced
  actions_taken JSONB,                -- List of actions (tweets sent, emails drafted, etc.)
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_artha_ops_runs_agent ON artha_ops_runs(agent_name, created_at DESC);
CREATE INDEX idx_artha_ops_runs_status ON artha_ops_runs(status) WHERE status = 'running';
```

### New table: `artha_ops_approvals`

Human-in-the-loop approval queue for high-stakes agent actions.

```sql
CREATE TABLE artha_ops_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES artha_ops_runs(id),
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,          -- 'send_email', 'post_tweet', 'publish_blog'
  payload JSONB NOT NULL,             -- The proposed action details
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewed_by TEXT,                   -- Who approved/rejected
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artha_ops_approvals_pending ON artha_ops_approvals(status) WHERE status = 'pending';
```

### New table: `support_tickets`

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'auto_resolved', 'escalated', 'closed'
  channel TEXT NOT NULL,                -- 'email', 'chat', 'twitter'
  messages JSONB DEFAULT '[]',
  agent_confidence NUMERIC(3,2),
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Create `src/lib/agents/artha-ops/` directory structure
- [ ] Create Artha "meta-project" in platform DB
- [ ] Add `artha_ops_runs` and `artha_ops_approvals` tables
- [ ] Add new job types to worker (`processArthaOpsJob` router)
- [ ] Build shared tools (`artha-stats`, `platform-metrics`, `user-activity`)
- [ ] Build approval queue API (`/api/artha-ops/approvals` — list, approve, reject)
- [ ] Add new agent types to `AgentName` union type in `types.ts`
- [ ] Add agentic configs for all 7 new agents in `agent-agentic-config.ts`

### Phase 2: Core Agents (Week 3-4)

- [ ] **Ops Agent** (start here — lowest risk, highest immediate value)
  - Health checks, job queue monitoring, error rate tracking
  - Wire up 15-min cron
- [ ] **Analytics Agent**
  - Daily KPI reports, anomaly detection
  - Wire up daily cron
- [ ] **Support Agent**
  - Inbound email triage, auto-responses
  - Hook into Postmark inbound webhook
  - Add `support_tickets` table

### Phase 3: Growth Agents (Week 5-6)

- [ ] **Growth Agent**
  - Content generation, tweet scheduling
  - Wire up 4h cron
- [ ] **Community Agent**
  - Mention monitoring, milestone celebrations
  - Wire up 1h cron
- [ ] **Sales Agent**
  - User segmentation, targeted nudges
  - Wire up 2h cron

### Phase 4: Intelligence (Week 7-8)

- [ ] **Product Agent**
  - Feature usage analysis, roadmap suggestions
  - Wire up weekly cron
- [ ] **Cross-agent coordination**
  - Agents can read each other's outputs via Supermemory
  - Analytics agent adjusts other agents' schedules based on budget
  - Growth agent uses product agent's insights for content topics

### Phase 5: Public Showcase (Week 9-10)

- [ ] **Live Ops Dashboard** — New `/ops` page showing real-time agent activity
  - Which agents ran, when, what they did
  - Success rates, tokens used, actions taken
  - "Artha is running itself" narrative
- [ ] **Public API** — `/api/public/ops-feed` for embedding agent activity
- [ ] **Blog post / landing page section** — "How Artha Runs Itself"
- [ ] **User-facing template** — Let users clone Artha's ops setup for their own projects

---

## Cron Schedule Summary

| Agent | Endpoint | Frequency | Model |
|-------|----------|-----------|-------|
| Ops | `/api/cron/artha-ops-health` | Every 15 min | GPT-4o-mini |
| Community | `/api/cron/artha-community` | Every 1 hour | Claude Sonnet |
| Sales | `/api/cron/artha-sales` | Every 2 hours | Claude Sonnet |
| Growth | `/api/cron/artha-growth` | Every 4 hours | Claude Opus |
| Support | `/api/cron/artha-support-sweep` | Every 30 min | Claude Sonnet |
| Analytics | `/api/cron/artha-analytics` | Daily 6 AM + Weekly Sunday | Claude Sonnet |
| Product | `/api/cron/artha-product-review` | Weekly Monday 9 AM | Claude Opus |

---

## Cost Estimates

| Agent | Runs/Day | Avg Tokens/Run | Est. Daily Cost |
|-------|----------|----------------|-----------------|
| Ops | 96 | 500 | ~$0.50 |
| Community | 24 | 2,000 | ~$1.50 |
| Sales | 12 | 3,000 | ~$2.00 |
| Growth | 6 | 5,000 | ~$3.00 |
| Support | 48 | 1,500 | ~$2.50 |
| Analytics | 1-2 | 8,000 | ~$1.00 |
| Product | 0.14 | 15,000 | ~$0.30 |
| **Total** | | | **~$11/day (~$330/month)** |

This is well within reason for a business that charges $49/mo per user. Even 7 paying users cover the entire ops agent infrastructure.

---

## Safeguards

1. **Daily budget caps** — Each agent has a max daily API spend. If exceeded, agent skips until next day.
2. **Rate limits** — Max emails/tweets per day per agent. No spam.
3. **Approval queue** — High-stakes actions require human approval (can be auto-approved per agent).
4. **Kill switch** — Single env var `ARTHA_OPS_ENABLED=false` disables all ops agents instantly.
5. **Audit trail** — Every run logged in `artha_ops_runs` with full input/output.
6. **Anomaly circuit breaker** — If an agent fails 3 consecutive times, it auto-disables and alerts founders.
7. **No user data leakage** — Ops agents only see aggregated/anonymized data, never individual user content.

---

## What Users See (The Showcase)

The ultimate goal: users visit Artha and see a transparent "ops" view:

> **"Right now, Artha's Growth Agent just published a tweet about this week's top builds.
> The Support Agent resolved 3 tickets in the last hour.
> The Analytics Agent detected a 40% signup increase and notified the Sales Agent to adjust messaging."**

This becomes the most powerful sales pitch: *"Everything you see running Artha? You can build the same thing for your business."*

### User-Facing Features

1. **`/ops` live dashboard** — Public page showing agent activity in real-time
2. **"Powered by Artha Agents" badge** — On every automated action (tweet footer, email signature)
3. **"Clone this setup" button** — Users can replicate Artha's ops agents for their own projects
4. **Weekly transparency report** — Auto-generated blog post: "This Week in Artha Ops"

---

## Success Metrics

| Metric | Target (30 days) | Target (90 days) |
|--------|-------------------|-------------------|
| Ops agent uptime | 99%+ | 99.5%+ |
| Support auto-resolution rate | 40% | 65% |
| Growth: tweets/week | 21+ | 28+ |
| Sales: free-to-paid conversion lift | +5% | +15% |
| Avg support response time | < 5 min | < 2 min |
| User engagement with /ops page | 100 views/week | 500 views/week |
| Users who clone ops setup | 5 | 25 |
