# Onboarding Pipeline

The onboarding pipeline creates an entire company from a single user prompt. It runs as a background job with real-time progress updates on the dashboard.

## Entry Points

### Flowchart: How Users Start

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│  PATH A: Landing Page                PATH B: Dashboard        │
│  (New User)                          (Existing User)          │
│                                                               │
│  ┌──────────────┐                    ┌──────────────┐        │
│  │ User types   │                    │ User clicks  │        │
│  │ company idea │                    │ "New Company"│        │
│  └──────┬───────┘                    └──────┬───────┘        │
│         │                                    │                │
│         ▼                                    │                │
│  ┌──────────────┐                            │                │
│  │ Save prompt  │                            │                │
│  │ in cookie    │                            │                │
│  │ (10 min TTL) │                            │                │
│  └──────┬───────┘                            │                │
│         │                                    │                │
│         ▼                                    │                │
│  ┌──────────────┐                            │                │
│  │ Google OAuth  │                           │                │
│  │ Sign In       │                           │                │
│  └──────┬───────┘                            │                │
│         │                                    │                │
│         ▼                                    │                │
│  ┌──────────────┐                            │                │
│  │ Dashboard    │                            │                │
│  │ detects      │                            │                │
│  │ pending      │                            │                │
│  │ prompt       │                            │                │
│  └──────┬───────┘                            │                │
│         │                                    │                │
│         └────────────┬───────────────────────┘                │
│                      │                                        │
│                      ▼                                        │
│              ┌───────────────┐                                │
│              │ POST /api/ai/ │                                │
│              │ run-pipeline   │                                │
│              └───────┬───────┘                                │
│                      │                                        │
│                      ▼                                        │
│              ┌───────────────┐                                │
│              │ 14-Step       │                                │
│              │ Pipeline      │                                │
│              │ Begins        │                                │
│              └───────────────┘                                │
└───────────────────────────────────────────────────────────────┘
```

### 1. Landing Page (Start with Prompt)

User enters their idea on the landing page before signing in:

1. `POST /api/auth/start-with-prompt` — Saves prompt in `artha_pending_prompt` cookie (10 min TTL)
2. Redirects to Google OAuth
3. After auth callback, dashboard detects pending prompt via `GET /api/onboarding/pending-prompt`
4. Auto-triggers pipeline

### 2. Dashboard (Already Signed In)

User clicks "New Company" on the dashboard:

1. Enters company description in modal
2. `POST /api/ai/run-pipeline` is called directly

## Pipeline Execution

### Triggering

```
POST /api/ai/run-pipeline
Body: { "prompt": "AI tutoring platform...", "url": "https://existing-site.com" }
```

- Validates no existing pipeline is running for this user (409 if concurrent)
- Creates `job_queue` entry (type: `run_pipeline`)
- Starts background processing via `startPipelineJobInBackground()`
- Returns `{ jobId }` for status polling

### Status Tracking

The dashboard polls for live updates:

```
GET /api/ai/pipeline-status?jobId=42&afterId=100
```

Returns:
- Job status (running/completed/failed)
- Pipeline events since `afterId` (incremental cursor-based fetch)
- Queue position (if waiting)
- Stall detection info

### 14 Steps

See [Pipeline Processor](../worker/pipeline-processor.md) for detailed step-by-step breakdown.

```
Step 0: User Research          ──── Tavily web search ──── users.google_data
    │
Step 1: Idea Research          ──── Tavily + AI ──── documents table
    │
Step 2: Save Profile           ──── (no AI) ──── users.google_data
    │
Step 3: Name Company           ──── AI branding ──── memory table
    │
Step 4: Create Project         ──── (no AI) ──── projects table
    │
Step 5: Initialize Company     ──── (no AI) ──── company_profile + Supermemory
    │
Step 6: Generate Mission       ──── AI generation ──── documents + Supermemory
    │
Step 7: Market Research        ──── Tavily + AI ──── documents + Supermemory
    │
Step 8: Landing Page           ──── AI HTML gen ──── pages table + Cloudflare
    │
Step 9: Tweet Launch           ──── AI copy + Twitter API ──── tweets table
    │                               (best-effort)
Step 10: Email Setup           ──── Postmark API ──── projects.company_email
    │                               (best-effort)
Step 11-12: GitHub+Cloudflare  ──── Git + Cloudflare API ──── live website
    │                               (best-effort)
Step 13: Task Queue            ──── AI generation ──── 5-8 tasks in tasks table
    │
Step 14: Welcome Email         ──── Postmark ──── founder's inbox
    │
    ▼
PROJECT STATUS: "active" ──── Dashboard ready for use
```

Summary:
1. Research founder's background
2. Research the business idea (competitors, market)
3. Save founder profile
4. Generate company name and tagline
5. Create project record and slug
6. Initialize company profile and memory
7. Generate mission statement
8. Deep market research
9. Generate landing page HTML
10. Post launch tweet
11. Set up email
12. Create GitHub repo and deploy to Cloudflare Pages
13. Generate initial task queue (5-8 tasks)
14. Send welcome email

## Dashboard UI

During onboarding, the dashboard shows:

- **Pipeline progress bar** — Visual step indicator (`src/components/onboarding/pipeline-progress.tsx`)
- **Live activity feed** — Real-time step-by-step log with status icons (`src/components/onboarding/pipeline-live-activity.tsx`)

## Recovery

If the pipeline fails mid-execution:

```
POST /api/ai/pipeline-recover?jobId=42
```

Resumes from the last successful step. Best-effort steps (tweet, email, GitHub, Cloudflare) can be skipped — the project is still functional.

## Duration

Typical pipeline completion: 2-4 minutes, depending on web search latency and AI model response times.

## File References

| File | Purpose |
|------|---------|
| `src/app/api/ai/run-pipeline/route.ts` | API endpoint |
| `src/app/api/ai/pipeline-status/route.ts` | Status polling |
| `src/worker/processors/pipeline.ts` | Pipeline processor |
| `src/components/onboarding/pipeline-progress.tsx` | Progress bar UI |
| `src/components/onboarding/pipeline-live-activity.tsx` | Live feed UI |
