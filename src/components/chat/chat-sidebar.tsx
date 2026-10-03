"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/hooks/use-chat";
import type { TaskBreakdownItem } from "@/hooks/use-chat";
import { TaskBreakdown } from "@/components/chat/task-breakdown";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Square,
  X,
  Sparkles,
  Search,
  Mail,
  Globe,
  Zap,
  Check,
  AlertCircle,
  Reply,
} from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import type { ChatMessage } from "@/lib/types";

interface ChatSidebarProps {
  projectId: string | null;
  activePanel?: string;
  onConversationSettled?: () => void;
  onLeadsCreated?: () => void;
  onBuyCredits?: () => void;
  onHashNavigate?: (panel: string) => void;
  externalMessage?: string | null;
  onExternalMessageHandled?: () => void;
}

const INLINE_ACTION_REGEX = /(\[Get Credits\]|https?:\/\/[^\s]+)/g;

function isPricingLink(value: string) {
  try {
    const url = new URL(value);
    if (url.pathname === "/pricing") return true;
    if (url.searchParams.get("buy_credits") === "true") return true;
    return false;
  } catch {
    return false;
  }
}

function renderMessageContent(content: string, onBuyCredits?: () => void) {
  const parts = content.split(INLINE_ACTION_REGEX).filter(Boolean);
  const creditCta = "[Get Credits]";
  if (parts.length === 1) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => {
        if (part === creditCta) {
          return (
            <button
              key={`credit-cta-${index}`}
              onClick={onBuyCredits}
              className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2 hover:no-underline"
            >
              Get Credits →
            </button>
          );
        }

        if (/^https?:\/\/\S+$/.test(part)) {
          const opensCreditModal = isPricingLink(part) && onBuyCredits;
          return (
            <a
              key={`link-${index}`}
              href={part}
              onClick={(event) => {
                if (!opensCreditModal) return;
                event.preventDefault();
                onBuyCredits?.();
              }}
              className="font-medium text-primary underline underline-offset-2 hover:no-underline"
            >
              {part}
            </a>
          );
        }

        return <span key={`text-${index}`}>{part}</span>;
      })}
    </div>
  );
}

/** True if this content string is a live "thinking" step (not a completed response) */
function isThinkingStep(content: string) {
  if (!content || content === "Thinking...") return true;
  if (content.endsWith("...")) return true;
  return false;
}

/** True if the message is being live-streamed from the LLM */
function isStreamingContent(msg: ChatMessage) {
  const meta = msg.metadata as Record<string, unknown> | undefined;
  return meta?.streaming === true && meta?.pending === true;
}

function ThinkingIndicator({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <ArthaLoader size={16} className="text-emerald-400 shrink-0" />
      {/* Shimmer text */}
      <span
        className="text-xs leading-snug font-medium select-none"
        style={{
          background: "linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.9) 48%, rgba(255,255,255,0.4) 100%)",
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "artha-shimmer 2.4s linear infinite",
        }}
      >
        {text || "Thinking..."}
      </span>
    </div>
  );
}

// ── Streaming text indicator (for live LLM output) ──────────────────

function StreamingTextIndicator({ text }: { text: string }) {
  const lastLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-5)
    .join("\n");

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <ArthaLoader size={14} className="text-emerald-400 shrink-0" />
        <span className="text-[10px] text-emerald-400/60 font-medium uppercase tracking-wide font-mono">Streaming</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-xs text-white/70 leading-relaxed font-mono">
        {lastLines}
        <span className="inline-block w-1.5 h-3.5 bg-emerald-400/70 animate-pulse ml-0.5 -mb-0.5 rounded-[1px]" />
      </p>
    </div>
  );
}

// ── Email chat card ────────────────────────────────────────────────

function parseEmailContent(content: string): { label: string; subject: string } | null {
  const founderMatch = content.match(/📧\s*Email from founder:\s*"([^"]+)"/);
  if (founderMatch) return { label: "Email from founder", subject: founderMatch[1] };

  const extAutoMatch = content.match(/📧\s*External email from\s+([^:]+):\s*"([^"]+)"\s*[—-]\s*Auto-replied/);
  if (extAutoMatch) return { label: `From ${extAutoMatch[1].trim()}`, subject: extAutoMatch[2] };

  const extSkipMatch = content.match(/📧\s*External email from\s+([^:]+):\s*"([^"]+)"\s*[—-]/);
  if (extSkipMatch) return { label: `From ${extSkipMatch[1].trim()}`, subject: extSkipMatch[2] };

  const extMatch = content.match(/📧\s*External email from\s+([^:]+):\s*"([^"]+)"/);
  if (extMatch) return { label: `From ${extMatch[1].trim()}`, subject: extMatch[2] };

  return null;
}

