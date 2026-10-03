"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, OutreachEmail } from "@/lib/types";

export function useTasks(projectId?: string) {
  return useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/tasks?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useRunTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch("/api/tasks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to run task");
      return { taskId, data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

export function useReorderTasks(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder tasks");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}?projectId=${projectId}`, { 
        method: "DELETE" 
      });
      if (!res.ok) throw new Error("Failed to delete task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const res = await fetch(`/api/tasks/${taskId}?projectId=${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: {
      title: string;
      description: string;
      isRecurring: boolean;
      recurrenceInterval?: string;
    }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: task.title,
          description: task.description,
          isRecurring: task.isRecurring,
          recurrenceInterval: task.recurrenceInterval,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

export function useGenerateTask(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tasks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.status === 402) {
        const err = new Error("No credits remaining") as Error & { status: number };
        err.status = 402;
        throw err;
      }
      if (!res.ok) throw new Error("Failed to generate task suggestion");
      return res.json() as Promise<{
        title: string;
        description: string;
        isRecurring: boolean;
      }>;
    },
  });
}

export function useConfirmOutreach(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, action, emails }: { taskId: string; action: string; emails?: OutreachEmail[] }) => {
      const res = await fetch("/api/tasks/confirm-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, projectId, action, emails }),
      });
      if (!res.ok) throw new Error("Failed to confirm outreach");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}
