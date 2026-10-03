import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { buildChatContext, ingestConversation } from "@/lib/supermemory";
import { orchestrateChat } from "@/lib/agents/orchestrator";
import { runArthaAgent } from "@/lib/agents/runtime/runtime";
import type { SSEEvent, ExecutionSummary } from "@/lib/agents/types";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { CHAT_QUESTION_COST } from "@/config/credit-costs";
import { captureFounderSignals } from "@/lib/personalization";
import { hasExistingWebsiteDraft } from "@/lib/website";
import { fitChatHistory, getChatHistoryBudget, type ChatMessage } from "@/lib/token-budget";
import { ChatMessageSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);
  const before = searchParams.get("before"); // cursor: created_at ISO string

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ messages: [], hasMore: false });

  // Fetch limit+1 to know if there are more older messages
  const fetchLimit = limit + 1;
  const rows = before
    ? await db`SELECT * FROM chat_messages WHERE project_id = ${projectId} AND created_at < ${before} ORDER BY created_at DESC LIMIT ${fetchLimit}`
    : await db`SELECT * FROM chat_messages WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT ${fetchLimit}`;

  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse(); // return in ASC order

  return NextResponse.json({ messages, hasMore });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(ChatMessageSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, message, activePanel } = parsed.data;
  const db = getDb();

  const projects = await db`SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const project = projects[0] as Record<string, unknown>;
  const creditsAvailable = getProjectCredits(project);
  const landingPagePublished = Boolean(project.landing_page_published);
  const hasLandingPageHtml = typeof project.landing_page_html === "string" && project.landing_page_html.trim().length > 0;
  // Start context building early (runs concurrently with DB operations below)
  const contextPromise = buildChatContext({ projectId, userId: user.id, userMessage: message });

  // Run independent DB operations in parallel instead of sequentially
  const [hasWebsiteDraft, , recentMessages] = await Promise.all([
    hasExistingWebsiteDraft(projectId),
    db`INSERT INTO chat_messages (role, content, project_id) VALUES ('user', ${message}, ${projectId})`,
    db`SELECT role, content FROM chat_messages WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 50`,
  ]);

  // Insert a processing placeholder so refreshes show progress
  const [processingRow] = await db`
    INSERT INTO chat_messages (role, content, metadata, project_id)
    VALUES ('assistant', 'Working on it...', ${JSON.stringify({ processing: true })}::jsonb, ${projectId})
    RETURNING id
  `;
  const processingMessageId = processingRow.id;
  captureFounderSignals({ userId: user.id, projectId, text: message }).catch(() => {});

  const freeWebsiteBuildAvailable = !landingPagePublished && !hasLandingPageHtml && !hasWebsiteDraft;
  const messages: ChatMessage[] = [...(recentMessages || [])]
    .reverse()
    .map((m: Record<string, unknown>) => ({
      role: m.role as string,
      content: m.content as string,
    }));
  const chatHistory = fitChatHistory(messages, getChatHistoryBudget());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const emit = (event: SSEEvent) => {
        if (streamClosed) return;
        try {
          const data = JSON.stringify(event.data);
          controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${data}\n\n`));
        } catch {
          // Stream may already be closed if client disconnected
          streamClosed = true;
        }
      };

      // Handle client disconnect: update processing message as cancelled
      request.signal.addEventListener("abort", () => {
        streamClosed = true;
        db`
          UPDATE chat_messages
          SET content = 'Cancelled.',
              metadata = ${JSON.stringify({ cancelled: true })}::jsonb
          WHERE id = ${processingMessageId}
        `.catch(() => {});
        try { controller.close(); } catch { /* already closed */ }
      });

      try {
        const useArthaAgent = process.env.USE_ARTHA_AGENT === "1";

        if (useArthaAgent) {
          const context = await contextPromise;

          const agentResult = await runArthaAgent({
            projectId,
            userId: user.id,
            message,
            chatHistory,
            context,
            creditsAvailable,
            freeWebsiteBuildAvailable,
            metadata: {
              slug: project.slug as string | undefined,
              companyName: project.name as string | undefined,
              repoFullName: project.github_repo_full_name as string | undefined,
              activePanel,
            },
            emit,
            signal: request.signal,
          });

          // If the user aborted the request, the abort handler already set
          // chat_messages.content to "Cancelled." — don't overwrite it, and
          // don't ingest a half-finished conversation into memory.
          if (request.signal.aborted || agentResult.stopReason === "aborted") {
            return;
          }

          const creditsToCharge = Math.min(agentResult.creditsUsed, creditsAvailable);
          if (creditsToCharge > 0) {
            await decrementProjectCredits(db, projectId, creditsToCharge);
          }

          const taskBreakdown = agentResult.todos.length > 0
            ? agentResult.todos.map((t, i) => ({
                id: `todo_${i}`,
                agent: "chat_agent",
                description: t.status === "in_progress" ? t.activeForm : t.content,
                status: t.status === "completed" ? "completed" : t.status === "in_progress" ? "running" : "pending",
              }))
            : undefined;

          const metadataJson = JSON.stringify({
            source: "artha_agent",
            stopReason: agentResult.stopReason,
            creditsUsed: creditsToCharge,
            toolCalls: agentResult.toolCalls,
            iterations: agentResult.iterations,
            committed: agentResult.committed,
            ...(agentResult.fallbackUsed && { providerFallback: "anthropic" }),
            ...(taskBreakdown && { taskBreakdown }),
          });

          await db`
            UPDATE chat_messages
            SET content = ${agentResult.finalText},
                metadata = ${metadataJson}::jsonb
            WHERE id = ${processingMessageId}
          `;

          emit({
            event: "done",
            data: {
              message: agentResult.finalText,
              completed: agentResult.committed.map((c) => ({ path: c.path, changeType: c.changeType })),
              deferred: [],
              creditsUsed: creditsToCharge,
              creditsRemaining: Math.max(creditsAvailable - creditsToCharge, 0),
              showCreditPrompt: agentResult.stopReason === "credits_exhausted",
              stopReason: agentResult.stopReason,
            },
          });

          // Only persist the exchange to long-term memory if it actually
          // completed with useful output. Errors and credit-exhaustion
          // produce placeholder text that would pollute memory.
          if (agentResult.stopReason === "completed" || agentResult.stopReason === "max_iterations") {
            ingestConversation({
              projectId,
              userId: user.id,
              customId: `chat_${projectId}_${Date.now()}`,
              messages: `user: ${message}\nassistant: ${agentResult.finalText}`,
            }).catch(() => {});
          }

          return;
        }

        const result = await orchestrateChat({
          projectId,
          userId: user.id,
          message,
          chatHistory,
          creditsAvailable,
          freeWebsiteBuildAvailable,
          contextPromise,
          metadata: {
            slug: project.slug,
            companyName: project.name,
            repoFullName: project.github_repo_full_name,
            activePanel,
          },
          emit,
          signal: request.signal,
        });

        if ("directAnswer" in result) {
          const answer = result.directAnswer;
          const skipCharge = "skipCreditCharge" in result && result.skipCreditCharge === true;

          // Deduct 0.1 credits for non-task chat questions (skip for credit-related responses)
          const chatCost = skipCharge ? 0 : Math.min(CHAT_QUESTION_COST, creditsAvailable);
          if (chatCost > 0) {
            await decrementProjectCredits(db, projectId, chatCost);
          }

          await db`
            UPDATE chat_messages
            SET content = ${answer},
                metadata = ${JSON.stringify({ source: "direct", creditsUsed: chatCost })}::jsonb
            WHERE id = ${processingMessageId}
          `;

          emit({
            event: "done",
            data: {
              message: answer,
              completed: [],
              deferred: [],
              creditsUsed: chatCost,
              creditsRemaining: Math.max(creditsAvailable - chatCost, 0),
              showCreditPrompt: false,
            },
          });

          ingestConversation({
            projectId,
            userId: user.id,
            customId: `chat_${projectId}_${Date.now()}`,
            messages: `user: ${message}\nassistant: ${answer}`,
          }).catch(() => {});
        } else {
          const summary = result as ExecutionSummary;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";

          let responseText = summary.message + "\n\n";
          if (summary.completed.length > 0) {
            responseText += summary.completed
              .map((c, i) => `${i + 1}. ${c.summary}${c.links.length ? ` → ${c.links[0].url}` : ""}`)
              .join("\n");
          }
          if (summary.deferred.length > 0) {
            responseText += `\n\n⚠️ ${summary.deferred.length} task${summary.deferred.length > 1 ? "s" : ""} need more credits:\n`;
            responseText += summary.deferred.map((d) => `• ${d.agent.replace(/_/g, " ")} (${d.reason.replace(/_/g, " ")})`).join("\n");
            responseText += `\n\nYou used ${summary.creditsUsed} credit${summary.creditsUsed !== 1 ? "s" : ""}. Add more to run remaining tasks.`;
            responseText += `\n[Get Credits]`;
          }

          const taskBreakdown = summary.completed.length >= 1
            ? summary.completed.map((c) => ({
                id: c.subtaskId,
                agent: c.agent,
                description: c.summary,
                status: "completed" as const,
                summary: c.summary,
                links: c.links,
              }))
            : undefined;

          const metadataJson = JSON.stringify({
            source: "orchestrator",
            completed: summary.completed.map((c) => c.agent),
            deferred: summary.deferred.map((d) => d.agent),
            creditsUsed: summary.creditsUsed,
            ...(taskBreakdown && { taskBreakdown }),
          });

          await db`
            UPDATE chat_messages
            SET content = ${responseText.trim()},
                metadata = ${metadataJson}::jsonb
            WHERE id = ${processingMessageId}
          `;

          emit({
            event: "done",
            data: summary as unknown as Record<string, unknown>,
          });

          ingestConversation({
            projectId,
            userId: user.id,
            customId: `chat_${projectId}_${Date.now()}`,
            messages: `user: ${message}\nassistant: ${responseText.trim()}`,
          }).catch(() => {});
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Something went wrong";
        await db`
          UPDATE chat_messages
          SET content = ${`Error: ${errMsg}`},
              metadata = ${JSON.stringify({ error: true })}::jsonb
          WHERE id = ${processingMessageId}
        `.catch(() => {});
        emit({
          event: "done",
          data: {
            message: `Error: ${errMsg}`,
            completed: [],
            deferred: [],
            creditsUsed: 0,
            creditsRemaining: creditsAvailable,
            showCreditPrompt: false,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
