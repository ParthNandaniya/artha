import { getDb } from "@/lib/neon";

// ── Config ───────────────────────────────────────────────────────────

const LINKEDIN_API_VERSION = "202401";

function getPlatformCredentials() {
  const accessToken = process.env.LINKEDIN_PLATFORM_ACCESS_TOKEN?.trim();
  const refreshToken = process.env.LINKEDIN_PLATFORM_REFRESH_TOKEN?.trim();
  const personId = process.env.LINKEDIN_PLATFORM_PERSON_ID?.trim();
  return { accessToken, refreshToken, personId };
}

export function isLinkedInPlatformConfigured(): boolean {
  const { accessToken, personId } = getPlatformCredentials();
  return Boolean(accessToken && personId);
}

/**
 * Get the current access token, checking platform_settings first (for refreshed tokens)
 * then falling back to the env var.
 */
async function getAccessToken(): Promise<string> {
  const db = getDb();
  const rows = await db`
    SELECT value FROM platform_settings WHERE key = 'linkedin:platform:access_token'
  `;
  if (rows.length > 0 && rows[0].value) {
    return rows[0].value as string;
  }
  const { accessToken } = getPlatformCredentials();
  if (!accessToken) throw new Error("LinkedIn platform access token not configured");
  return accessToken;
}

function getPersonId(): string {
  const { personId } = getPlatformCredentials();
  if (!personId) throw new Error("LinkedIn platform person ID not configured. Set LINKEDIN_PLATFORM_PERSON_ID.");
  return personId;
}

/**
 * Refresh the platform access token using the refresh token.
 * Persists the new token to platform_settings so subsequent calls use it.
 */
async function refreshPlatformToken(): Promise<string> {
  const { refreshToken } = getPlatformCredentials();
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Cannot refresh LinkedIn token — missing LINKEDIN_PLATFORM_REFRESH_TOKEN, LINKEDIN_CLIENT_ID, or LINKEDIN_CLIENT_SECRET");
  }

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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LinkedIn token refresh failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const newToken = data.access_token as string;

  // Persist to platform_settings
  const db = getDb();
  await db`
    INSERT INTO platform_settings (key, value)
    VALUES ('linkedin:platform:access_token', ${newToken})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  return newToken;
}

// ── API helper with auto-retry on 401 ────────────────────────────────

async function callLinkedInAPI(
  url: string,
  options: RequestInit,
  retried = false
): Promise<Response> {
  const token = await getAccessToken();
  // Merge caller headers (e.g. Content-Type) under our auth/version headers
  const callerHeaders = (options.headers as Record<string, string>) || {};
  const headers: Record<string, string> = {
    ...callerHeaders,
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !retried) {
    console.log("[linkedin] Access token expired, attempting refresh...");
    try {
      const newToken = await refreshPlatformToken();
      headers.Authorization = `Bearer ${newToken}`;
      return fetch(url, { ...options, headers });
    } catch (err) {
      console.error("[linkedin] Token refresh failed:", err instanceof Error ? err.message : String(err));
      throw new Error("LinkedIn authentication failed and token refresh failed");
    }
  }

  return response;
}

// ── Posting ──────────────────────────────────────────────────────────

export interface LinkedInPost {
  postUrn: string;
  postUrl: string;
}

/**
 * Post a text post to LinkedIn using the platform account.
 */
export async function postToLinkedInPlatform(options: { text: string }): Promise<LinkedInPost> {
  const personId = getPersonId();
  const authorUrn = `urn:li:person:${personId}`;

  const response = await callLinkedInAPI("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author: authorUrn,
      commentary: options.text,
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
    const body = await response.text();
    throw new Error(`LinkedIn post failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const postUrn = response.headers.get("x-restli-id") || "";
  return {
    postUrn,
    postUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "",
  };
}

/**
 * Post a text post with an image to LinkedIn using the platform account.
 * LinkedIn requires a two-step image upload: initialize → upload binary → post.
 */
export async function postToLinkedInPlatformWithMedia(options: {
  text: string;
  media: Buffer;
  mimeType?: string;
}): Promise<LinkedInPost> {
  const personId = getPersonId();
  const authorUrn = `urn:li:person:${personId}`;

  // Step 1: Initialize image upload
  const initResponse = await callLinkedInAPI(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    }
  );

  if (!initResponse.ok) {
    const body = await initResponse.text();
    throw new Error(`LinkedIn image upload init failed: ${initResponse.status} ${body.slice(0, 200)}`);
  }

  const initData = await initResponse.json();
  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image upload init returned no uploadUrl or image URN");
  }

  // Step 2: Upload the binary image
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": options.mimeType || "image/png",
    },
    body: new Uint8Array(options.media),
  });

  if (!uploadResponse.ok) {
    throw new Error(`LinkedIn image binary upload failed: ${uploadResponse.status}`);
  }

  // Step 3: Create post with the image
  const postResponse = await callLinkedInAPI("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author: authorUrn,
      commentary: options.text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      content: {
        media: {
          title: "Image",
          id: imageUrn,
        },
      },
    }),
  });

  if (!postResponse.ok) {
    const body = await postResponse.text();
    throw new Error(`LinkedIn post with image failed: ${postResponse.status} ${body.slice(0, 200)}`);
  }

  const postUrn = postResponse.headers.get("x-restli-id") || "";
  return {
    postUrn,
    postUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "",
  };
}

/**
 * Post a text post with a video to LinkedIn using the platform account.
 * LinkedIn requires: register video upload → upload binary → create post.
 * Limit: 200MB, 10 minutes.
 */
export async function postToLinkedInPlatformWithVideo(options: {
  text: string;
  videoBuffer: Buffer;
}): Promise<LinkedInPost> {
  const personId = getPersonId();
  const authorUrn = `urn:li:person:${personId}`;

  // Step 1: Initialize video upload
  const initResponse = await callLinkedInAPI(
    "https://api.linkedin.com/rest/videos?action=initializeUpload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes: options.videoBuffer.length,
          uploadCausalIph: "MEMBER_SHARE",
          uploadProtocol: "SINGLE_REQUEST_UPLOAD",
        },
      }),
    }
  );

  if (!initResponse.ok) {
    const body = await initResponse.text();
    throw new Error(`LinkedIn video upload init failed: ${initResponse.status} ${body.slice(0, 200)}`);
  }

  const initData = await initResponse.json();
  const uploadUrl = initData.value?.uploadUrl;
  const videoUrn = initData.value?.video;

  if (!uploadUrl || !videoUrn) {
    throw new Error("LinkedIn video upload init returned no uploadUrl or video URN");
  }

  // Step 2: Upload the video binary
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
    },
    body: new Uint8Array(options.videoBuffer),
  });

  if (!uploadResponse.ok) {
    throw new Error(`LinkedIn video binary upload failed: ${uploadResponse.status}`);
  }

  // Step 3: Create post with the video
  const postResponse = await callLinkedInAPI("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author: authorUrn,
      commentary: options.text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      content: {
        media: {
          title: "Video",
          id: videoUrn,
        },
      },
    }),
  });

  if (!postResponse.ok) {
    const body = await postResponse.text();
    throw new Error(`LinkedIn post with video failed: ${postResponse.status} ${body.slice(0, 200)}`);
  }

  const postUrn = postResponse.headers.get("x-restli-id") || "";
  return {
    postUrn,
    postUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "",
  };
}
