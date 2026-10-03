"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RevenueTransaction } from "@/lib/types";

export function useRevenue(projectId: string) {
  return useQuery<RevenueTransaction[]>({
    queryKey: ["revenue", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/revenue?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load revenue");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useWithdrawRevenue(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      amountCents,
      method,
      paypalEmail,
    }: {
      amountCents: number;
      method: "stripe_bank" | "paypal";
      paypalEmail?: string;
    }) => {
      const res = await fetch("/api/revenue/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          amountCents,
          method,
          paypalEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to withdraw revenue");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue", projectId] });
    },
  });
}

export interface Subscriber {
  email: string;
  name: string | null;
  plan_name: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  billing_interval: string | null;
  subscribed_at: string;
  canceled_at: string | null;
  current_period_end: string | null;
}

export interface SubscriberSummary {
  activeCount: number;
  canceledCount: number;
  newLast7Days: number;
  mrrCents: number;
  revenueLast7DaysCents: number;
  hasSubscribers: boolean;
}

export function useSubscribers(projectId: string) {
  return useQuery<{ subscribers: Subscriber[]; summary: SubscriberSummary }>({
    queryKey: ["subscribers", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/subscribers?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load subscribers");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useSetupStripeConnect(projectId: string) {
  // we do not necessarily need project ID here but kept for consistency
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect stripe");
      return data;
    },
  });
}
