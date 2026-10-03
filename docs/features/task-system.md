# Task System

Tasks are the primary unit of work in Artha. AI agents execute tasks to grow the user's company — research, outreach, content creation, and more.

## Task Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     TASK LIFECYCLE                                │
│                                                                   │
│  ┌──────────┐     ┌────────┐     ┌─────────┐     ┌───────────┐ │
│  │ Created  │────▶│ Queued │────▶│ Running │────▶│ Completed │ │
│  │(user/AI) │     │        │     │         │     │           │ │
│  └──────────┘     └────────┘     └────┬────┘     └───────────┘ │
│                                       │                          │
│                                       │ (if outreach)            │
│                                       ▼                          │
│                              ┌────────────────┐                  │
│                              │   Pending       │                 │
│                              │   Confirmation  │                 │
│                              └───────┬────────┘                  │
│                                 ┌────┴────┐                      │
│                                 ▼         ▼                      │
│                           ┌─────────┐ ┌──────────┐              │
│                           │Approved │ │ Rejected │              │
│                           │→ Send   │ │→ Cancel  │              │
│                           │  emails │ │          │              │
│                           └─────────┘ └──────────┘              │
│                                                                   │
│  On failure at any step:   ┌────────┐                            │
│  ─────────────────────────▶│ Failed │                            │
│                            └────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Creating Tasks

### AI-Generated (Initial)

During onboarding, the pipeline generates 5-8 initial tasks based on company context (step 13).

### AI-Generated (Nightly)

The `nightly-tasks` cron generates new tasks when the queue runs low (< 3 remaining). Uses the Task Generator agent.

### AI-Generated (Chat)

Users can request tasks via chat: "Research competitor pricing" → creates and optionally executes a task.

### User-Created

Users create tasks manually via the dashboard:

```
POST /api/tasks
Body: { projectId, title, description, isRecurring }
```

## Executing Tasks

### Flowchart: Task Execution

```
┌─────────────┐
│ User clicks  │
│ "Run Task"   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐     NO     ┌──────────────────┐
│ Credits >= cost? │───────────▶│ Return 402 error │
└──────┬───────────┘            │ + purchase link  │
       │ YES                    └──────────────────┘
       ▼
┌──────────────────┐
│ Deduct credits   │
│ (atomic DB call) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Enqueue job in   │
│ job_queue table  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Worker picks up  │
│ job (2s poll)    │
└──────┬───────────┘
       │
       ├─── research ───▶ Tavily search + AI analysis → documents
       │
       ├─── outreach ───▶ AI drafts emails → confirm → send
       │
       └─── custom ─────▶ AI executes → stores result
       │
       ▼
┌──────────────────┐
│ Save result to   │
│ tasks.result     │
│ Ingest to        │
│ Supermemory      │
└──────────────────┘
```

### Manual Execution

User clicks "Run" on a task in the dashboard:

```
POST /api/tasks/run
Body: { projectId, taskId }
```

1. Validates credits available (`task_credits >= credits_cost`)
2. Deducts credits atomically
3. Enqueues `run_task` job in `job_queue`
4. Worker processes asynchronously

### Nightly Automation

The `nightly-tasks` cron runs the top-priority queued task for each project with available credits. See [Cron Jobs](../api/cron-jobs.md).

### Live Status

During execution, the dashboard shows real-time progress:

```
GET /api/tasks/live?taskId=5
```

Returns SSE stream with progress events.

## Task Types

| Type | Agent | Credits | Description |
|------|-------|---------|-------------|
| `research` | Research Agent | 1.5 | Market research, competitive analysis |
| `outreach` | Email Writer | 0.5 | Cold email to leads |
| `newsletter` | Email Writer | 0.5 | Newsletter content |
| `custom` | Varies | 1.0 | Custom AI task |

## Outreach Confirmation

Outreach tasks require user approval before sending emails:

1. AI generates email drafts
2. Task status set to `pending_confirmation`
3. Dashboard shows confirmation modal with draft preview
4. User approves → emails sent via `sendCompanyColdEmail()`
5. User rejects → task cancelled

Auto-send can be enabled in project settings to skip confirmation.

## Task Priority & Ordering

- Tasks are ordered by `priority` (lower = higher priority)
- Users can drag-and-drop to reorder via `POST /api/tasks/reorder`
- The nightly cron always executes the top-priority queued task
- New AI-generated tasks get priority values after existing tasks

## Credit Handling

- Credits are deducted at enqueue time (not completion)
- If insufficient credits: returns 402 with purchase link
- Credits are NOT refunded on task failure
- Nightly cron skips projects with 0 credits

## Dashboard UI

- **Tasks panel** (`src/components/panels/tasks-panel.tsx`) — Task list with status, drag-and-drop reorder, run button
- **Task detail** (`src/components/slide-overs/task-detail.tsx`) — Full task view with description, result, status
- **Create task modal** (`src/components/modals/create-task-modal.tsx`) — Manual task creation
- **Live task card** (`src/components/live-task-run-card.tsx`) — Real-time execution display
- **Outreach confirmation** (`src/components/modals/outreach-confirmation-modal.tsx`) — Approve/reject outreach

## File References

| File | Purpose |
|------|---------|
| `src/app/api/tasks/route.ts` | Task CRUD |
| `src/app/api/tasks/run/route.ts` | Execute task |
| `src/app/api/tasks/generate/route.ts` | Generate task suggestions |
| `src/worker/processors/tasks.ts` | Task execution processor |
| `src/worker/processors/generate-tasks.ts` | Task generation processor |
| `src/hooks/use-tasks.ts` | React Query hook |
