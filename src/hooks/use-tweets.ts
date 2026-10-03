"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tweet } from "@/lib/types";

export function useTweets(projectId: string) {
  return useQuery<Tweet[]>({
    queryKey: ["tweets", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/tweets?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load tweets");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function usePostTweet(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post tweet");
      return data as Tweet;
    },
    onSuccess: (newTweet) => {
      queryClient.setQueryData<Tweet[]>(["tweets", projectId], (prev) =>
        prev ? [newTweet, ...prev] : [newTweet]
      );
    },
  });
}

export function useDeleteTweet(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tweetId: string) => {
      const res = await fetch(`/api/tweets?projectId=${projectId}&id=${tweetId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete tweet");
    },
    onSuccess: (_data, tweetId) => {
      queryClient.setQueryData<Tweet[]>(["tweets", projectId], (prev) =>
        prev ? prev.filter((t) => t.id !== tweetId) : []
      );
    },
  });
}
