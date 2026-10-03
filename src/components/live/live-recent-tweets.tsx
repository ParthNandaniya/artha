"use client";

import type { LiveRecentTweet } from "@/hooks/use-live-dashboard";
import { LiveSectionHeader } from "./live-section-header";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveRecentTweetsProps {
  tweets: LiveRecentTweet[];
  totalTweets: number;
  isFetching?: boolean;
}

export function LiveRecentTweets({ tweets, totalTweets, isFetching }: LiveRecentTweetsProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <LiveSectionHeader
        title="Twitter / Bluesky"
        isFetching={isFetching}
        right={
          totalTweets > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatNumber(totalTweets)} posted
            </span>
          ) : null
        }
      />

      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {tweets.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No recent posts</p>
          </div>
        ) : (
          tweets.map((tweet, i) => (
            <div key={`${tweet.projectSlug}-${tweet.source}-${i}`} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate">
                    {tweet.projectName}
                  </span>
                  {tweet.source === "bot" && (
                    <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                      @tryarthaHQ
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(tweet.postedAt)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {tweet.content}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                {tweet.tweetUrl && (
                  <a
                    href={tweet.tweetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    View on X &rarr;
                  </a>
                )}
                {tweet.blueskyUrl && (
                  <a
                    href={tweet.blueskyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline"
                  >
                    View on Bluesky &rarr;
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
