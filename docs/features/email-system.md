# Email System

Artha has a dual-scope email system powered by Postmark.

## Email Addresses

| Scope | Address | Server | Purpose |
|-------|---------|--------|---------|
| Platform | `agents@artha.run` | Platform server | System emails, digest, nudge |
| Company | `{slug}@tryartha.com` | Company server | Company outbound, inbound |

## Flowchart: Email Types Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARTHA EMAIL TYPES                              │
│                                                                   │
│  AUTOMATED (no user action needed)                               │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Welcome   │ │ Morning   │ │ Site      │ │ Credits       │  │
│  │ Email     │ │ Digest    │ │ Nudge     │ │ Exhausted     │  │
│  │           │ │           │ │           │ │               │  │
│  │ Pipeline  │ │ Daily     │ │ Daily     │ │ Nightly cron  │  │
│  │ step 14   │ │ cron      │ │ cron      │ │ detects 0     │  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────────┘  │
│                                                                   │
│  USER-TRIGGERED                                                  │
│  ┌───────────┐ ┌───────────┐                                    │
│  │ Outreach  │ │ Agent     │                                    │
│  │ Email     │ │ Reply     │                                    │
│  │           │ │           │                                    │
│  │ Task exec │ │ Inbound   │                                    │
│  │ or chat   │ │ email     │                                    │
│  │ command   │ │ triggers  │                                    │
│  └───────────┘ └───────────┘                                    │
│                                                                   │
│  FROM: agents@artha.run (platform)                               │
│  FROM: {slug}@tryartha.com (company outbound/outreach)          │
└─────────────────────────────────────────────────────────────────┘
```

## Email Types

### Welcome Email

Sent at the end of onboarding pipeline (step 14).

**Contains:**
- Research summary highlights
- Initial task list
- Link to launch tweet
- Dashboard access link

**Sender:** `agents@artha.run`

### Morning Digest

Daily email to subscribed project founders.

**Trigger:** `POST /api/cron/morning-digest` → queues `send_digest` jobs

**Contains:**
- Tasks completed in last 24 hours
- Upcoming queued tasks (next 5)
- Site analytics card (pageviews, visitors, engagement) if any traffic
- Revenue/subscriber stats if marketplace enabled
- AI-curated highlights from Supermemory

**Sender:** `agents@artha.run`

See [Email Processor](../worker/email-processor.md) for assembly details.

### Site Activity Nudge

Re-engagement email to non-subscribed projects with site traffic.

**Trigger:** `POST /api/cron/site-nudge` (daily)

**Eligibility:**
- Project is active but not subscribed
- Not nudged in past 6 days (`last_nudge_sent_at`)
- ≥3 unique visitors in past 7 days

**Contains:** Traffic summary, CTA to subscribe

**Sender:** `agents@artha.run`

### Outreach Email

Cold emails sent from the company's email address.

**Trigger:** Task execution (outreach type) or chat command

**Flow:**
1. AI generates email drafts
2. If confirmation required: task set to `pending_confirmation`
3. On approval: `sendCompanyColdEmail()` sends via Postmark

**Sender:** `{slug}@tryartha.com`

### Agent Reply

AI-generated reply to inbound emails when a task completes.

**Trigger:** Task completed that was triggered by inbound email

**Uses In-Reply-To header** for email threading.

### Credits Exhausted Notification

Sent when a subscribed project runs out of task credits.

**Trigger:** Nightly task cron detects 0 credits

## Inbound Email

### Flowchart: Inbound Email Routing

```
┌─────────────────────────────────────────────────────────────────┐
│                  INBOUND EMAIL ARRIVES                            │
│                                                                   │
│  External sender → Postmark → POST /api/postmark/inbound        │
│                                                                   │
│  ┌─────────────────────────────┐                                 │
│  │ Store in email_inbound      │                                 │
│  │ Create/update email_threads │                                 │
│  │ Ingest into Supermemory     │                                 │
│  └─────────────┬───────────────┘                                 │
│                │                                                  │
│         ┌──────┴──────┐                                          │
│         │ Which       │                                          │
│         │ recipient?  │                                          │
│         └──┬──────┬───┘                                          │
│            │      │                                              │
│    ┌───────┘      └────────┐                                     │
│    ▼                       ▼                                     │
│  Company email          Platform email                           │
│  {slug}@tryartha.com    agents@artha.run                        │
│    │                       │                                     │
│    ├── From founder?       ├── Known user?                       │
│    │   YES → Execute       │   NO → Invite signup               │
│    │   AI orchestration    │   YES → Has project?                │
│    │                       │         NO → Direct to dashboard    │
│    └── From external?      │         YES (1) → Execute task      │
│        YES → AI auto-      │         YES (many) → Ask which      │
│        reply               │         project                     │
└─────────────────────────────────────────────────────────────────┘
```

### Webhook

```
POST /api/postmark/inbound
Header: x-postmark-inbound-secret: <secret>
```

### Routing

Inbound emails are routed based on recipient and sender:

**Company email** (`{slug}@tryartha.com`):
- **From founder:** Execute AI orchestration on instructions (treat as task request)
- **From external:** Auto-reply with AI-generated response

**Platform email** (`agents@artha.run` or `agents+{slug}@artha.run`):
- **Non-user:** Invite to sign up
- **User without project:** Direct to dashboard
- **User with one project:** Auto-identify project, execute instructions
- **User with multiple projects:** Ask for clarification

### Storage

- Raw inbound stored in `email_inbound` table
- Threads managed in `email_threads` / `email_messages` tables
- Platform-level threads in `platform_email_threads` / `platform_email_messages`
- Ingested into Supermemory for AI context

## Email Template

All emails use `baseLayout()` from `src/lib/postmark.ts`:
- Responsive HTML design
- Brand colors and typography
- Consistent header and footer
- Mobile-friendly layout

## Dashboard UI

- **Email panel** (`src/components/panels/email-panel.tsx`) — Thread list, message viewer, composer
- Thread list with unread indicators
- Full message display with HTML rendering
- Reply composer

## File References

| File | Purpose |
|------|---------|
| `src/lib/postmark.ts` | All email templates and send functions |
| `src/lib/platform-email.ts` | Platform-scope email helpers |
| `src/lib/email-threads.ts` | Threading logic |
| `src/app/api/postmark/inbound/route.ts` | Inbound webhook handler |
| `src/app/api/projects/emails/route.ts` | Email thread API |
| `src/worker/processors/email.ts` | Digest and send processor |
| `src/hooks/use-emails.ts` | React Query hook |
