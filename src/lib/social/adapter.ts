import { getDb } from "@/lib/neon";
import { postTweet } from "@/lib/twitter";

export interface SocialPostResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

export interface SocialCredentials {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Post content to a social platform using stored credentials.
 * Extensible: add new platform cases as integrations are added.
 */
export async function postToChannel(
  platform: string,
  content: string,
  projectId: string
): Promise<SocialPostResult> {
  switch (platform) {
    case "twitter":
      return postToTwitter(content);
    case "linkedin":
      return postToLinkedIn(content, projectId);
    case "reddit":
      return postToReddit(content, projectId);
    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}

async function postToTwitter(content: string): Promise<SocialPostResult> {
  try {
    const result = await postTweet({ text: content });
    return {
      success: true,
      externalId: result.tweetId,
      externalUrl: result.tweetUrl || undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Twitter post failed",
    };
  }
}

/**
 * Refresh a user's LinkedIn access token using their stored refresh token.
 * Updates the social_connections row with the new token.
 */
async function refreshLinkedInUserToken(projectId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const newToken = data.access_token as string;
    const expiresIn = data.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const db = getDb();
    await db`
      UPDATE social_connections
      SET access_token = ${newToken}, expires_at = ${expiresAt}
      WHERE project_id = ${projectId} AND platform = 'linkedin'
    `;

    return newToken;
  } catch {
    return null;
  }
}

async function postToLinkedIn(content: string, projectId: string): Promise<SocialPostResult> {
  const db = getDb();
  const connections = await db`
    SELECT access_token, refresh_token, account_id, expires_at, metadata FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'linkedin'
    LIMIT 1
  `;

  if (connections.length === 0) {
    return { success: false, error: "LinkedIn not connected" };
  }

  let { access_token } = connections[0];
  const { refresh_token, account_id, expires_at, metadata } = connections[0];

  // Refresh token if expired or expiring within 24 hours
  if (expires_at && new Date(expires_at as string).getTime() < Date.now() + 24 * 60 * 60 * 1000) {
    const newToken = await refreshLinkedInUserToken(projectId, refresh_token as string);
    if (newToken) {
      access_token = newToken;
    } else {
      return { success: false, error: "LinkedIn token expired and refresh failed" };
    }
  }

  // Determine author URN — personal profile or organization page
  const meta = metadata as Record<string, unknown> | null;
  const authorUrn = meta?.postAs === "org" && meta?.orgId
    ? `urn:li:organization:${meta.orgId}`
    : `urn:li:person:${account_id}`;

  try {
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: content,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!response.ok) {
      // On 401, attempt token refresh and retry once
      if (response.status === 401 && refresh_token) {
        const newToken = await refreshLinkedInUserToken(projectId, refresh_token as string);
        if (newToken) {
          const retryResponse = await fetch("https://api.linkedin.com/rest/posts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${newToken}`,
              "Content-Type": "application/json",
              "LinkedIn-Version": "202401",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              author: authorUrn,
              commentary: content,
              visibility: "PUBLIC",
              distribution: {
                feedDistribution: "MAIN_FEED",
                targetEntities: [],
                thirdPartyDistributionChannels: [],
              },
              lifecycleState: "PUBLISHED",
            }),
          });

          if (retryResponse.ok) {
            const postUrn = retryResponse.headers.get("x-restli-id") || "";
            return {
              success: true,
              externalId: postUrn,
              externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : undefined,
            };
          }
        }
      }

      const errorBody = await response.text();
      return { success: false, error: `LinkedIn API error: ${response.status} ${errorBody.slice(0, 200)}` };
    }

    const postUrn = response.headers.get("x-restli-id") || "";
    return {
      success: true,
      externalId: postUrn,
      externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "LinkedIn post failed",
    };
  }
}

async function postToReddit(content: string, projectId: string): Promise<SocialPostResult> {
  const db = getDb();
  const connections = await db`
    SELECT access_token, metadata FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'reddit'
    LIMIT 1
  `;

  if (connections.length === 0) {
    return { success: false, error: "Reddit not connected" };
  }

  const { access_token, metadata } = connections[0];
  const subreddit = (metadata as Record<string, unknown>)?.default_subreddit as string;

  if (!subreddit) {
    return { success: false, error: "No default subreddit configured" };
  }

  try {
    // Extract title (first line) and body (rest) from content
    const lines = content.split("\n");
    const title = lines[0].slice(0, 300);
    const body = lines.slice(1).join("\n").trim();

    const response = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Artha/1.0",
      },
      body: new URLSearchParams({
        sr: subreddit,
        kind: body ? "self" : "link",
        title,
        text: body || "",
        resubmit: "true",
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Reddit API error: ${response.status}` };
    }

    const data = await response.json();
    const postUrl = data?.json?.data?.url;
    return {
      success: true,
      externalId: data?.json?.data?.id,
      externalUrl: postUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Reddit post failed",
    };
  }
}

/**
 * Get stored social connection credentials for a project + platform.
 */
export async function getSocialConnection(
  projectId: string,
  platform: string
): Promise<SocialCredentials | null> {
  const db = getDb();
  const rows = await db`
    SELECT access_token, refresh_token, account_id, metadata
    FROM social_connections
    WHERE project_id = ${projectId} AND platform = ${platform}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    accessToken: rows[0].access_token as string,
    refreshToken: rows[0].refresh_token as string | undefined,
    accountId: rows[0].account_id as string | undefined,
    metadata: rows[0].metadata as Record<string, unknown> | undefined,
  };
}
