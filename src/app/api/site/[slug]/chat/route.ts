import { NextRequest } from "next/server";
import {
  handlePreflight,
  createRateLimiter,
  getClientIp,
  getProjectBySlug,
  jsonResponse,
} from "@/lib/site-api";
import { getDb } from "@/lib/neon";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import { buildChatContext } from "@/lib/supermemory";

const isRateLimited = createRateLimiter(5); // 5 req/min per IP

// --- Lead qualification helpers ---

const PRICING_KEYWORDS = /\b(price|pricing|cost|plan|subscription|tier|fee|quote|estimate|budget|afford|cheap|expensive|how much)\b/i;
const PAIN_POINT_KEYWORDS = /\b(problem|issue|struggle|frustrated|difficult|challenge|pain|slow|broken|hate|annoying|complicated|hard to|can't|cannot|doesn't work|failing)\b/i;
const FEATURE_KEYWORDS = /\b(feature|integration|support|api|dashboard|automat|capabilit|can it|does it|do you offer|how does|is there|any way to|function|tool)\b/i;

function scoreConversation(messages: string[], hasEmail: boolean): { score: number; tags: string[] } {
  const fullText = messages.join(" ");
  let score = 0;
  const tags: string[] = [];

  if (PRICING_KEYWORDS.test(fullText)) {
    score += 30;
    tags.push("pricing-inquiry");
  }
  if (PAIN_POINT_KEYWORDS.test(fullText)) {
    score += 20;
    tags.push("pain-point");
  }
  if (FEATURE_KEYWORDS.test(fullText)) {
    score += 15;
    tags.push("feature-request");
  }
  if (hasEmail) {
    score += 20;
  }
  if (messages.length >= 3) {
    score += 15;
    tags.push("engaged");
  }
  if (score > 70) {
    tags.push("high-intent");
  }

  return { score: Math.min(score, 100), tags };
}

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  let body: { visitorId: string; conversationId?: string; message: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400, origin);
  }

  const { visitorId, message, email } = body;
  if (!visitorId || !message || message.length > 2000) {
    return jsonResponse({ error: "Invalid message" }, 400, origin);
  }

  const db = getDb();
  const projectId = project.id as string;

  // Fetch user_id for context building
  const projectRows = await db`SELECT user_id FROM projects WHERE id = ${projectId}`;
  const userId = (projectRows[0]?.user_id as string) || projectId;

  // Get or create conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    const rows = await db`
      INSERT INTO chat_widget_conversations (project_id, visitor_id)
      VALUES (${projectId}, ${visitorId})
      RETURNING id
    `;
    conversationId = rows[0].id as string;
  }

  // Handle email-only notification (no AI reply needed)
  if (message === "[email_provided]" && email) {
    try {
      const allVisitorMsgs = await db`
        SELECT content FROM chat_widget_messages
        WHERE conversation_id = ${conversationId} AND role = 'visitor'
        ORDER BY created_at ASC
      `;
      const visitorTexts = allVisitorMsgs.map((m: Record<string, unknown>) => m.content as string);
      const { score, tags } = scoreConversation(visitorTexts, true);

      const recentHistory = await db`
        SELECT role, content FROM chat_widget_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC LIMIT 10
      `;
      const metadata = {
        conversation_id: conversationId,
        visitor_id: visitorId,
        messages: recentHistory.reverse().map((m: Record<string, unknown>) => ({ role: m.role, content: m.content })),
      };

      const existingLead = await db`
        SELECT id, score FROM leads
        WHERE project_id = ${projectId} AND email = ${email}
        LIMIT 1
      `;

      if (existingLead.length > 0) {
        const newScore = Math.min(Math.max(existingLead[0].score as number, score), 100);
        await db`
          UPDATE leads SET
            score = ${newScore},
            tags = ${tags},
            metadata = ${JSON.stringify(metadata)}::jsonb,
            updated_at = NOW()
          WHERE id = ${existingLead[0].id}
        `;
      } else {
        await db`
          INSERT INTO leads (project_id, email, source, score, status, tags, metadata)
          VALUES (${projectId}, ${email}, 'chat_widget', ${score}, 'new', ${tags}, ${JSON.stringify(metadata)}::jsonb)
        `;
      }

      if (score > 70) {
        await db`
          INSERT INTO tasks (project_id, type, title, description, status, priority, source, tag)
          VALUES (
            ${projectId},
            'follow_up',
            ${"Follow up with high-intent lead: " + email},
            ${"Lead scored " + score + "/100 via chat widget. Tags: " + tags.join(", ") + ". Conversation ID: " + conversationId},
            'pending',
            2,
            'chat_widget',
            'sales'
          )
        `;
      }
    } catch (err) {
      console.error("[chat-widget] Lead capture on email submit failed:", err);
    }
    return jsonResponse({ conversationId }, 200, origin);
  }

  // Save visitor message
  await db`
    INSERT INTO chat_widget_messages (conversation_id, project_id, role, content)
    VALUES (${conversationId}, ${projectId}, 'visitor', ${message})
  `;

  // Load recent conversation history (last 10 messages)
  const history = await db`
    SELECT role, content FROM chat_widget_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC LIMIT 10
  `;
  const historyText = history
    .reverse()
    .map((m: Record<string, unknown>) => `${m.role === "visitor" ? "Visitor" : "Assistant"}: ${m.content}`)
    .join("\n");

  // Build company context
  let companyContext = "";
  try {
    companyContext = await buildChatContext({
      projectId,
      userId,
      userMessage: message,
    });
  } catch {
    // fallback: use project memory
    companyContext = `Company: ${project.name}`;
  }

  // Generate AI reply
  try {
    const reply = await generateAgentCompletion(
      "chat_widget",
      `You are a helpful customer support assistant for ${project.name}. Answer visitor questions using the company information below. Be concise, friendly, and helpful. If you don't know something, say so honestly and suggest they contact the team directly.

