"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Document } from "@/lib/types";

export function useDocuments(projectId?: string) {
  return useQuery<Document[]>({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/documents?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useUpdateDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; title: string; content: string }) => {
      const res = await fetch("/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update document");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });
}
