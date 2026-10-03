import { useQuery } from "@tanstack/react-query";

interface OutreachMetrics {
  email: {
    totalSent: number;
    delivered: number;
    opened: number;
    bounced: number;
    repliesReceived: number;
    openRate: number;
  };
  leads: {
    total: number;
    contacted: number;
    replied: number;
    qualified: number;
    converted: number;
    lost: number;
  };
  weekly: {
    sent: number;
    opened: number;
    replies: number;
  };
}

export function useOutreachMetrics(projectId: string | null) {
  return useQuery<OutreachMetrics>({
    queryKey: ["outreach-metrics", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/outreach-metrics?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch outreach metrics");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60_000,
  });
}