Company Context:
${companyContext}

Conversation History:
${historyText}`,
      message,
      { maxTokens: 500 }
    );

    // Save AI reply
    await db`
      INSERT INTO chat_widget_messages (conversation_id, project_id, role, content)
      VALUES (${conversationId}, ${projectId}, 'ai', ${reply})
    `;

    // Update conversation timestamp
    await db`
      UPDATE chat_widget_conversations SET updated_at = NOW()
      WHERE id = ${conversationId}
    `;

    // --- Lead capture & qualification ---
    if (email) {
      try {
        // Gather all visitor messages for scoring
        const allVisitorMsgs = await db`
          SELECT content FROM chat_widget_messages
          WHERE conversation_id = ${conversationId} AND role = 'visitor'
          ORDER BY created_at ASC
        `;
        const visitorTexts = allVisitorMsgs.map((m: Record<string, unknown>) => m.content as string);
        const { score, tags } = scoreConversation(visitorTexts, true);

        const metadata = {
          conversation_id: conversationId,
          visitor_id: visitorId,
          messages: history.map((m: Record<string, unknown>) => ({ role: m.role, content: m.content })),
        };

        // Upsert lead by email + project
        const existingLead = await db`
          SELECT id, score FROM leads
          WHERE project_id = ${projectId} AND email = ${email}
          LIMIT 1
        `;

        let leadId: string;
        if (existingLead.length > 0) {
          leadId = existingLead[0].id as string;
          const newScore = Math.min(Math.max(existingLead[0].score as number, score), 100);
          await db`
            UPDATE leads SET
              score = ${newScore},
              tags = ${tags},
              metadata = ${JSON.stringify(metadata)}::jsonb,
              updated_at = NOW()
            WHERE id = ${leadId}
          `;
        } else {
          const rows = await db`
            INSERT INTO leads (project_id, email, source, score, status, tags, metadata)
            VALUES (${projectId}, ${email}, 'chat_widget', ${score}, 'new', ${tags}, ${JSON.stringify(metadata)}::jsonb)
            RETURNING id
          `;
          leadId = rows[0].id as string;
        }

        // If high-intent, create a follow-up task
        if (score > 70) {
          await db`
            INSERT INTO tasks (project_id, type, title, description, status, priority, source, tag)
            VALUES (
              ${projectId},
              'follow_up',
              ${"Follow up with high-intent lead: " + email},
              ${"Lead scored " + score + "/100 via chat widget. Tags: " + tags.join(", ") + ". Conversation ID: " + conversationId},
              'pending',
              2,
              'chat_widget',
              'sales'
            )
          `;
        }
      } catch (err) {
        console.error("[chat-widget] Lead capture failed:", err);
        // Non-blocking — don't fail the chat response
      }
    }

    return jsonResponse({ reply, conversationId }, 200, origin);
  } catch (err) {
    console.error("[chat-widget] AI completion failed:", err);
    return jsonResponse(
      { reply: "Sorry, I'm having trouble responding right now. Please try again later.", conversationId },
      200,
      origin
    );
  }
}
