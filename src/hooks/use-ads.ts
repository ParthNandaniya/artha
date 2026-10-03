"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdsDashboardData, AdsSettings, AdsCampaign } from "@/lib/ads/types";

export interface MetaAdAccount {
  id: string;
  name: string;
  accountId: string;
  currency: string;
}

export interface MetaPage {
  id: string;
  name: string;
  category: string;
}

export interface MetaConnection {
  platform: string;
  accountName: string;
  accountId: string;
  expiresAt: string;
  connected: boolean;
  metadata?: {
    selectedAdAccountId?: string;
    selectedAdAccountName?: string;
    selectedPageId?: string;
    selectedPageName?: string;
    adAccounts?: MetaAdAccount[];
  };
}

export interface CampaignInsights {
  impressions: number;
  clicks: number;
  spend: string;
  ctr: string;
  cpc: string;
  reach: number;
  conversions: number;
}

export function useAdsDashboard(projectId: string) {
  return useQuery<AdsDashboardData>({
    queryKey: ["ads", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/ads?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load ads data");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useMetaConnection(projectId: string) {
  return useQuery<MetaConnection | null>({
    queryKey: ["meta-connection", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/social-connections?projectId=${projectId}`);
      if (!res.ok) return null;
      const connections = await res.json();
      const meta = connections.find((c: MetaConnection) => c.platform === "meta");
      return meta || null;
    },
    enabled: !!projectId,
  });
}

export function useMetaAdAccounts(projectId: string, enabled: boolean) {
  return useQuery<MetaAdAccount[]>({
    queryKey: ["meta-ad-accounts", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/meta/accounts?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch ad accounts");
      const data = await res.json();
      return data.accounts;
    },
    enabled: !!projectId && enabled,
  });
}

export function useMetaPages(projectId: string, enabled: boolean) {
  return useQuery<MetaPage[]>({
    queryKey: ["meta-pages", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/meta/pages?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch pages");
      const data = await res.json();
      return data.pages;
    },
    enabled: !!projectId && enabled,
  });
}

export function useSelectMetaAccount(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      adAccountId?: string;
      adAccountName?: string;
      pageId?: string;
      pageName?: string;
    }) => {
      const res = await fetch("/api/meta/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...params }),
      });
      if (!res.ok) throw new Error("Failed to update selection");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-connection", projectId] });
    },
  });
}

export function useUpdateAdsSettings(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AdsSettings>) => {
      const res = await fetch("/api/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...updates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to update settings");
      }
      return (await res.json()) as AdsSettings;
    },
    onSuccess: (newSettings) => {
      queryClient.setQueryData<AdsDashboardData>(["ads", projectId], (prev) =>
        prev ? { ...prev, settings: newSettings } : prev
      );
    },
  });
}

export function usePrepareAdsCampaign(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to prepare campaign");
      }
      const data = await res.json();
      return data.campaign as AdsCampaign;
    },
    onSuccess: (newCampaign) => {
      queryClient.setQueryData<AdsDashboardData>(["ads", projectId], (prev) =>
        prev
          ? { ...prev, campaigns: [newCampaign, ...prev.campaigns] }
          : prev
      );
    },
  });
}

export function useLaunchAdsCampaign(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch("/api/ads/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, campaignId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to launch campaign");
      }
      const data = await res.json();
      return data.campaign as AdsCampaign;
    },
    onSuccess: (updatedCampaign) => {
      queryClient.setQueryData<AdsDashboardData>(["ads", projectId], (prev) =>
        prev
          ? {
              ...prev,
              campaigns: prev.campaigns.map((c) =>
                c.id === updatedCampaign.id ? updatedCampaign : c
              ),
            }
          : prev
      );
    },
  });
}

export function useToggleCampaign(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { campaignId: string; action: "activate" | "pause" }) => {
      const res = await fetch("/api/ads/campaigns/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...params }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to update campaign");
      }
      const data = await res.json();
      return { campaignId: params.campaignId, status: data.status as string };
    },
    onSuccess: ({ campaignId, status }) => {
      queryClient.setQueryData<AdsDashboardData>(["ads", projectId], (prev) =>
        prev
          ? {
              ...prev,
              campaigns: prev.campaigns.map((c) =>
                c.id === campaignId ? { ...c, status: status as AdsCampaign["status"] } : c
              ),
            }
          : prev
      );
    },
  });
}

export function useCampaignInsights(projectId: string, campaignId: string | null) {
  return useQuery<CampaignInsights | null>({
    queryKey: ["campaign-insights", projectId, campaignId],
    queryFn: async () => {
      const res = await fetch(
        `/api/ads/campaigns/insights?projectId=${projectId}&campaignId=${campaignId}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.insights;
    },
    enabled: !!projectId && !!campaignId,
    refetchInterval: 60000, // refresh every minute
  });
}
