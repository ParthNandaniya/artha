# Email Processor

The email processor (`src/worker/processors/email.ts`) handles two job subtypes: morning digest and outbound email sends.

## Digest (`send_digest`)

Assembles and sends the daily morning digest email to a project's founder.

### Data Sources

1. **Completed tasks** (last 24h) — Query `tasks` table where `status = 'completed'` and `completed_at > NOW() - 24h`
2. **Upcoming tasks** (next 5) — Query `tasks` table where `status = 'queued'` ordered by priority
3. **Site analytics** — `getProjectAnalyticsSummary()` from `site_analytics` table:
   - 7-day pageviews and unique visitors
   - Average engagement time
   - Top referrer source
   - 30-day pageviews and unique visitors
4. **Subscriber stats** — `getSubscriberSummary()` from `marketplace_subscribers`:
   - Active subscriber count
   - Monthly recurring revenue
5. **Semantic context** — `getRelevantContext()` from Supermemory:
   - Query: "recent progress, completed tasks, and upcoming priorities"
   - Used for AI-generated digest highlights

### Email Content

The digest email (sent via `sendCompanyDigest()`) includes:

- **Tasks completed** — List of completed task titles with results
- **Upcoming tasks** — Next queued tasks
- **Analytics card** — Green-themed card showing site visitors, pageviews, engagement (if any traffic)
- **Revenue section** — Subscriber count and MRR (if marketplace enabled)
- **Highlights** — AI-curated context from Supermemory

### Template

Uses `baseLayout()` from `src/lib/postmark.ts` for consistent HTML email styling:
- Responsive design
- Brand colors and typography
- Header with company logo
- Footer with unsubscribe link

## Outbound Email (`send_email`)

Sends company emails from the project's email address.

### Payload

```json
{
  "to": "recipient@example.com",
  "subject": "Hello from our company",
  "html": "<p>Email content...</p>",
  "from": "optional-sender-name"
}
```

### Behavior

1. Calls `sendCompanyOutboundEmail()` with slug and company name context
2. Sends via Postmark company server (`{slug}@tryartha.com`)
3. Tagged as "outreach" for Postmark webhook tracking
4. Updates `email_messages` table with sent message
