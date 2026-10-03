"use client";

import { useState, useEffect, useRef } from "react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Project, Task, EmailThread, EmailMessage } from "@/lib/types";
import {
  canSendProjectEmail,
  getEmailSetupBlockedReason,
  getEmailSetupStatus,
} from "@/lib/project-integrations";
import {
  useEmailThreads,
  useEmailThread,
  useMarkThreadRead,
  useSendEmail,
} from "@/hooks/use-emails";
import { useRunIntegrationAction } from "@/hooks/use-integrations";
import { AiGenerateButton } from "@/components/ai-enhancer";
import { InlineActionButton } from "@/components/inline-action-button";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface EmailPanelProps {
  project: Project;
  tasks: Task[];
  onRefresh: () => void | Promise<void>;
  onBuyCredits?: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getInitial(email: string): string {
  return email.charAt(0).toUpperCase();
}

function getAvatarColor(email: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500",
    "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/** Get the "other party" from thread participants (not the company email) */
function getOtherParticipant(participants: string[], companyEmail: string): string {
  const other = participants.find(
    (p) => p.toLowerCase() !== companyEmail.toLowerCase()
  );
  return other || participants[0] || "Unknown";
}

// ─── Thread List Item ──────────────────────────────────────────────────────

function ThreadItem({
  thread,
  isSelected,
  companyEmail,
  onClick,
}: {
  thread: EmailThread;
  isSelected: boolean;
  companyEmail: string;
  onClick: () => void;
}) {
  const sender = getOtherParticipant(thread.participants, companyEmail);
  const senderName = sender.split("@")[0];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${
        isSelected ? "bg-muted" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 mt-0.5 ${getAvatarColor(sender)}`}>
          {getInitial(sender)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${!thread.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {senderName}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(thread.last_message_at)}
            </span>
          </div>
          <p className={`text-sm truncate mt-0.5 ${!thread.is_read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
            {thread.subject}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {thread.snippet}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {!thread.is_read && (
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1" />
          )}
          {thread.message_count > 1 && (
            <span className="text-[10px] text-muted-foreground">{thread.message_count}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────

function MessageBubble({
  message,
  companyEmail,
}: {
  message: EmailMessage;
  companyEmail: string;
}) {
  const isOutbound = message.direction === "outbound";
  const senderLabel = isOutbound ? "You" : message.from_email.split("@")[0];

  return (
    <div className={`${isOutbound ? "ml-8" : "mr-8"}`}>
      <div className={`rounded-lg border p-4 ${isOutbound ? "bg-primary/5 border-primary/20" : "bg-background"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${isOutbound ? "bg-primary" : getAvatarColor(message.from_email)}`}>
              {isOutbound ? "Y" : getInitial(message.from_email)}
            </div>
            <span className="text-sm font-medium">{senderLabel}</span>
            <span className="text-xs text-muted-foreground">
              to {isOutbound ? message.to_email.split("@")[0] : "you"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div
          className="prose prose-sm max-w-none dark:prose-invert text-sm"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(
              message.body_html ||
              `<pre class="whitespace-pre-wrap font-sans">${message.body_text || ""}</pre>`
            ),
          }}
        />
      </div>
    </div>
  );
}

// ─── Reply Box ─────────────────────────────────────────────────────────────

function ReplyBox({
  projectId,
  thread,
  lastMessage,
  companyEmail,
  onSent,
  onBuyCredits,
}: {
  projectId: string;
  thread: EmailThread;
  lastMessage: EmailMessage | null;
  companyEmail: string;
  onSent: () => void;
  onBuyCredits?: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const { mutateAsync: sendEmail } = useSendEmail(projectId);

  const replyTo = lastMessage
    ? lastMessage.direction === "inbound"
      ? lastMessage.from_email
      : lastMessage.to_email
    : getOtherParticipant(thread.participants, companyEmail);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await sendEmail({
        to: replyTo,
        subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
        htmlBody: `<p style="font-size:15px;line-height:1.6;color:#374151;">${body.replace(/\n/g, "<br>")}</p>`,
        inReplyTo: lastMessage?.message_id || undefined,
        threadId: thread.id,
      });
    } catch {
      // email may have been sent even if DB write failed after — clear anyway
    } finally {
      setBody("");
      setSending(false);
      onSent();
    }
  }

  return (
    <div className="border-t p-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">
          Reply to {replyTo}
        </span>
        <InlineActionButton
          projectId={projectId}
          action="draft_reply"
          context={{
            threadSubject: thread.subject,
            threadSnippet: thread.snippet,
            replyTo,
            lastMessageBody: lastMessage?.body_text?.slice(0, 500) || "",
            currentDraft: body,
          }}
          onResult={(values) => {
            if (values.body && typeof values.body === "string") setBody(values.body);
          }}
          onNeedCredits={onBuyCredits}
          label={body.trim() ? "Enhance with AI" : "Draft with AI"}
          loadingLabel="Drafting..."
          size="sm"
          variant="outline"
        />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your reply..."
        className="min-h-[100px] text-sm resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-muted-foreground">
          Cmd+Enter to send
        </span>
        <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

// ─── Thread Detail ─────────────────────────────────────────────────────────

function ThreadDetail({
  projectId,
  threadId,
  companyEmail,
  canSendEmail,
  onBack,
  onBuyCredits,
}: {
  projectId: string;
  threadId: string;
  companyEmail: string;
  canSendEmail: boolean;
  onBack: () => void;
  onBuyCredits?: () => void;
}) {
  const { data, isLoading, refetch } = useEmailThread(projectId, threadId);
  const { mutate: markRead } = useMarkThreadRead(projectId);
  const prevThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (data?.thread && !data.thread.is_read) {
      markRead({ threadId, is_read: true });
    }
  }, [data?.thread, threadId, markRead]);

  // Only auto-scroll when opening a new thread, not on every render
  useEffect(() => {
    if (threadId !== prevThreadIdRef.current) {
      prevThreadIdRef.current = threadId;
    }
  }, [threadId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <ArthaLoader size={32} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading thread...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Thread not found
      </div>
    );
  }

  const { thread, messages } = data;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="md:hidden text-muted-foreground hover:text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{thread.subject}</h3>
          <p className="text-xs text-muted-foreground">
            {thread.message_count} message{thread.message_count !== 1 ? "s" : ""} &middot;{" "}
            {thread.participants.filter((p) => p.toLowerCase() !== companyEmail.toLowerCase()).join(", ")}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} companyEmail={companyEmail} />
          ))}
        </div>
      </ScrollArea>

      {/* Reply */}
      {canSendEmail && (
        <ReplyBox
          projectId={projectId}
          thread={thread}
          lastMessage={lastMessage}
          companyEmail={companyEmail}
          onSent={() => refetch()}
          onBuyCredits={onBuyCredits}
        />
      )}
    </div>
  );
}

