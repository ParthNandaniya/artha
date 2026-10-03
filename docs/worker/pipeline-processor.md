# Pipeline Processor

The pipeline processor (`src/worker/processors/pipeline.ts`) executes the 14-step company onboarding sequence.

## Pipeline Steps

| # | Step | AI Call | Side Effects |
|---|------|---------|-------------|
| 0 | User Research | Tavily web search | `users.google_data.research`, Supermemory ingest |
| 1 | Idea Research | Tavily + AI analysis | `documents` table |
| 2 | Save Profile | None | `users.google_data` (role, URL) |
| 3 | Name Company | AI branding | `memory` table (companyName, tagline) |
| 4 | Create Project | None | `projects` table insert, generate slug |
| 5 | Initialize Company | None | `company_profile`, memory + Supermemory |
| 6 | Generate Mission | AI generation | `documents` table, Supermemory ingest |
| 7 | Market Research | Tavily + AI analysis | `documents` table, Supermemory ingest |
| 8 | Landing Page | AI HTML generation | `projects.landing_page_html`, `pages` table |
| 9 | Tweet Launch | AI copy + Twitter API | `tweets` table, `projects.tweet_id/url` |
| 10 | Email Setup | Postmark API | `projects.company_email`, `memory` |
| 11 | GitHub Repo | GitHub API | Create repo in `artha-companies` org |
| 12 | Push Website + Cloudflare | Git push + Cloudflare API | Deploy to `{slug}.tryartha.com` |
| 13 | Task Queue | AI generation | 5-8 tasks in `tasks` table |
| 14 | Welcome Email | Postmark send | Email to founder |

## Step Details

### Step 0: User Research

Researches the founder's public background using Tavily web search. Results are cached in `users.google_data.research` so they're reused across projects.

### Step 3: Name Company

AI generates a company name and tagline based on:
- User's business description
- Founder's background
- Industry context

Generates a URL-safe slug via `generateUniqueProjectSlug()`. If the slug is taken, appends a 4-char random suffix.

### Step 5: Initialize Company

Creates the `company_profile` record and saves structured context:
- Company name, tagline, domain, founder role, industry
- All key metadata stored in `memory` table as key-value pairs
- Semantic summary ingested into Supermemory (company container)

### Step 8: Landing Page

AI generates complete HTML/CSS for a landing page:
- Uses React + Tailwind via CDN (no build step)
- Includes responsive design, animations, professional styling
- Validated for structure (HTML tags, CDN links, footer)
- Stored in `projects.landing_page_html` and `pages` table

### Step 9: Tweet Launch

Posts a launch announcement from the platform's X account:
- AI generates engaging tweet copy
- Posted via Twitter API v2
- Tweet ID and URL stored for dashboard display

### Step 10: Email Setup

Configures Postmark for company email:
- Verifies `{slug}@tryartha.com` sender identity
- Sets up inbound webhook URL
- Stores email address in `projects.company_email` and `memory`

### Steps 11-12: Deploy Website

1. Create GitHub repo in `artha-companies` organization
2. Push landing page HTML to `/website` directory
3. Create Cloudflare Pages project connected to the repo
4. Add custom domain `{slug}.tryartha.com`
5. Auto-deploy triggers on future pushes to `main` branch

### Step 13: Task Queue

AI generates 5-8 initial tasks based on:
- Company context (mission, research, competitors)
- Founder's background and goals
- Industry best practices

Tasks are prioritized and queued for nightly execution.

### Step 14: Welcome Email

Sends a welcome email containing:
- Research summary highlights
- Initial task list
- Link to launch tweet
- Dashboard access link

## Best-Effort Steps

Steps 9-12 (tweet, email, GitHub, Cloudflare) are best-effort — if they fail, the pipeline continues. The project is still functional without these integrations. Users can retry via the integrations panel.

## Critical Steps

Steps 0-8 and 13-14 are critical. If they fail, the pipeline marks the job as failed and the user can recover via `POST /api/ai/pipeline-recover`.

## Event Tracking

Each step emits events to `pipeline_events` table:
- `running` — Step started
- `completed` — Step finished successfully
- `failed` — Step encountered an error

Events include human-readable log messages and structured data for the dashboard's real-time progress display.
