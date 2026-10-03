# Analytics

Artha has two analytics systems: one for company websites and one for the artha.run platform.

## Company Website Analytics (Custom)

Tracks visitor behavior on `{slug}.tryartha.com` sites.

### Tracking Script

A lightweight vanilla JS script is injected into every company website page at render time.

**Source:** `src/lib/analytics-tracking-script.ts`

### Events Tracked

| Event | When | Data |
|-------|------|------|
| `pageview` | Page load | Path, referrer, screen width |
| `pageview_end` | Page exit | Duration (ms), scroll depth |
| `click` | Button/link click | Target text, href |
| `custom` | App-specific | Custom metadata |

### Client-Side Behavior

- **Visitor ID:** Persistent via `localStorage` (survives sessions)
- **Session ID:** Via `sessionStorage` (new per tab/session)
- **Batching:** Events queued, flushed every 5 seconds or on page unload
- **Delivery:** `navigator.sendBeacon()` with `fetch()` fallback

### Event Payload

```json
{
  "events": [
    {
      "e": "pageview",
      "p": "/pricing",
      "v": "visitor_abc123",
      "s": "session_xyz",
      "r": "https://google.com",
      "sw": 1440,
      "ts": 1709312400000,
      "m": {}
    }
  ]
}
```

### Ingestion

```
Tracking script → POST /api/site/{slug}/analytics → site_analytics table
```

Rate limited to 60 requests/min per IP.

### Data Storage

Events stored in platform DB `site_analytics` table:

| Column | Description |
|--------|-------------|
| project_id | Which company's site |
| event | Event type |
| path | Page path |
| visitor_id | Persistent visitor identifier |
| session_id | Session identifier |
| referrer | Traffic source |
| user_agent | Browser info |
| screen_width | Viewport width |
| duration_ms | Engagement time (pageview_end) |
| metadata | Extra event data (JSONB) |

### Aggregation

`getProjectAnalyticsSummary()` in `src/lib/analytics-context.ts` computes:

- **7-day window:** Pageviews, unique visitors, avg engagement time, top referrer
- **30-day window:** Pageviews, unique visitors
- **hasActivity flag** for conditional rendering

### Usage

Analytics data is used in:
1. **Morning digest email** — "Site this week" analytics card
2. **Site nudge cron** — Determines if project qualifies for re-engagement (≥3 visitors/7d)
3. **Dashboard analytics panel** — Visitor charts and metrics
4. **AI context** — Formatted via `formatAnalyticsForPrompt()` for task context

## Artha.run Analytics (PostHog)

Tracks user behavior on the artha.run platform itself.

### Setup

- **Client:** PostHog provider in root layout (`src/components/posthog-provider.tsx`)
- **Server:** PostHog client in `src/lib/posthog.ts`
- **Key:** `NEXT_PUBLIC_POSTHOG_KEY` environment variable

### What's Tracked

- Automatic pageview tracking via PostHog provider
- Standard PostHog features (session recording, feature flags, etc.)

### Why Separate

Company website analytics uses a custom solution because:
- PostHog would be overkill for simple visitor tracking
- Custom tracking keeps the script lightweight (no external dependencies)
- Data stays in our database for easy querying
- No third-party cookie/privacy concerns for company site visitors

## Dashboard UI

- **Analytics panel** (`src/components/panels/analytics-panel.tsx`) — Charts showing visitors, pageviews, engagement over time
- Top referrers table
- Visitor trends

## File References

| File | Purpose |
|------|---------|
| `src/lib/analytics-tracking-script.ts` | Client-side tracking code |
| `src/lib/analytics-context.ts` | Server-side aggregation |
| `src/app/api/site/[slug]/analytics/route.ts` | Ingestion endpoint |
| `src/app/api/projects/analytics/route.ts` | Dashboard data endpoint |
| `src/lib/posthog.ts` | PostHog server client |
| `src/components/posthog-provider.tsx` | PostHog client provider |
| `src/components/panels/analytics-panel.tsx` | Dashboard UI |
| `src/hooks/use-analytics.ts` | React Query hook |
