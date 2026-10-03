# Chat Interface

The chat sidebar is the primary way users interact with Artha's AI. It supports direct Q&A and multi-agent task orchestration.

## How It Works

Users type messages in the chat sidebar on the project dashboard. The AI responds with either a direct answer or executes tasks via specialized agents.

```
User message → POST /api/chat (SSE stream)
        │
        ▼
orchestrateChat()
        │
        ├─ Simple question → Direct answer (0.1 credits)
        │
        └─ Actionable request → Route to agent(s)
            ├─ Research Agent (1.5 credits)
            ├─ Email Writer (0.5 credits)
            ├─ Website Builder (1.5 credits)
            ├─ Task Generator (0.5 credits)
            ├─ Lead Finder (1.5 credits)
            ├─ Database Manager (1.0 credits)
            └─ Stripe Agent (1.0 credits)
```

## Flowchart: Chat Message Processing

```
┌─────────────────────────────────────────────────────────────────┐
│               CHAT MESSAGE FLOW                                  │
│                                                                   │
│  ┌───────────────┐                                               │
│  │ User types    │                                               │
│  │ message       │                                               │
│  └───────┬───────┘                                               │
│          │                                                        │
│          ▼                                                        │
│  ┌───────────────┐                                               │
│  │ Store in      │                                               │
│  │ chat_messages │                                               │
│  └───────┬───────┘                                               │
│          │                                                        │
│          ▼                                                        │
│  ┌───────────────────────────────┐                               │
│  │ Build Context:                │                               │
│  │ ├─ Last 20 messages           │                               │
│  │ ├─ Company profile (memory)   │                               │
│  │ ├─ Founder profile (google)   │                               │
│  │ └─ Supermemory search         │                               │
│  └───────────────┬───────────────┘                               │
│                  │                                                │
│                  ▼                                                │
│          ┌───────────────┐                                       │
│          │ orchestrate   │                                       │
│          │ Chat()        │                                       │
│          └───┬───────┬───┘                                       │
│              │       │                                           │
│     Simple   │       │  Actionable                               │
│     question │       │  request                                  │
│              ▼       ▼                                           │
│  ┌──────────────┐  ┌───────────────────┐                        │
│  │ Direct       │  │ Route to Agent    │                        │
│  │ Answer       │  │ ├─ Research 1.5cr │                        │
│  │ (0.1 credit) │  │ ├─ Email   0.5cr │                        │
│  │              │  │ ├─ Website 1.5cr │                        │
│  │ Stream text  │  │ ├─ Tasks   0.5cr │                        │
│  │ via SSE      │  │ └─ Leads   1.5cr │                        │
│  └──────┬───────┘  └──────┬────────────┘                        │
│         │                  │                                     │
│         └──────┬───────────┘                                     │
│                │                                                  │
│                ▼                                                  │
│  ┌──────────────────────────┐                                    │
│  │ Store response           │                                    │
│  │ Deduct credits           │                                    │
│  │ Ingest to Supermemory    │                                    │
│  │ (if ≥220 chars)          │                                    │
│  └──────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Response Types

### Direct Answer

For simple questions about the project, status checks, or general advice:
- Cost: 0.1 credits
- Streams text response immediately
- No background task execution

### Task Orchestration

For actionable requests ("research my competitors", "send outreach to leads", "update the pricing page"):
- Routes to the appropriate AI agent
- Cost varies by agent (0.5-1.5 credits)
- Returns `ExecutionSummary` with completed/deferred tasks
- May create new tasks in the queue
- Streams thinking steps and results

## Context

Each chat message is processed with full context:

1. **Conversation history** — Last 20 messages from `chat_messages` table
2. **Company profile** — Name, mission, competitors from `memory` table
3. **Founder profile** — Background, role from `users.google_data`
4. **Semantic memories** — Supermemory search using the user's message

## Persistence

- All messages stored in `chat_messages` table with role, content, and metadata
- Substantive conversations (≥220 chars) ingested into Supermemory for future context
- Metadata tracks: source (chat/email), credit cost, agent used

## Dashboard UI

- **Chat sidebar** (`src/components/chat/chat-sidebar.tsx`) — Message list, input, send button
- Appears on the right side of the project dashboard
- Supports markdown rendering in responses
- Shows credit cost per response
- Task breakdown component for multi-step executions

## File References

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Chat API endpoint |
| `src/lib/agents/orchestrator.ts` | Request routing |
| `src/components/chat/chat-sidebar.tsx` | Chat UI |
| `src/components/chat/task-breakdown.tsx` | Multi-step display |
| `src/hooks/use-chat.ts` | React Query hook |
