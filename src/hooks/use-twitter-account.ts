"use client";

import { useQuery } from "@tanstack/react-query";
import type { TwitterAccountStatus } from "@/lib/types";

export function useTwitterAccount() {
  return useQuery<TwitterAccountStatus | null>({
    queryKey: ["twitter-account"],
    queryFn: async () => {
      const res = await fetch("/api/twitter/account");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });
}