function EmailChatCard({ msg, onBuyCredits }: { msg: ChatMessage; onBuyCredits?: () => void }) {
  const meta = msg.metadata as Record<string, unknown> | undefined;
  const source = meta?.source as string | undefined;
  const fromEmail = meta?.fromEmail as string | undefined;
  const autoReplied = meta?.autoReplied === true;

  if (msg.role === "system") {
    const parsed = parseEmailContent(msg.content);
    const isFounder = source === "email";
    const isNoCredits = source === "external_email_no_credits";

    return (
      <div className="w-full max-w-[97%] rounded-xl border border-border/60 bg-muted/30 p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
            isFounder ? "bg-primary/10" : "bg-amber-500/10"
          )}>
            <Mail className={cn("w-3 h-3", isFounder ? "text-primary" : "text-amber-600")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {isFounder ? "Email from founder" : fromEmail ? `From ${fromEmail}` : "External email"}
            </p>
          </div>
        </div>
        {parsed?.subject && (
          <p className="text-[13px] font-medium text-foreground pl-8 leading-snug">
            {parsed.subject}
          </p>
        )}
        <div className="flex items-center gap-1.5 pl-8">
          {autoReplied && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              <Check className="w-2.5 h-2.5" />
              Auto-replied
            </span>
          )}
          {isNoCredits && (
            <button
              onClick={onBuyCredits}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
            >
              <AlertCircle className="w-2.5 h-2.5" />
              Needs credits
            </button>
          )}
          {!autoReplied && !isNoCredits && !isFounder && (
            <span className="text-[10px] text-muted-foreground">Received</span>
          )}
        </div>
      </div>
    );
  }

  if (msg.role === "assistant") {
    return (
      <div className="text-sm space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Reply className="w-3 h-3" />
          <span>Replied via email</span>
        </div>
        {renderMessageContent(msg.content, onBuyCredits)}
      </div>
    );
  }

  return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
}

const SUGGESTIONS = [
  { icon: Search, label: "Research my competitors", prompt: "Research my top 3 competitors and give me a detailed landscape analysis" },
  { icon: Mail, label: "Write outreach emails", prompt: "Research potential leads and write personalised cold outreach emails to each of them" },
  { icon: Globe, label: "Update my landing page", prompt: "Update my landing page with the latest company context and market positioning" },
];

