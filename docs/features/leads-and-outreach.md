# Leads & Outreach

Artha helps companies discover potential customers and send targeted outreach emails.

## Lead Discovery

### AI Lead Finder

Users can request lead discovery via chat or the dashboard:

```
POST /api/leads/find
Body: { projectId, instructions: "Find SaaS founders in EdTech" }
```

The Lead Finder agent:
1. Searches the web (Tavily) for relevant contacts
2. Evaluates lead quality and relevance
3. Creates `leads` records with scoring

Cost: 1.5 credits

### Manual Lead Entry

```
POST /api/leads
Body: { projectId, name, email, company, title, source, notes }
```

### Bulk Import

```
POST /api/leads/bulk
```

Import multiple leads at once (CSV-style).

### Website Form Submissions

Leads are also captured automatically from company website forms:
- `POST /api/site/{slug}/form` creates contacts
- Contacts are stored in `contacts` and `form_submissions` tables

## Lead Management

### Lead Fields

| Field | Description |
|-------|-------------|
| name | Contact name |
| email | Email address |
| company | Company name |
| title | Job title |
| score | Quality score (AI-assigned) |
| status | `new` / `contacted` / `qualified` / `converted` |
| source | How the lead was found |
| notes | Free-text notes |
| contacted | Whether outreach was sent |
| contacted_at | When outreach was sent |

### API

```
GET /api/leads?projectId=1          # List leads (ordered by score DESC)
PATCH /api/leads                    # Update lead (status, notes, contacted)
```

## Outreach

### Generating Outreach

Outreach tasks are created via:
1. **Chat command:** "Send cold emails to the top 5 leads"
2. **Task generator:** AI suggests outreach tasks based on company stage
3. **Manual task:** User creates an outreach task

### Outreach Execution

When an outreach task runs:

1. AI generates personalized email drafts for each lead
2. Task status set to `pending_confirmation`
3. Dashboard shows confirmation modal with draft previews
4. On approval: emails sent via `sendCompanyColdEmail()` from `{slug}@tryartha.com`
5. Lead records updated: `contacted = true`, `contacted_at = NOW()`

### Auto-Send

If enabled in project settings, outreach skips the confirmation step and sends immediately.

## Dashboard UI

- **Leads panel** (`src/components/panels/leads-panel.tsx`) — Lead table with search, filtering, and status management
- Sort by score, status, or date
- Quick-action buttons for updating status
- Outreach confirmation modal for reviewing drafts

## File References

| File | Purpose |
|------|---------|
| `src/app/api/leads/route.ts` | Leads CRUD |
| `src/app/api/leads/find/route.ts` | AI lead discovery |
| `src/app/api/leads/bulk/route.ts` | Bulk import |
| `src/lib/agents/lead-finder.ts` | Lead finder agent |
| `src/components/panels/leads-panel.tsx` | Dashboard UI |
| `src/hooks/use-leads.ts` | React Query hook |
