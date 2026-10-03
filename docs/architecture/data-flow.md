# Data Flow

How data moves through Artha's key workflows.

## 1. Onboarding Pipeline

```
User submits company idea
        │
        ▼
POST /api/ai/run-pipeline
        │
        ├─ Creates job in job_queue (type: run_pipeline)
        ├─ Starts background processing
        └─ Returns jobId for status polling
        │
        ▼
Worker picks up job (pipeline.ts)
        │
        ├─ Step 0: User Research
        │   └─ Web search (Tavily) → users.google_data.research
        │   └─ Ingest into Supermemory (artha_user_{userId})
        │
        ├─ Step 1: Idea Research
        │   └─ Web search for competitors/market → documents table
        │
        ├─ Step 2: Save Profile
        │   └─ Founder role + company URL → users.google_data
        │
        ├─ Step 3: Name Company
        │   └─ AI generates name + tagline → memory table
        │
        ├─ Step 4: Create Project
        │   └─ Insert into projects table, generate slug
        │
        ├─ Step 5: Initialize Company
        │   └─ Create company_profile, save to memory + Supermemory
        │
        ├─ Step 6: Generate Mission
        │   └─ AI mission → documents table + Supermemory
        │
        ├─ Step 7: Market Research
        │   └─ Deep analysis → documents table + Supermemory
        │
        ├─ Step 8: Landing Page
        │   └─ AI generates HTML → projects.landing_page_html + pages table
        │
        ├─ Step 9: Tweet Launch
        │   └─ Post to X → projects.tweet_id, tweet_url + tweets table
        │
        ├─ Step 10: Email Setup
        │   └─ Postmark config → projects.company_email + memory
        │
        ├─ Steps 11-12: GitHub + Cloudflare
        │   └─ Push HTML → GitHub repo → Cloudflare Pages auto-deploy
        │
        ├─ Step 13: Task Queue
        │   └─ AI generates 5-8 tasks → tasks table
        │
        └─ Step 14: Welcome Email
            └─ Send via Postmark with research summary
```

**Status tracking:** Each step emits events to `pipeline_events` table. The dashboard polls `GET /api/ai/pipeline-status` for live updates.

## 2. Task Execution

```
User clicks "Run Task" on dashboard
        │
        ▼
POST /api/tasks/run
        │
        ├─ Validates credits (task_credits >= credits_cost)
        ├─ Deducts credits via decrement_task_credits()
        ├─ Enqueues job (type: run_task) in job_queue
        └─ Returns jobId
        │
        ▼
Worker picks up job (tasks.ts)
        │
        ├─ Build context:
        │   ├─ Company profile (memory table)
        │   ├─ Founder profile (users.google_data)
        │   └─ Semantic memories (Supermemory search)
        │
        ├─ Route by task type:
        │   ├─ Research → runResearchAgent() → documents table
        │   ├─ Outreach → executeTask() → sendCompanyColdEmail()
        │   └─ Other → executeTask() → task.result
        │
        ├─ Persist result → tasks.result, tasks.status = 'completed'
        │
        └─ Ingest outcome → Supermemory (ingestTaskResult)
```

## 3. Chat Flow

```
User sends message in chat sidebar
        │
        ▼
POST /api/chat (SSE streaming)
        │
        ├─ Insert user message → chat_messages table
        ├─ Load last 20 messages for context
        ├─ Build context (company + founder + semantic memories)
        │
        ▼
orchestrateChat()
        │
        ├─ Direct answer (simple questions)
        │   └─ Cost: 0.1 credits
        │   └─ Stream text response → SSE events
        │
        └─ Task orchestration (actionable requests)
            └─ Route to agents (research, email, website, etc.)
            └─ Cost: varies by agent (0.5-1.5 credits)
            └─ Stream ExecutionSummary → SSE events
        │
        ▼
Store assistant response → chat_messages (with metadata)
Ingest conversation → Supermemory (if substantive, ≥220 chars)
```

## 4. Email Flow

### Inbound Email

```
External email → {slug}@tryartha.com or agents@artha.run
        │
        ▼
Postmark webhook → POST /api/postmark/inbound
        │
        ├─ Store raw email → email_inbound table
        ├─ Create/update thread → email_threads table
        ├─ Ingest into Supermemory → ingestInboundEmail()
        │
        ├─ Route by sender:
        │   ├─ Founder email → orchestrateEmail() → execute tasks
        │   └─ External email → AI auto-reply via sendAgentReply()
        │
        └─ Store thread message → email_messages table
```

