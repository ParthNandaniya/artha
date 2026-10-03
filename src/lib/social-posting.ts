/**
 * Unified Social Media Posting API Client
 *
 * Wraps the PostForMe / Post Bridge unified API for cross-platform
 * social media posting (TikTok, Instagram, LinkedIn, X, YouTube, Threads).
 *
 * Env vars:
 *   SOCIAL_POSTING_API_KEY   — API key for the unified posting service
 *   SOCIAL_POSTING_BASE_URL  — Base URL (default: https://api.postforme.dev/v1)
 */

export type SocialPlatform = "twitter" | "linkedin" | "instagram" | "tiktok" | "youtube" | "threads";

export interface SocialPostRequest {
  platform: SocialPlatform;
  content: string;
  mediaUrl?: string;
  scheduledAt?: string; // ISO 8601
  hashtags?: string[];
  linkUrl?: string;
}

export interface SocialPostResponse {
  id: string;
  platform: SocialPlatform;
  externalPostId: string | null;
  status: "posted" | "scheduled" | "failed";
  postedAt: string | null;
  error: string | null;
}

export interface SocialAccountStatus {
  platform: SocialPlatform;
  connected: boolean;
  accountName: string | null;
  accountId: string | null;
}

interface SocialPostingConfig {
  apiKey: string;
  baseUrl: string;
}

function getConfig(): SocialPostingConfig {
  const apiKey = process.env.SOCIAL_POSTING_API_KEY;
  if (!apiKey) {
    throw new Error("SOCIAL_POSTING_API_KEY is not configured");
  }
  return {
    apiKey,
    baseUrl: process.env.SOCIAL_POSTING_BASE_URL || "https://api.postforme.dev/v1",
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`Social posting API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Post content to a social media platform.
 */
export async function createSocialPost(post: SocialPostRequest): Promise<SocialPostResponse> {
  return apiRequest<SocialPostResponse>("/posts", {
    method: "POST",
    body: JSON.stringify({
      platform: post.platform,
      text: post.content,
      media_url: post.mediaUrl,
      scheduled_at: post.scheduledAt,
      hashtags: post.hashtags,
      link_url: post.linkUrl,
    }),
  });
}

/**
 * Schedule multiple posts across platforms.
 */
export async function createBulkPosts(posts: SocialPostRequest[]): Promise<SocialPostResponse[]> {
  return apiRequest<SocialPostResponse[]>("/posts/bulk", {
    method: "POST",
    body: JSON.stringify({
      posts: posts.map((p) => ({
        platform: p.platform,
        text: p.content,
        media_url: p.mediaUrl,
        scheduled_at: p.scheduledAt,
        hashtags: p.hashtags,
        link_url: p.linkUrl,
      })),
    }),
  });
}

/**
 * Get connected social media accounts.
 */
export async function getConnectedAccounts(): Promise<SocialAccountStatus[]> {
  return apiRequest<SocialAccountStatus[]>("/accounts");
}

/**
 * Get the OAuth connection URL for a platform.
 */
export async function getOAuthUrl(
  platform: SocialPlatform,
  callbackUrl: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/auth/connect", {
    method: "POST",
    body: JSON.stringify({ platform, callback_url: callbackUrl }),
  });
}

/**
 * Delete a scheduled post.
 */
export async function deleteSocialPost(postId: string): Promise<void> {
  await apiRequest(`/posts/${postId}`, { method: "DELETE" });
}

/**
 * Get engagement analytics for a post.
 */
export async function getPostAnalytics(postId: string): Promise<{
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
}> {
  return apiRequest(`/posts/${postId}/analytics`);
}

/**
 * Check if the social posting service is configured.
 */
export function isSocialPostingConfigured(): boolean {
  return !!process.env.SOCIAL_POSTING_API_KEY;
}

/**
 * Platform-specific character limits.
 */
export const PLATFORM_LIMITS: Record<SocialPlatform, { maxChars: number; maxHashtags: number; supportsMedia: boolean; supportsVideo: boolean }> = {
  twitter: { maxChars: 280, maxHashtags: 5, supportsMedia: true, supportsVideo: true },
  linkedin: { maxChars: 3000, maxHashtags: 10, supportsMedia: true, supportsVideo: true },
  instagram: { maxChars: 2200, maxHashtags: 30, supportsMedia: true, supportsVideo: true },
  tiktok: { maxChars: 4000, maxHashtags: 20, supportsMedia: false, supportsVideo: true },
  youtube: { maxChars: 5000, maxHashtags: 15, supportsMedia: false, supportsVideo: true },
  threads: { maxChars: 500, maxHashtags: 5, supportsMedia: true, supportsVideo: true },
};
