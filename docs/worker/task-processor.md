# Task Processor

The task processor (`src/worker/processors/tasks.ts`) executes individual AI tasks queued from the dashboard, chat, or nightly cron.

## Execution Flow

```
Worker picks up run_task job
        │
        ▼
1. Load Context
   ├─ Company profile (memory table)
   ├─ Founder profile (users.google_data)
   └─ Semantic memories (Supermemory search for task description)
        │
        ▼
2. Route by Task Type
   ├─ research → runResearchAgent()
   ├─ outreach → executeTask() + email handling
   └─ other → executeTask()
        │
        ▼
3. Save Result
   ├─ task.result = execution output
   ├─ task.status = 'completed' or 'failed'
   └─ ingestTaskResult() → Supermemory
        │
        ▼
4. Reply to Email (if task was triggered by inbound email)
   └─ sendAgentReply() with In-Reply-To header
```

## Task Types

### Research Tasks

- Calls `runResearchAgent()` with live web search (Tavily)
- Saves generated analysis to `documents` table
- Formats output with links and summary
- If triggered by email: sends reply with research findings

### Outreach Tasks

- Calls `executeTask()` which generates email drafts
- **Needs confirmation:** Sets `task.status = 'pending_confirmation'`, saves drafts to `task.result`, waits for dashboard approval
- **Auto-send:** Calls `sendCompanyColdEmail()` for each recipient, marks completed
- Handles email setup blockers (if Postmark not configured)

### Other Tasks (newsletter, custom)

- Calls `executeTask()` to generate deliverable
- Stores result in `task.result`

## Context Building

Before executing any task, the processor builds context via `buildTaskContext()`:

1. **Company profile** — Name, tagline, mission, competitors, key insights from `memory` table
2. **Founder profile** — Background, role, LinkedIn from `users.google_data`
3. **Semantic memories** — Supermemory search using the task description as query (retrieves relevant past work, research, conversations)

This 3-part context is passed to the AI agent as system prompt context.

## Memory Persistence

After execution, `ingestTaskResult()` persists the outcome in Supermemory:
- Stores: task title, type, summary, result snippet
- Deduped by task ID (updates on retry)
- Ensures future tasks can build on past work

## Email Reply

If a task was triggered by an inbound email (`replyToEmail`, `replyToMessageId` fields):
- Sends agent reply with task summary and dashboard link
- Uses `sendAgentReply()` with `In-Reply-To` header for email threading
- Reply appears in the email thread in the founder's inbox

## Error Handling

- Failed tasks: `task.status = 'failed'`, error stored in `task.result`
- Worker marks `job_queue` entry as failed
- Credits are NOT refunded on failure (deducted at enqueue time)
