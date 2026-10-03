# Tasks API

All endpoints require platform authentication.

## `GET /api/tasks`

List all tasks for a project.

**Query:** `projectId`

**Response:** Array of tasks ordered by `created_at DESC`.

```json
[
  {
    "id": 1,
    "title": "Research competitor pricing",
    "description": "Analyze top 5 competitor pricing models",
    "type": "research",
    "status": "queued",
    "priority": 1,
    "credits_cost": 1.5,
    "result": null,
    "source": "system",
    "tags": ["research", "pricing"],
    "is_recurring": false,
    "created_at": "2026-03-01T..."
  }
]
```

## `POST /api/tasks`

Create a new task manually.

**Body:**
```json
{
  "projectId": 1,
  "title": "Write blog post about AI tutoring",
  "description": "500-word blog post covering...",
  "isRecurring": false
}
```

Auto-assigns priority based on existing task count. Status defaults to `queued`.

## `POST /api/tasks/run`

Execute a task. Deducts credits immediately.

**Body:**
```json
{
  "projectId": 1,
  "taskId": 5
}
```

**Response (success):**
```json
{ "jobId": 42 }
```

**Response (insufficient credits, 402):**
```json
{
  "error": "Insufficient credits",
  "required": 1.5,
  "available": 0.5,
  "purchaseUrl": "/api/stripe/credit-pack?projectId=1"
}
```

**Flow:**
1. Validates `task_credits >= credits_cost`
2. Deducts credits atomically via `decrement_task_credits()`
3. Enqueues `run_task` job in `job_queue`
4. Worker processes asynchronously (see [Task Processor](../worker/task-processor.md))

## `PATCH /api/tasks/[id]`

Update task status, result, or details.

**Body:**
```json
{
  "status": "completed",
  "result": "Analysis complete..."
}
```

## `POST /api/tasks/generate`

AI generates task suggestions based on company context.

**Body:**
```json
{ "projectId": 1 }
```

Costs credits. Returns suggested tasks.

## `GET /api/tasks/live?taskId=...`

Get live task execution status via SSE stream.

**Events:**
- `task_context` — Context loaded
- `task_progress` — Execution progress
- `task_complete` — Task finished with result
- `task_error` — Execution failed

## `POST /api/tasks/confirm-outreach`

Confirm outreach task before sending emails. Used when a task requires user approval (status = `pending_confirmation`).

**Body:**
```json
{
  "projectId": 1,
  "taskId": 5,
  "approved": true
}
```

If approved, sends cold emails to the drafted recipients. If rejected, marks task as cancelled.

## `POST /api/tasks/reorder`

Reorder task priorities via drag-and-drop.

**Body:**
```json
{
  "projectId": 1,
  "taskIds": [3, 1, 5, 2, 4]
}
```

Updates priority values to match the new order.

## Task Statuses

| Status | Description |
|--------|-------------|
| `queued` | Waiting to be executed |
| `running` | Currently being processed by worker |
| `completed` | Successfully finished |
| `failed` | Execution error |
| `pending_confirmation` | Outreach task waiting for user approval |

## Task Types

| Type | Agent | Credits |
|------|-------|---------|
| `research` | Research Agent | 1.5 |
| `outreach` | Email Writer | 0.5 |
| `newsletter` | Email Writer | 0.5 |
| `custom` | Varies | 1.0 |