export function ChatSidebar({
  projectId,
  activePanel,
  onConversationSettled,
  onLeadsCreated,
  onBuyCredits,
  onHashNavigate,
  externalMessage,
  onExternalMessageHandled,
}: ChatSidebarProps) {
  const {
    messages,
    sending,
    processing,
    sendMessage,
    hasMore,
    loadMore,
    loadingMore,
    queue,
    stopCurrentTask,
    removeFromQueue,
  } = useChat(projectId, { onLeadsCreated, activePanel });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollRef = useRef(false);
  const initialScrollDone = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // On initial load: instantly scroll to bottom. On send or streaming: scroll to bottom.
  useEffect(() => {
    if (messages.length === 0) return;
    if (!initialScrollDone.current) {
      messagesEndRef.current?.scrollIntoView();
      initialScrollDone.current = true;
      return;
    }
    // Always scroll when a message is streaming or when shouldScroll is set
    const lastMsg = messages[messages.length - 1];
    const isStreaming = lastMsg?.metadata?.streaming === true || lastMsg?.metadata?.pending === true;
    if (shouldScrollRef.current || isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  // When a processing task completes (detected via polling), refresh dashboard
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !processing) {
      onConversationSettled?.();
    }
    wasProcessingRef.current = processing;
  }, [processing, onConversationSettled]);

  // Auto-send external messages (e.g. from research suggestions or button clicks)
  // No longer gated on !sending — sendMessage handles queueing
  useEffect(() => {
    if (!externalMessage) return;
    shouldScrollRef.current = true;
    sendMessage(externalMessage).then(() => onConversationSettled?.());
    onExternalMessageHandled?.();
  }, [externalMessage, sendMessage, onConversationSettled, onExternalMessageHandled]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const msg = input;
    setInput("");
    shouldScrollRef.current = true;
    await sendMessage(msg);
    onConversationSettled?.();
  }, [input, sendMessage, onConversationSettled]);

  const handleLoadMore = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container.scrollHeight;
    loadMore().then(() => {
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      });
    });
  }, [loadMore]);

  const handleSuggestion = useCallback(
    (prompt: string) => {
      setInput(prompt);
      textareaRef.current?.focus();
    },
    []
  );

  const hasMessages = messages.length > 0;

  // Button state: stop when sending and no text typed, send otherwise
  const showStopButton = sending && !input.trim();
  const canSend = input.trim().length > 0;

  return (
    <div className="w-full border-l md:border-l-0 bg-background flex flex-col h-full">
      {/* ── Header ──────────────────────────────── */}
      <div className="px-4 py-3 border-b flex items-center gap-2.5">
        <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-primary shrink-0">
          <Sparkles className="w-3 h-3 text-primary-foreground" />
          {(sending || processing) && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-none">Artha</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
            {sending || processing ? "Working on it..." : "AI chief of staff"}
          </p>
        </div>
      </div>

      {/* ── Messages ────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pb-1">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-md hover:bg-muted disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load older messages"}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!hasMessages && (
            <div className="py-6">
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mb-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium text-foreground">What do you want to do?</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  I can research, build, write, and ship.
                </p>
              </div>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={() => handleSuggestion(s.prompt)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted transition-colors text-left group"
                    >
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => {
            const isEmail = msg.type === "email";
            const hasBreakdown = !!msg.metadata?.taskBreakdown;
            const isPending = !!msg.metadata?.pending;
            const isCancelled = !!(msg.metadata as Record<string, unknown>)?.cancelled;
            const isProcessing = !!(msg.metadata as Record<string, unknown>)?.processing;
            const isStaleProcessing = isProcessing && (Date.now() - new Date(msg.created_at).getTime()) > 3 * 60 * 1000;
            const isStreaming = isStreamingContent(msg);
            const isThinking = msg.role === "assistant" && (isPending || (isProcessing && !isStaleProcessing)) && !hasBreakdown && !isStreaming && isThinkingStep(msg.content);

            // ── Email messages get a dedicated card ──
            if (isEmail) {
              return (
                <div
                  key={msg.id}
                  className="flex flex-col gap-1 items-start text-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <EmailChatCard msg={msg} onBuyCredits={onBuyCredits} />
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "text-sm shadow-sm transition-all",
                    "break-words",
                    hasBreakdown ? "max-w-[97%] w-full" : "max-w-[85%]",
                    isThinking || isStreaming
                      ? "bg-[#0a0a0a] text-white rounded-2xl rounded-tl-none border border-[#1a1a1a] px-3.5 py-2.5"
                      : msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none px-3.5 py-2.5"
                      : hasBreakdown
                      ? "bg-muted/60 border border-border/60 rounded-2xl rounded-tl-none p-3"
                      : isCancelled
                      ? "bg-muted/40 text-muted-foreground rounded-2xl rounded-tl-none border border-border/40 px-3.5 py-2.5"
                      : "bg-muted text-foreground rounded-2xl rounded-tl-none border border-border/50 px-3.5 py-2.5"
                  )}
                >
                  {msg.role === "assistant" ? (
                    isStreaming ? (
                      /* ── Live streaming text from LLM ── */
                      <StreamingTextIndicator text={msg.content} />
                    ) : isThinking ? (
                      /* ── Thinking state ──────────── */
                      <ThinkingIndicator text={msg.content} />
                    ) : isStaleProcessing ? (
                      /* ── Stale processing (server may have crashed) ── */
                      <p className="whitespace-pre-wrap break-words text-muted-foreground">
                        This task seems stuck. Try sending a new message.
                      </p>
                    ) : hasBreakdown ? (
                      /* ── Task breakdown ──────────── */
                      <TaskBreakdown
                        items={msg.metadata!.taskBreakdown as TaskBreakdownItem[]}
                        isComplete={!isPending}
                        completionMessage={msg.content || undefined}
                        onHashNavigate={onHashNavigate}
                        onRetry={(retryMsg) => sendMessage(retryMsg)}
                      />
                    ) : (
                      /* ── Regular text ────────────── */
                      renderMessageContent(msg.content, onBuyCredits)
                    )
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {msg.task_id && (
                    <Badge
                      variant="outline"
                      className="mt-2 text-[10px] bg-background/50 backdrop-blur-sm"
                    >
                      Task created
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Queue pills ─────────────────────────── */}
      {queue.length > 0 && (
        <div className="px-3 py-2 border-t border-border/60 bg-muted/20">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">Queued:</span>
            {queue.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border/60 text-[11px] text-foreground max-w-[180px] group"
              >
                <span className="truncate">{item.message}</span>
                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Remove from queue"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ───────────────────────────────── */}
      <div className="p-3 border-t shrink-0">
        <div className="relative rounded-xl border border-border bg-background focus-within:border-foreground/30 transition-colors">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sending ? "Type to queue next task..." : "Ask anything or give me a task..."}
            className="min-h-[56px] max-h-[160px] resize-none text-sm border-0 shadow-none focus-visible:ring-0 rounded-xl pr-10 bg-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {showStopButton ? (
            /* ── Stop button ── */
            <button
              onClick={stopCurrentTask}
              className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all border-2 border-foreground hover:bg-foreground/10"
              aria-label="Stop current task"
            >
              <Square className="w-2.5 h-2.5 fill-foreground text-foreground" />
            </button>
          ) : (
            /* ── Send button ── */
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "absolute bottom-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                canSend
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              aria-label={sending ? "Queue message" : "Send message"}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5 select-none">
          {sending ? "↵ queue · ■ stop" : "↵ send · ⇧↵ new line"}
        </p>
      </div>
    </div>
  );
}
