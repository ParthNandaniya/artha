# Cron Configuration

Artha uses HTTP-triggered cron endpoints. These should be called by an external scheduler (e.g., Vercel Cron, GitHub Actions, or a simple cron job).

## Endpoints

All cron endpoints require:
```
Authorization: Bearer <CRON_SECRET>
Method: POST
```

### Daily Schedule

| Time | Endpoint | Purpose |
|------|----------|---------|
| ~8:00 AM | `/api/cron/morning-digest` | Send digest emails to subscribed projects |
| ~10:00 PM | `/api/cron/nightly-tasks` | Execute or generate tasks for projects with credits |
| ~6:00 AM | `/api/cron/site-nudge` | Re-engage non-subscribed projects with traffic |
| ~3:00 AM | `/api/cron/cleanup-website-dbs` | Delete expired databases |
| ~4:00 AM | `/api/cron/deletion-warnings` | Send DB deletion warnings |

### Monthly Schedule

| Day | Endpoint | Purpose |
|-----|----------|---------|
| 1st | `/api/cron/usage-billing` | Process storage overage and keep-alive fees |

## Example: cURL

```bash
curl -X POST https://artha.run/api/cron/morning-digest \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Example: Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/morning-digest",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/nightly-tasks",
      "schedule": "0 22 * * *"
    },
    {
      "path": "/api/cron/site-nudge",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/cleanup-website-dbs",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/deletion-warnings",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/cron/usage-billing",
      "schedule": "0 2 1 * *"
    }
  ]
}
```

## Monitoring

Each cron endpoint returns JSON with processing results:
```json
{
  "processed": 12,
  "skipped": 3,
  "errors": 0
}
```

Monitor for:
- HTTP 500 responses (cron execution failure)
- High error counts in response body
- Missing expected runs (check last execution time)

## Security

- All endpoints verify `Authorization: Bearer <CRON_SECRET>`
- `CRON_SECRET` should be a strong random string (32+ chars)
- Never expose the cron secret in client-side code
