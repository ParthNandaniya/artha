# Site API

Public APIs for company websites at `{slug}.tryartha.com`. These endpoints are accessible without platform authentication — they serve end-users of the built companies.

All site API routes are under `/api/site/[slug]/`.

## Authentication

See [Authentication API](./authentication.md#site-user-authentication) for signup/signin/verify endpoints.

## Data Operations

### `POST /api/site/[slug]/data/[table]`

Insert a row into a company database table.

**Auth:** Site session token required (`Authorization: Bearer <token>`)

**Body:**
```json
{
  "data": {
    "title": "My first post",
    "content": "Hello world"
  },
  "creditCost": 0.5
}
```

**Behavior:**
- Auto-scopes to `site_user_id` if the table has that column
- Atomically deducts credits from site user if `creditCost` provided
- Returns inserted row and updated credit balance

**Response:**
```json
{
  "row": { "id": 1, "title": "My first post", "content": "Hello world", "site_user_id": 5 },
  "credits": 9.5
}
```

### `GET /api/site/[slug]/data/[table]`

Query rows from a company database table.

**Auth:** Site session token required

**Query params:**
- `limit` (default: 50) — Max rows
- `offset` (default: 0) — Pagination offset
- `sort` (default: `created_at`) — Sort column
- `order` (default: `desc`) — Sort direction

Auto-scoped to the authenticated site user if the table has a `site_user_id` column.

**Response:**
```json
{
  "rows": [...],
  "total": 42
}
```

### `PATCH /api/site/[slug]/data/[table]/[id]`

Update a row. Auth required, scoped to user's own rows.

### `DELETE /api/site/[slug]/data/[table]/[id]`

Delete a row. Auth required, scoped to user's own rows.

## Forms

### `POST /api/site/[slug]/form`

Submit a website form (lead capture, contact forms).

**Auth:** None required (rate limited to 10/min/IP)

**CORS:** Only allows `*.tryartha.com` origins.

**Body:** JSON or form-encoded with fields like `email`, `name`, `phone`, `form_slug`, etc.

**Behavior:**
1. Creates/updates contact in `contacts` table
2. Creates `form_submissions` record
3. Checks for `redirect_url` on form definition
4. Returns success or redirect URL

## Payments

### `POST /api/site/[slug]/payments/create-checkout`

Create a Stripe checkout session for a marketplace purchase.

**Auth:** Site session token required

**Body:**
```json
{
  "planId": 3,
  "successUrl": "https://mysite.tryartha.com/success",
  "cancelUrl": "https://mysite.tryartha.com/pricing"
}
```

Uses Stripe Connect destination charges with 20% platform fee.

### `GET /api/site/[slug]/credits`

Get the authenticated site user's credit balance.

**Auth:** Site session token required

**Response:**
```json
{ "credits": 10.0 }
```

## Analytics

### `POST /api/site/[slug]/analytics`

Track visitor events on company websites.

**Auth:** None required (rate limited to 60/min/IP)

**Body:**
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

**Event types:**
| Event | Description |
|-------|-------------|
| `pageview` | Page load |
| `pageview_end` | Page exit (includes `duration_ms`, `scroll_depth`) |
| `click` | Button/link click (includes `target_text`, `href`) |
| `custom` | Custom event with metadata |

Events are batch-inserted into the `site_analytics` table.

## CORS

All site API endpoints set CORS headers to allow requests from `*.tryartha.com` domains only. Handled by `src/lib/site-api/cors.ts`.

## Rate Limiting

In-memory rate limiters per IP address:

| Endpoint | Limit |
|----------|-------|
| Analytics | 60 requests/min |
| Form submit | 10 requests/min |
| Signup | 5 requests/10 min |
