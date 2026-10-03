"use client";

import { useQuery } from "@tanstack/react-query";

export interface AgentActivity {
  id: string;
  agent_type: string;
  action: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useAgentActivity(projectId?: string) {
  return useQuery<AgentActivity[]>({
    queryKey: ["agent-activity", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/activity?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
