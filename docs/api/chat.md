# Chat API

The chat interface is the primary way users interact with Artha's AI.

## `POST /api/chat`

Send a message and receive a streaming AI response.

**Auth:** Required (platform session)

**Query:** `projectId`

**Body:**
```json
{
  "projectId": 1,
  "message": "What should I focus on this week?"
}
```

**Response:** Server-Sent Events (SSE) stream.

### SSE Event Types

#### `message`
Streaming text chunks of the AI response.
```
event: message
data: {"chunk": "Based on your current progress, "}
```

#### `done`
Final event with complete response and metadata.
```
event: done
data: {
  "content": "Full response text...",
  "metadata": {
    "source": "chat",
    "creditCost": 0.1,
    "agent": "direct"
  }
}
```

### Processing Flow

1. Insert user message into `chat_messages` table
2. Load last 20 messages for conversation context
3. Build full context:
   - Company profile (memory table)
   - Founder profile (users.google_data)
   - Semantic memories (Supermemory search)
4. Call `orchestrateChat()` to determine response type
5. Stream response

### Response Types

**Direct Answer** (simple questions, status checks):
- Cost: 0.1 credits
- Returns text response immediately
- No task execution

**Task Orchestration** (actionable requests like "research competitors", "send outreach"):
- Cost: varies by agent (0.5-1.5 credits)
- Routes to specialized agent
- Returns `ExecutionSummary` with completed/deferred tasks
- May create new tasks in the queue

### Post-Response

- Store assistant response in `chat_messages` with metadata (source, credit cost, agent used)
- Ingest conversation into Supermemory if substantive (≥220 chars)
- Deduct credits from project

## `GET /api/chat`

Retrieve chat history for a project.

**Query:** `projectId`

**Response:**
```json
[
  {
    "id": 1,
    "role": "user",
    "content": "What should I focus on?",
    "metadata": null,
    "created_at": "2026-03-01T..."
  },
  {
    "id": 2,
    "role": "assistant",
    "content": "Based on your progress...",
    "metadata": {
      "source": "chat",
      "creditCost": 0.1,
      "agent": "direct"
    },
    "created_at": "2026-03-01T..."
  }
]
```

Returns last 100 messages ordered by creation time.
