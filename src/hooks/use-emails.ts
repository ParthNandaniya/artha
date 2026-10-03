"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmailThread, EmailMessage } from "@/lib/types";

interface ThreadsData {
  threads: EmailThread[];
  stats: { total: number; unread: number };
}

interface ThreadDetailData {
  thread: EmailThread;
  messages: EmailMessage[];
}

export function useEmailThreads(projectId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<ThreadsData>({
    queryKey: ["email-threads", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/emails?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load emails");
      return res.json();
    },
    enabled: !!projectId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["email-threads", projectId] });

  return {
    ...query,
    threads: query.data?.threads ?? [],
    stats: query.data?.stats ?? { total: 0, unread: 0 },
    invalidate,
  };
}

export function useEmailThread(projectId: string, threadId: string | null) {
  return useQuery<ThreadDetailData>({
    queryKey: ["email-thread", projectId, threadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/emails/${threadId}?projectId=${projectId}`
      );
      if (!res.ok) throw new Error("Failed to load thread");
      return res.json();
    },
    enabled: !!projectId && !!threadId,
  });
}

export function useMarkThreadRead(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, is_read }: { threadId: string; is_read: boolean }) => {
      const res = await fetch(`/api/projects/emails/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, is_read }),
      });
      if (!res.ok) throw new Error("Failed to update thread");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-threads", projectId] });
    },
  });
}

export function useSendEmail(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      to,
      subject,
      htmlBody,
      inReplyTo,
      threadId,
    }: {
      to: string;
      subject: string;
      htmlBody: string;
      inReplyTo?: string;
      threadId?: string;
    }) => {
      const res = await fetch("/api/projects/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          to,
          subject,
          htmlBody,
          inReplyTo,
          threadId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send email");
      }

      return res.json().catch(() => ({}));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["email-threads", projectId] });
      queryClient.invalidateQueries({ queryKey: ["email-thread", projectId] });
    },
  });
}

// Keep old types exported for backward compat (other files may reference them)
export interface InboundEmail {
  id: string;
  from_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  received_at: string;
  processed: boolean;
  message_id?: string;
}

export interface OutboundEmail {
  id: string;
  title: string;
  description: string;
  result: string;
  summary: string;
  completed_at: string;
}
