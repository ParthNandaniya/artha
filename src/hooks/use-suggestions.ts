"use client";

import { useQuery } from "@tanstack/react-query";

interface Suggestion {
  id: string;
  type: string;
  panel: string;
  title: string;
  description: string;
  actionLabel: string;
  chatMessage: string;
}

async function fetchSuggestions(projectId: string): Promise<Suggestion[]> {
  const res = await fetch("/api/ai/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

export function useSuggestions(projectId: string | undefined) {
  return useQuery({
    queryKey: ["suggestions", projectId],
    queryFn: () => fetchSuggestions(projectId!),
    enabled: !!projectId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

export function filterSuggestionsByPanel(suggestions: Suggestion[], panel: string): Suggestion[] {
  return suggestions.filter((s) => s.panel === panel);
}
