"use client";

import { useState } from "react";
import { Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project, Tweet } from "@/lib/types";
import { AiGenerateButton } from "@/components/ai-enhancer";
import {
  canPostProjectTweet,
  getTweetSetupBlockedReason,
  getTweetSetupStatus,
} from "@/lib/project-integrations";
import { useTweets, usePostTweet, useDeleteTweet } from "@/hooks/use-tweets";
import { useTwitterAccount } from "@/hooks/use-twitter-account";
import { useRunIntegrationAction } from "@/hooks/use-integrations";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const MAX_CHARS = 280;

interface TwitterPanelProps {
  project: Project;
  onRefresh: () => void | Promise<void>;
}

function tweetTypeLabel(type: Tweet["type"]) {
  const map: Record<Tweet["type"], string> = {
    launch: "Launch",
    update: "Update",
    milestone: "Milestone",
    custom: "Tweet",
  };
  return map[type] ?? "Tweet";
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function TwitterPanel({ project, onRefresh }: TwitterPanelProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [connectingTwitter, setConnectingTwitter] = useState(false);

  const { data: tweets = [], isLoading: loadingTweets } = useTweets(project.id);
  const { data: twitterAccount, isLoading: loadingAccount } = useTwitterAccount();
  const postTweet = usePostTweet(project.id);
  const deleteTweet = useDeleteTweet(project.id);
  const queryClient = useQueryClient();

  const { mutateAsync: runIntegration } = useRunIntegrationAction(project.id);

  // Company's own Twitter account connection
  const { data: socialConnections = [] } = useQuery<Array<{ platform: string; accountName: string; connected: boolean }>>({
    queryKey: ["social-connections", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/social-connections?projectId=${project.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const companyTwitter = socialConnections.find((c) => c.platform === "twitter");

  async function handleConnectCompanyTwitter() {
    setConnectingTwitter(true);
    setError(null);
    try {
      const res = await fetch(`/api/twitter/connect?projectId=${project.id}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start Twitter connection");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnectingTwitter(false);
    }
  }

  async function handleDisconnectCompanyTwitter() {
    try {
      await fetch(`/api/twitter/connect?projectId=${project.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["social-connections", project.id] });
    } catch {
      setError("Failed to disconnect");
    }
  }

  const tweetSetupStatus = getTweetSetupStatus(project);
  const canPostTweet = canPostProjectTweet(project);
  const tweetBlockedReason = getTweetSetupBlockedReason(project);
  const remaining = MAX_CHARS - content.length;
  const overLimit = remaining < 0;
  const appConfigured = twitterAccount?.appConfigured ?? true;
  const accountConnected = twitterAccount?.connected ?? false;
  const accountConnectionError = twitterAccount?.connectionError ?? null;
  const accountLabel = twitterAccount?.accountName ? `@${twitterAccount.accountName}` : "your platform X account";
  const effectiveBlockedReason = loadingAccount
    ? tweetBlockedReason
    : accountConnectionError
      ? accountConnectionError
      : !appConfigured
      ? "Twitter app credentials are not configured on this server yet."
      : !accountConnected
        ? "Twitter platform account is not configured yet."
        : tweetBlockedReason;

  async function handlePost() {
    setSetupMessage(null);
    if (!appConfigured || !accountConnected || !canPostTweet) {
      setError(effectiveBlockedReason || "Twitter setup is not ready yet.");
      return;
    }
    if (!content.trim() || overLimit) return;

    setError(null);
    try {
      await postTweet.mutateAsync(content);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleSetupTweet() {
    setSetupLoading(true);
    setError(null);
    setSetupMessage(null);
    try {
      const data = await runIntegration("post_launch_tweet");
      setSetupMessage(data.alreadyPosted ? "Launch tweet already exists." : "Launch tweet posted.");
      await onRefresh();
    } catch (err: any) {
      setError(err.message || "Twitter setup failed");
    } finally {
      setSetupLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Twitter</h2>
        <p className="text-sm text-muted-foreground">
          Post tweets from{" "}
          {twitterAccount?.accountName ? (
            <a
              href={`https://x.com/${twitterAccount.accountName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline"
            >
              @{twitterAccount.accountName}
            </a>
          ) : (
            <span className="font-mono">your platform X account</span>
          )}{" "}
          on behalf of{" "}
          <span className="font-medium">{project.name}</span>. Free, no credits used.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Twitter Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {companyTwitter ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  Connected as{" "}
                  <a
                    href={`https://x.com/${companyTwitter.accountName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    @{companyTwitter.accountName}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">
                  Posts from {project.name} will be published from this account.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">Connected</Badge>
                <Button size="sm" variant="outline" onClick={handleDisconnectCompanyTwitter}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm">Connect your company&apos;s Twitter account</p>
                <p className="text-xs text-muted-foreground">
                  Allow {project.name} to post tweets directly from your account instead of the platform account.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleConnectCompanyTwitter}
                disabled={connectingTwitter}
              >
                {connectingTwitter ? "Connecting..." : "Connect Twitter"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {
            tweetSetupStatus !== "configured" && tweetSetupStatus !== "skipped" && (
              <Badge
                variant={
                  tweetSetupStatus === "failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {tweetSetupStatus === "failed"
                  ? "Setup Failed"
                  : "Pending Setup"}
              </Badge>
            )
          }
          {appConfigured && accountConnected && !canPostTweet && (
            <Button
              size="sm"
              variant="outline"
              disabled={setupLoading}
              onClick={() => void handleSetupTweet()}
            >
              {setupLoading ? "Posting..." : "Set up tweet"}
            </Button>
          )}
        </div>
        {effectiveBlockedReason && (
          <p className={`text-sm ${accountConnectionError ? "text-destructive" : "text-muted-foreground"}`}>
            {effectiveBlockedReason}
          </p>
        )}
        {setupMessage && (
          <p className="text-sm text-emerald-600">{setupMessage}</p>
        )}
        {!loadingAccount && accountConnected && twitterAccount?.accountName && (
          <p className="text-sm text-muted-foreground">
            Platform account: <span className="font-mono">@{twitterAccount.accountName}</span>
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Tweet</CardTitle>
          <CardAction>
            <AiGenerateButton
              projectId={project.id}
              formType="tweet"
              currentValues={{ content }}
              onResult={(values) => {
                if (values.content) setContent(values.content);
              }}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`What's happening with ${project.name}?`}
              className="min-h-[120px] resize-none pr-14"
            />
            <span
              className={`absolute bottom-3 right-3 text-xs tabular-nums ${
                overLimit
                  ? "text-destructive font-semibold"
                  : remaining <= 20
                  ? "text-amber-500"
                  : "text-muted-foreground"
              }`}
            >
              {remaining}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Your post will also be shared on Bluesky @tryartha.bsky.social to help your company reach a wider audience.
          </p>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex items-center justify-end">
            <Button
              onClick={handlePost}
              disabled={postTweet.isPending || !content.trim() || overLimit || !canPostTweet || !appConfigured || !accountConnected}
              size="sm"
            >
              {postTweet.isPending ? "Posting..." : "Post Tweet"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tweet History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTweets ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : tweets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tweets yet. Post your first one above.
            </p>
          ) : (
            <div className="space-y-0 divide-y">
              {tweets.map((tweet) => (
                <div key={tweet.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {tweet.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {tweetTypeLabel(tweet.type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(tweet.posted_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0 mt-0.5">
                      {tweet.tweet_url && (
                        <a
                          href={tweet.tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded hover:bg-primary/5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      )}
                      <div className="w-px h-4 bg-border mx-1" />
                      <button
                        onClick={() => deleteTweet.mutate(tweet.id)}
                        disabled={deleteTweet.isPending}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
                        aria-label="Delete tweet"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