### Morning Digest

```
Cron: POST /api/cron/morning-digest (daily)
        │
        ├─ Query active + subscribed projects
        │
        ▼
For each project:
        │
        ├─ Fetch completed tasks (last 24h) → tasks table
        ├─ Fetch upcoming tasks (next 5) → tasks table
        ├─ Get analytics summary → site_analytics table
        ├─ Get subscriber stats → marketplace_subscribers
        ├─ Get semantic context → Supermemory search
        │
        ▼
sendCompanyDigest() → Postmark → founder's email
```

### Site Nudge

```
Cron: POST /api/cron/site-nudge (daily)
        │
        ├─ Query active projects WITHOUT subscription
        ├─ Filter: not nudged in past 6 days
        │
        ▼
For each project:
        │
        ├─ Check: ≥3 unique visitors in past 7 days → site_analytics
        │
        ▼ (if qualified)
sendSiteActivityNudge() → Postmark → founder's email
Update projects.last_nudge_sent_at
```

## 5. Billing Flow

### Subscription Purchase

```
User clicks "Upgrade to Pro"
        │
        ▼
POST /api/stripe/checkout
        │
        ├─ Create Stripe customer (if new)
        ├─ Create Checkout session ($49/month)
        └─ Return checkout URL
        │
        ▼
User completes payment on Stripe
        │
        ▼
Stripe → POST /api/stripe/webhook (checkout.session.completed)
        │
        ├─ Check idempotency → stripe_webhook_events
        ├─ Update projects.subscription_status = 'active'
        ├─ Add 35 credits (40 first month) → projects.task_credits
        ├─ Create subscription record
        └─ Provision website DB (if not exists)
```

### Monthly Renewal

```
Stripe auto-charges → POST /api/stripe/webhook (invoice.paid)
        │
        ├─ Add 35 credits → projects.task_credits
        └─ Update current_period_end
```

### Credit Pack

```
POST /api/stripe/credit-pack
        │
        ├─ Create Checkout session ($25)
        └─ On payment → add 15 credits
```

## 6. Website Hosting Flow

```
Pipeline generates HTML
        │
        ▼
Save to projects.landing_page_html + pages table
        │
        ▼
Create GitHub repo (artha-companies/{slug})
        │
        ├─ Push HTML to /website directory
        │
        ▼
Setup Cloudflare Pages
        │
        ├─ Connect to GitHub repo
        ├─ Auto-deploy on push
        └─ Add custom domain: {slug}.tryartha.com
        │
        ▼
Site live at https://{slug}.tryartha.com
        │
        ▼
Tracking script injected
        │
        └─ Events → POST /api/site/{slug}/analytics → site_analytics table
```

## 7. Nightly Task Automation

```
Cron: POST /api/cron/nightly-tasks (daily)
        │
        ├─ Query all projects with task_credits > 0
        │
        ▼
For each project:
        │
        ├─ Has queued tasks?
        │   ├─ YES → Queue top task as run_task job
        │   └─ NO → Queue generate_tasks job (creates 5 new tasks, then runs top)
        │
        ▼
Worker executes tasks overnight
        │
        ▼
Morning digest reports results
```

## Memory Architecture

Artha uses two complementary memory systems:

### Structured Memory (Neon `memory` table)
- Key-value pairs per project
- Fast, deterministic lookups
- Keys: `companyName`, `tagline`, `mission`, `competitors`, `emailConfigured`, etc.
- Used for: AI prompt context building, dashboard display

### Semantic Memory (Supermemory)
- Vector-based hybrid search (BM25 + embeddings)
- Scoped containers: `artha_user_{userId}` and `artha_company_{projectId}`
- Content-hash deduplication with sync map tracking
- Used for: Relevant context retrieval in tasks, chat, and emails
- Max 2200 chars per memory, max 150 entries per sync map

### Context Building

When an AI agent needs context, it combines three sources:

```
buildTaskContext(projectId, userId, taskDescription)
        │
        ├─ 1. Company Profile (structured)
        │   └─ memory table: name, tagline, mission, competitors, etc.
        │
        ├─ 2. Founder Profile (structured)
        │   └─ users.google_data: background, role, linkedin, etc.
        │
        └─ 3. Semantic Memories (searched)
            └─ Supermemory query: task description + company context
            └─ Returns top relevant memories (≤1800 chars)
```
