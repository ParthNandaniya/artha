import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { generateCompletion, generateJSON } from "@/lib/openai";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const {
    projectId,
    title,
    description,
    prompt,
    priority,
    status,
    isRecurring,
    recurrenceInterval,
    aiInstruction,
  } = body;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id, subscription_status
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = projects[0] as {
    id: string;
    subscription_status: string | null;
  };

  const existing = await db`SELECT * FROM tasks WHERE id = ${id} AND project_id = ${projectId}`;
  if (existing.length === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const current = existing[0];

  let newTitle = title !== undefined ? title : current.title;
  let newDescription = description !== undefined ? description : current.description;
  let newPrompt = prompt !== undefined ? prompt : current.prompt;
  const newPriority = priority !== undefined ? priority : current.priority;
  const newStatus = status !== undefined ? status : current.status;
  let newIsRecurring =
    isRecurring !== undefined ? Boolean(isRecurring) : Boolean(current.is_recurring);
  let assistantMessage: string | null = null;

  // AI-assisted edit: rewrite the task in a structured way based on a natural-language instruction.
  if (aiInstruction?.trim()) {
    if (project.subscription_status !== "active") {
      return NextResponse.json(
        { error: "Task AI is available on Pro only." },
        { status: 402 }
      );
    }

    try {
      const updated = await generateJSON<{
        title?: string;
        description?: string;
        prompt?: string;
        isRecurring?: boolean;
        assistantMessage?: string;
      }>(
        `You update a startup task based on a user's edit request.
Return JSON only with the keys:
- title: string
- description: string
- prompt: string
- isRecurring: boolean
- assistantMessage: string

Rules:
- Keep the task focused and practical.
- Preserve the task's core intent unless the user explicitly changes it.
- Keep title concise.
- Keep description actionable and clear.
- Prompt should align with the updated description.
- assistantMessage should be 1-2 short sentences explaining what changed.`,
        `Current title: ${current.title}
Current description: ${current.description || ""}
Current prompt: ${current.prompt || ""}
Current recurring: ${Boolean(current.is_recurring) ? "yes" : "no"}

User instruction: ${aiInstruction}`,
        { maxTokens: 600, temperature: 0.4 }
      );

      if (typeof updated.title === "string" && updated.title.trim()) {
        newTitle = updated.title.trim();
      }

      if (typeof updated.description === "string" && updated.description.trim()) {
        newDescription = updated.description.trim();
      }

      if (typeof updated.prompt === "string" && updated.prompt.trim()) {
        newPrompt = updated.prompt.trim();
      } else if (typeof updated.description === "string" && updated.description.trim()) {
        newPrompt = updated.description.trim();
      }

      if (typeof updated.isRecurring === "boolean") {
        newIsRecurring = updated.isRecurring;
      }

      if (typeof updated.assistantMessage === "string" && updated.assistantMessage.trim()) {
        assistantMessage = updated.assistantMessage.trim();
      }
    } catch {
      const updatedDescription = await generateCompletion(
        `You are updating a task for a startup. The user has given an instruction to change this task. Rewrite the task description to incorporate their instruction while keeping the core goal intact. Return ONLY the updated description — no preamble, no labels, no commentary.

Current task title: ${current.title}
Current description: ${current.description || ""}
Current prompt: ${current.prompt || ""}`,
        `User instruction: ${aiInstruction}`,
        { maxTokens: 400, temperature: 0.4 }
      );

      newDescription = updatedDescription.trim();
      newPrompt = updatedDescription.trim();
      assistantMessage = "I updated the task brief to reflect your instruction.";
    }
  }

  // Compute recurrence fields
  const newInterval = recurrenceInterval !== undefined ? recurrenceInterval : current.recurrence_interval;
  let newNextRunAt = current.next_run_at;
  if (newIsRecurring && newInterval && (recurrenceInterval !== undefined || isRecurring !== undefined)) {
    const d = new Date();
    switch (newInterval) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "biweekly": d.setDate(d.getDate() + 14); break;
      case "monthly": d.setMonth(d.getMonth() + 1); break;
    }
    newNextRunAt = d.toISOString();
  } else if (!newIsRecurring) {
    newNextRunAt = null;
  }

  await db`
    UPDATE tasks SET
      title = ${newTitle},
      description = ${newDescription},
      prompt = ${newPrompt},
      priority = ${newPriority},
      status = ${newStatus},
      is_recurring = ${newIsRecurring},
      recurrence_interval = ${newIsRecurring ? newInterval : null},
      next_run_at = ${newNextRunAt}
    WHERE id = ${id} AND project_id = ${projectId}
  `;

  const updated = await db`SELECT * FROM tasks WHERE id = ${id} AND project_id = ${projectId}`;
  if (assistantMessage) {
    return NextResponse.json({ task: updated[0], assistantMessage });
  }

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db`DELETE FROM tasks WHERE id = ${id} AND project_id = ${projectId}`;

  return NextResponse.json({ success: true });
}
