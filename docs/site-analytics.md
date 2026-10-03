# Site Analytics

This document describes the analytics system for company websites (`{slug}.tryartha.com`).

> For comprehensive analytics documentation (including PostHog for artha.run), see [Features > Analytics](./features/analytics.md).

## Architecture

```
┌──────────────────────┐
│   Visitor opens       │
│ {slug}.tryartha.com   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Tracking script      │
│  (vanilla JS, <2KB)   │
│  - localStorage ID    │
│  - sessionStorage ID  │
│  - Event batching     │
└──────────┬───────────┘
           │ Events: pageview, click,
           │ pageview_end (with duration)
           ▼
┌──────────────────────┐
│  POST /api/site/      │
│  {slug}/analytics     │
│  (rate: 60/min/IP)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  site_analytics       │
│  table (platform DB)  │
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐ ┌──────────┐
│ Morning │ │Dashboard │
│ Digest  │ │Analytics │
│ Email   │ │ Panel    │
└─────────┘ └──────────┘
```

## Tracked Events

| Event | Trigger | Data Collected |
|-------|---------|----------------|
| `pageview` | Page load | Path, referrer, screen width |
| `pageview_end` | Page exit | Duration (ms), scroll depth |
| `click` | Button/link click | Target text, href |
| `custom` | App-specific | Custom metadata |

## Metrics Available

- **Unique visitors** (7-day and 30-day windows)
- **Total pageviews** (7-day and 30-day)
- **Average engagement time** (from pageview_end duration)
- **Top referrer sources** (Google, Twitter, direct, etc.)
- **Page popularity** (most viewed paths)

## Usage in the App

1. **Morning digest email** — Analytics card showing "Site this week" metrics
2. **Site nudge cron** — Qualifies projects with ≥3 unique visitors/7 days for re-engagement
3. **Dashboard analytics panel** — Charts and tables for visitor trends
4. **AI context** — Formatted via `formatAnalyticsForPrompt()` for agent awareness

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/analytics-tracking-script.ts` | Client-side JS tracking code |
| `src/lib/analytics-context.ts` | Server-side aggregation functions |
| `src/app/api/site/[slug]/analytics/route.ts` | Event ingestion endpoint |
| `src/app/api/projects/analytics/route.ts` | Dashboard data endpoint |
| `src/components/panels/analytics-panel.tsx` | Dashboard UI |
