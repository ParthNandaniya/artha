# Ads

Artha includes an ad campaign system for creating and launching ads on Meta (Facebook/Instagram).

> **Note:** This feature is partially implemented. The UI and configuration layer are in place, but live Meta Marketing API integration uses placeholder provider adapters.

## Architecture

```
Dashboard → Create Campaign → AI generates creative → Launch to Meta
```

## Campaign Creation

### `POST /api/ads`

Create an ad campaign.

**Body includes:**
- Target audience
- Budget ($10-$1000/day)
- Format (image or video)
- Duration
- Platform (Meta)

### AI Creative Generation

The Research Agent generates ad creative based on:
- Latest research documents (`ads_research` tag)
- Company context and positioning
- Target audience demographics

## Campaign Management

### `GET /api/ads`

List all ad campaigns for a project.

### `POST /api/ads/launch`

Launch an approved campaign to Meta Ads.

## Revenue Split

Ad spend is charged to the founder with a 20% platform fee:
- Founder pays: ad budget + 20% platform fee
- Artha takes: 20% fee
- Meta receives: ad budget directly

## Subscription Requirement

The ads feature requires an active Pro subscription. Non-subscribed users see an upgrade prompt.

## Dashboard UI

- **Ads panel** (`src/components/panels/ads-panel.tsx`) — Campaign list, creation form, budget slider, launch button

## File References

| File | Purpose |
|------|---------|
| `src/lib/ads/schema.ts` | Ad data types |
| `src/lib/ads/service.ts` | Campaign service |
| `src/lib/ads/config.ts` | Provider configuration |
| `src/lib/ads/providers.ts` | Meta Ads provider (placeholder) |
| `src/app/api/ads/route.ts` | Campaign CRUD |
| `src/components/panels/ads-panel.tsx` | Dashboard UI |
