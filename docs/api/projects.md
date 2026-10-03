# Projects API

All project endpoints require platform authentication (`getSession()`).

## Core CRUD

### `GET /api/projects`

List all projects for the authenticated user.

**Response:**
```json
[
  {
    "id": 1,
    "name": "TutorAI",
    "slug": "tutorai",
    "status": "active",
    "subscription_status": "active",
    "task_credits": 28.5,
    "company_email": "tutorai@tryartha.com",
    "created_at": "2026-03-01T..."
  }
]
```

Projects are ordered by `created_at DESC` and include computed credits via `withProjectCredits()`.

### `POST /api/projects`

Create a new project.

**Body:**
```json
{
  "name": "TutorAI",
  "slug": "tutorai",
  "status": "onboarding",
  "memory": { "companyDescription": "AI tutoring platform..." }
}
```

### `PATCH /api/projects`

Update project name. Validates ownership (`user_id` match).

**Body:**
```json
{ "id": 1, "name": "New Name" }
```

## Settings

### `GET /api/projects/settings`

Get project configuration.

**Query:** `projectId`

### `PATCH /api/projects/settings`

Update project settings (email preferences, notification toggles).

## Analytics

### `GET /api/projects/analytics`

Get aggregated analytics for a project.

**Query:** `projectId`

**Response:** Visitor counts, pageviews, engagement metrics, top referrers. Data comes from `site_analytics` table.

## Usage

### `GET /api/projects/usage`

Get credit usage and quota information.

**Query:** `projectId`

## Integrations

### `GET /api/projects/integrations`

Get status of project integrations (email setup, Twitter connection, Stripe Connect).

### `POST /api/projects/integrations`

Trigger integration recovery (retry failed email setup, reconnect Twitter).

### `POST /api/projects/integrations/test-email`

Send a test email to verify Postmark configuration for the project.

## Website

### `GET /api/projects/website`

Get website draft and deployment status.

**Query:** `projectId`

### `POST /api/projects/website`

Generate or deploy website.

**Body:**
```json
{
  "projectId": 1,
  "action": "setup"  // or "deploy"
}
```

- **`setup`** — AI generates landing page HTML, saves as draft
- **`deploy`** — Pushes to GitHub repo, triggers Cloudflare Pages auto-deploy

First build is free. Subsequent updates cost credits.

### `POST /api/projects/website/preview`

Preview website changes before deploying.

### `POST /api/projects/website/database`

Manage the per-company website database (view tables, schema).

## Emails

### `GET /api/projects/emails`

List email threads for a project.

**Query:** `projectId`

**Response:**
```json
{
  "threads": [...],
  "stats": { "total": 12, "unread": 3 }
}
```

On first access, backfills threads from `email_inbound` table.

### `POST /api/projects/emails`

Send an outbound company email.

**Body:**
```json
{
  "projectId": 1,
  "to": "recipient@example.com",
  "subject": "Hello from TutorAI",
  "htmlBody": "<p>...</p>",
  "inReplyTo": "optional-message-id",
  "threadId": 5
}
```

Sends via Postmark company server (`{slug}@tryartha.com`).

### `GET /api/projects/emails/[threadId]`

Get all messages in a specific email thread.

### `PATCH /api/projects/emails/[threadId]`

Update thread (e.g., mark as read).
