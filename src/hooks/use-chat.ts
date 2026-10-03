"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";

interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface TaskBreakdownItem {
  id: string;
  agent: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  summary?: string;
  links?: { label: string; url: string }[];
  error?: string;
  thinking?: string;
  /** History of all thinking/progress messages for streaming display */
  thinkingHistory?: string[];
}

export interface QueueItem {
  id: string;
  message: string;
  /** ID of the optimistic user message in chat */
  chatMessageId: string;
}

function parseEventBlock(block: string): StreamEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export function useChat(projectId: string | null, options?: { onLeadsCreated?: () => void; activePanel?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Abort controller for the current streaming request
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat?projectId=${projectId}&limit=30`);
      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (!projectId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0].created_at;
      const res = await fetch(`/api/chat?projectId=${projectId}&limit=30&before=${encodeURIComponent(oldest)}`);
      const data = await res.json();
      const older = data.messages || [];
      setHasMore(data.hasMore ?? false);
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, loadingMore, hasMore, messages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Poll when there's a processing message (e.g. page was refreshed mid-task)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PROCESSING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (reduced from 5)
  useEffect(() => {
    const hasProcessing = messages.some((m) => {
      if (m.role !== "assistant" || !(m.metadata as Record<string, unknown>)?.processing) return false;
      const age = Date.now() - new Date(m.created_at).getTime();
      return age < PROCESSING_TIMEOUT_MS;
    });

    if (hasProcessing && !sending) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          loadMessages();
        }, 3000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [messages, sending, loadMessages]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!projectId || !message.trim()) return;

      // If already sending, queue the message instead
      if (sending) {
        const msgId = "temp-" + Date.now();
        const queueId = `q-${Date.now()}`;
        const userMsg: ChatMessage = {
          id: msgId,
          project_id: projectId,
          role: "user",
          content: message,
          type: "chat",
          task_id: null,
          metadata: {},
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setQueue((prev) => [...prev, { id: queueId, message, chatMessageId: msgId }]);
        return;
      }

      setSending(true);

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Optimistic add
      const optimistic: ChatMessage = {
        id: "temp-" + Date.now(),
        project_id: projectId,
        role: "user",
        content: message,
        type: "chat",
        task_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      };
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        optimistic,
        {
          id: assistantId,
          project_id: projectId,
          role: "assistant",
          content: "",
          type: "chat",
          task_id: null,
          metadata: { pending: true },
          created_at: new Date().toISOString(),
        },
      ]);

      // Track whether we received a task breakdown (multi-agent flow)
      let hasTaskBreakdown = false;
      // Track streamed content for the assistant message
      let streamedContent = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, message, activePanel: options?.activePanel }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to send message (${res.status})`);
        }

        if (!res.body) {
          throw new Error("Chat response stream was empty");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalData: Record<string, unknown> | undefined;

        const updateAssistant = (content: string) => {
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? { ...item, content, metadata: { ...item.metadata, pending: true } }
              : item
          )));
        };

        const updateAssistantMeta = (updates: Partial<ChatMessage>) => {
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? { ...item, ...updates }
              : item
          )));
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            const parsed = parseEventBlock(block.trim());
            if (!parsed) continue;

            // ── Task breakdown (multi-agent checklist) ──
            if (parsed.event === "tasks_breakdown") {
              hasTaskBreakdown = true;
              const breakdown = parsed.data.subtasks as TaskBreakdownItem[];
              updateAssistantMeta({
                content: "",
                metadata: { pending: true, taskBreakdown: breakdown },
              });
              continue;
            }

            // ── Individual subtask status update ──
            if (parsed.event === "subtask_status") {
              const { subtaskId, status, summary, links, error } = parsed.data as {
                subtaskId: string;
                status: string;
                summary?: string;
                links?: { label: string; url: string }[];
                error?: string;
              };

              setMessages((prev) => prev.map((item) => {
                if (item.id !== assistantId) return item;
                const breakdown = (item.metadata?.taskBreakdown as TaskBreakdownItem[] | undefined) || [];
                const updated = breakdown.map((task) =>
                  task.id === subtaskId
                    ? { ...task, status, ...(summary && { summary }), ...(links && { links }), ...(error && { error }) }
                    : task
                );
                return {
                  ...item,
                  metadata: { ...item.metadata, taskBreakdown: updated },
                };
              }));
              continue;
            }

            // ── Subtask thinking (live progress text) ──
            if (parsed.event === "subtask_thinking") {
              const { subtaskId, message: thinkingMsg } = parsed.data as {
                subtaskId: string;
                message: string;
              };

              setMessages((prev) => prev.map((item) => {
                if (item.id !== assistantId) return item;
                const breakdown = (item.metadata?.taskBreakdown as TaskBreakdownItem[] | undefined) || [];
                const updated = breakdown.map((task) => {
                  if (task.id !== subtaskId) return task;
                  const history = task.thinkingHistory || [];
                  // Only add if different from last entry
                  const lastEntry = history[history.length - 1];
                  const newHistory = lastEntry === thinkingMsg ? history : [...history, thinkingMsg];
                  return { ...task, thinking: thinkingMsg, thinkingHistory: newHistory };
                });
                return {
                  ...item,
                  metadata: { ...item.metadata, taskBreakdown: updated },
                };
              }));
              continue;
            }

            // ── Thinking / agent_start — streaming or static ──
            if (parsed.event === "thinking" || parsed.event === "agent_start") {
              if (!hasTaskBreakdown) {
                const step = typeof parsed.data.step === "string" ? parsed.data.step : "";
                const isStreaming = parsed.data.streaming === true;

                if (isStreaming && step) {
                  // Append streamed token chunks (live LLM output)
                  streamedContent += step;
                  updateAssistant(streamedContent);
                } else if (step) {
                  // Static thinking step (replaces content)
                  streamedContent = "";
                  updateAssistant(step);
                }
              }
              continue;
            }

            // ── Agent token streaming (live website/code generation) ──
            if (parsed.event === "agent_stream") {
              const chunk = typeof parsed.data.chunk === "string" ? parsed.data.chunk : "";
              if (chunk) {
                streamedContent += chunk;
                setMessages((prev) => prev.map((item) => (
                  item.id === assistantId
                    ? { ...item, content: streamedContent, metadata: { ...item.metadata, pending: true, streaming: true } }
                    : item
                )));
              }
              continue;
            }

            // ── Direct answer streaming (live text generation) ──
            if (parsed.event === "direct_answer_stream") {
              const chunk = typeof parsed.data.chunk === "string" ? parsed.data.chunk : "";
              if (chunk) {
                streamedContent += chunk;
                setMessages((prev) => prev.map((item) => (
                  item.id === assistantId
                    ? { ...item, content: streamedContent, metadata: { ...item.metadata, pending: true, streaming: true } }
                    : item
                )));
              }
              continue;
            }

            // ── Agent done (only for single-agent flows) ──
            if (parsed.event === "agent_done") {
              if (!hasTaskBreakdown) {
                const summary = typeof parsed.data.summary === "string" ? parsed.data.summary : "Task completed.";
                streamedContent = "";
                updateAssistant(summary);
              }
              continue;
            }

            if (parsed.event === "leads_created") {
              options?.onLeadsCreated?.();
              continue;
            }

            if (parsed.event === "credits_exhausted") {
              if (!hasTaskBreakdown) {
                updateAssistant("More credits are needed to finish the remaining tasks.");
              }
              continue;
            }

            if (parsed.event === "done") {
              finalData = parsed.data;
              const summary = typeof parsed.data.message === "string"
                ? parsed.data.message
                : "Done.";

              setMessages((prev) => prev.map((item) => {
                if (item.id !== assistantId) return item;
                return {
                  ...item,
                  content: summary,
                  metadata: { ...item.metadata, pending: false, streaming: false },
                };
              }));
            }
          }
        }

        if (buffer.trim()) {
          const parsed = parseEventBlock(buffer.trim());
          if (parsed?.event === "done") {
            finalData = parsed.data;
          }
        }

        await loadMessages();
        return finalData;
      } catch (err) {
        // Handle abort gracefully — not an error
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? {
                ...item,
                content: streamedContent || "Cancelled.",
                metadata: { ...item.metadata, pending: false, cancelled: true },
              }
              : item
          )));
          await loadMessages();
          return;
        }

        console.error("Failed to send message:", err);
        setMessages((prev) => prev.map((item) => (
          item.id === assistantId
            ? {
              ...item,
              content: err instanceof Error ? `Error: ${err.message}` : "Error: failed to send message",
              metadata: { error: true },
            }
            : item
        )));
      } finally {
        abortControllerRef.current = null;
        setSending(false);
      }
    },
    [loadMessages, projectId, sending, queue]
  );

  // ── Queue auto-advance: when sending finishes and queue has items, send next ──
  const prevSendingRef = useRef(false);
  useEffect(() => {
    if (prevSendingRef.current && !sending && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      // Use setTimeout to avoid calling sendMessage during state update
      setTimeout(() => sendMessage(next.message), 0);
    }
    prevSendingRef.current = sending;
  }, [sending, queue, sendMessage]);

  // ── Stop current task ──
  const stopCurrentTask = useCallback(() => {
    abortControllerRef.current?.abort();
    // Note: setSending(false) happens in the finally block of sendMessage
  }, []);

  // ── Remove item from queue ──
  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item?.chatMessageId) {
        setMessages((msgs) => msgs.filter((m) => m.id !== item.chatMessageId));
      }
      return prev.filter((q) => q.id !== id);
    });
  }, []);

  const processing = messages.some(
    (m) => m.role === "assistant" && (m.metadata as Record<string, unknown>)?.processing === true
  );

  return {
    messages,
    loading,
    loadingMore,
    sending,
    processing,
    hasMore,
    queue,
    sendMessage,
    loadMore,
    stopCurrentTask,
    removeFromQueue,
    refresh: loadMessages,
  };
}