// ─── Compose Dialog ────────────────────────────────────────────────────────

function ComposeDialog({
  projectId,
  open,
  onOpenChange,
  onBuyCredits,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBuyCredits?: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: sendEmail } = useSendEmail(projectId);

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    setError(null);
    try {
      await sendEmail({
        to,
        subject,
        htmlBody: `<p style="font-size:15px;line-height:1.6;color:#374151;">${body.replace(/\n/g, "<br>")}</p>`,
      });
      setTo("");
      setSubject("");
      setBody("");
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="mt-1"
              />
            </div>
            <div className="pt-4">
              <AiGenerateButton
                projectId={projectId}
                formType="email"
                currentValues={{ to, subject, body }}
                context={{ to }}
                onResult={(values) => {
                  if (values.subject) setSubject(values.subject);
                  if (values.body) setBody(values.body);
                }}
                onNeedCredits={onBuyCredits}
                label={subject.trim() || body.trim() ? "Enhance with AI" : "Generate with AI"}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email..."
              className="mt-1 min-h-[200px] text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSend}
            disabled={sending || !to || !subject || !body}
          >
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export function EmailPanel({ project, tasks, onRefresh, onBuyCredits }: EmailPanelProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailAddress = project.company_email || `${project.slug}@tryartha.com`;
  const emailSetupStatus = getEmailSetupStatus(project);
  const emailCanSend = canSendProjectEmail(project);
  const emailBlockedReason = getEmailSetupBlockedReason(project);

  const { threads, stats, isLoading } = useEmailThreads(project.id);
  const { mutateAsync: runIntegration } = useRunIntegrationAction(project.id);

  const filteredThreads = search.trim()
    ? threads.filter(
        (t) =>
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          t.participants.some((p) => p.toLowerCase().includes(search.toLowerCase())) ||
          (t.snippet || "").toLowerCase().includes(search.toLowerCase())
      )
    : threads;

  async function handleSetupEmail() {
    setSetupLoading(true);
    setError(null);
    setSetupMessage(null);
    try {
      const data = await runIntegration("create_email_address");
      setSetupMessage(`Email created: ${data.companyEmail}. A welcome email has been sent!`);
      await onRefresh();
    } catch (err: any) {
      setError(err.message || "Email setup failed");
    } finally {
      setSetupLoading(false);
    }
  }

  // On mobile, selecting a thread hides the list
  const showList = !selectedThreadId || typeof window === "undefined";

  return (
    <div className="h-[calc(100vh-10rem)] min-h-[400px]">
      {/* Setup bar (if not configured) */}
      {!emailCanSend && (
        <div className="px-4 py-3 border-b bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={
                emailSetupStatus === "configured"
                  ? "default"
                  : emailSetupStatus === "failed"
                  ? "destructive"
                  : "secondary"
              }
            >
              {emailSetupStatus === "configured"
                ? "Email Active"
                : emailSetupStatus === "failed"
                ? "Setup Failed"
                : emailSetupStatus === "skipped"
                ? "Setup Unavailable"
                : "Pending Setup"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={setupLoading}
              onClick={() => void handleSetupEmail()}
            >
              {setupLoading ? "Creating..." : "Set up email"}
            </Button>
          </div>
          {emailBlockedReason && (
            <p className="text-sm text-muted-foreground">{emailBlockedReason}</p>
          )}
          {setupMessage && <p className="text-sm text-emerald-600">{setupMessage}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <div className="flex h-full border rounded-lg overflow-hidden bg-background">
        {/* Left: Thread list */}
        <div
          className={`w-full md:w-[340px] lg:w-[380px] border-r flex flex-col shrink-0 ${
            selectedThreadId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Inbox</h2>
                <p className="text-xs text-muted-foreground font-mono">{emailAddress}</p>
              </div>
              <div className="flex items-center gap-2">
                {stats.unread > 0 && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    {stats.unread}
                  </Badge>
                )}
                {emailCanSend && (
                  <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
                    Compose
                  </Button>
                )}
              </div>
            </div>
            <Input
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Thread list */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <ArthaLoader size={16} className="text-muted-foreground" />
                Loading...
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {search ? "No matching emails" : "No emails yet"}
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isSelected={selectedThreadId === thread.id}
                  companyEmail={emailAddress}
                  onClick={() => setSelectedThreadId(thread.id)}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* Right: Thread detail */}
        <div
          className={`flex-1 min-w-0 ${
            !selectedThreadId ? "hidden md:flex" : "flex"
          } flex-col`}
        >
          {selectedThreadId ? (
            <ThreadDetail
              projectId={project.id}
              threadId={selectedThreadId}
              companyEmail={emailAddress}
              canSendEmail={emailCanSend}
              onBack={() => setSelectedThreadId(null)}
              onBuyCredits={onBuyCredits}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a conversation to read
            </div>
          )}
        </div>
      </div>

      {/* Compose dialog */}
      <ComposeDialog
        projectId={project.id}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onBuyCredits={onBuyCredits}
      />
    </div>
  );
}
