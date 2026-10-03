import { TwitterApi } from "twitter-api-v2";
import { getDb } from "./neon";
import type { TwitterAccountStatus } from "./types";

// ── Twitter environment config ───────────────────────────────────────

export type TwitterEnvMode = "production" | "test";

export interface SelectedTwitterEnv {
  mode: TwitterEnvMode;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accountUsername?: string;
  redirectUri?: string;
  scopes?: string;
  names: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accountUsername: string;
    redirectUri: string;
    scopes: string;
  };
}

function getMode(): TwitterEnvMode {
  return process.env.NODE_ENV === "production" ? "production" : "test";
}

function pick(testName: string, prodName: string, mode: TwitterEnvMode) {
  return mode === "production"
    ? process.env[prodName]?.trim()
    : process.env[testName]?.trim() || process.env[prodName]?.trim();
}

export function getSelectedTwitterEnv(): SelectedTwitterEnv {
  const mode = getMode();
  const names =
    mode === "production"
      ? {
          clientId: "TWITTER_CLIENT_ID",
          clientSecret: "TWITTER_CLIENT_SECRET",
          refreshToken: "TWITTER_REFRESH_TOKEN",
          accountUsername: "TWITTER_ACCOUNT_USERNAME",
          redirectUri: "TWITTER_REDIRECT_URI",
          scopes: "TWITTER_OAUTH_SCOPES",
        }
      : {
          clientId: process.env.TWITTER_TEST_CLIENT_ID?.trim() ? "TWITTER_TEST_CLIENT_ID" : "TWITTER_CLIENT_ID",
          clientSecret: process.env.TWITTER_TEST_CLIENT_SECRET?.trim() ? "TWITTER_TEST_CLIENT_SECRET" : "TWITTER_CLIENT_SECRET",
          refreshToken: process.env.TWITTER_TEST_REFRESH_TOKEN?.trim() ? "TWITTER_TEST_REFRESH_TOKEN" : "TWITTER_REFRESH_TOKEN",
          accountUsername: process.env.TWITTER_TEST_ACCOUNT_USERNAME?.trim() ? "TWITTER_TEST_ACCOUNT_USERNAME" : "TWITTER_ACCOUNT_USERNAME",
          redirectUri: process.env.TWITTER_TEST_REDIRECT_URI?.trim() ? "TWITTER_TEST_REDIRECT_URI" : "TWITTER_REDIRECT_URI",
          scopes: process.env.TWITTER_TEST_OAUTH_SCOPES?.trim() ? "TWITTER_TEST_OAUTH_SCOPES" : "TWITTER_OAUTH_SCOPES",
        };

  return {
    mode,
    clientId: pick("TWITTER_TEST_CLIENT_ID", "TWITTER_CLIENT_ID", mode),
    clientSecret: pick("TWITTER_TEST_CLIENT_SECRET", "TWITTER_CLIENT_SECRET", mode),
    refreshToken: pick("TWITTER_TEST_REFRESH_TOKEN", "TWITTER_REFRESH_TOKEN", mode),
    accountUsername: pick("TWITTER_TEST_ACCOUNT_USERNAME", "TWITTER_ACCOUNT_USERNAME", mode),
    redirectUri: pick("TWITTER_TEST_REDIRECT_URI", "TWITTER_REDIRECT_URI", mode),
    scopes: pick("TWITTER_TEST_OAUTH_SCOPES", "TWITTER_OAUTH_SCOPES", mode),
    names,
  };
}

// ── Twitter API ──────────────────────────────────────────────────────

const TWEET_MAX_LENGTH = 280;
const DEFAULT_TWITTER_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
const CONNECTION_STATUS_CACHE_MS = 60_000;

type TwitterRuntimeState = {
  refreshToken: string;
  accountName: string | null;
  connected: boolean | null;
  connectionError: string | null;
  lastValidatedAt: number;
};

const runtimeState: Record<"production" | "test", TwitterRuntimeState> = {
  production: {
    refreshToken: "",
    accountName: null,
    connected: null,
    connectionError: null,
    lastValidatedAt: 0,
  },
  test: {
    refreshToken: "",
    accountName: null,
    connected: null,
    connectionError: null,
    lastValidatedAt: 0,
  },
};

function normalizeUsername(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@/, "");
}

function syncRuntimeState() {
  const selected = getSelectedTwitterEnv();
  const state = runtimeState[selected.mode];
  const envRefreshToken = selected.refreshToken || "";
  const envAccountName = normalizeUsername(selected.accountUsername);

  if (!state.refreshToken && envRefreshToken) {
    state.refreshToken = envRefreshToken;
    state.connected = null;
    state.connectionError = null;
    state.lastValidatedAt = 0;
  }

  if (!state.accountName && envAccountName) {
    state.accountName = envAccountName;
  }

  return { selected, state, envRefreshToken, envAccountName };
}

function getTwitterAppEnv() {
  const selected = getSelectedTwitterEnv();
  if (!selected.clientId || !selected.clientSecret) {
    throw new Error(
      `Missing Twitter OAuth app credentials. Set ${selected.names.clientId} and ${selected.names.clientSecret}.`
    );
  }

  return {
    mode: selected.mode,
    clientId: selected.clientId,
    clientSecret: selected.clientSecret,
  };
}

function getTwitterRequestClient() {
  const { clientId, clientSecret } = getTwitterAppEnv();
  return new TwitterApi({ clientId, clientSecret });
}

/**
 * Returns an OAuth 1.0a client for v1.1 endpoints (media upload).
 * Requires TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET.
 */
function getTwitterV1Client(): TwitterApi | null {
  const apiKey = process.env.TWITTER_API_KEY?.trim();
  const apiSecret = process.env.TWITTER_API_SECRET?.trim();
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET?.trim();

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  });
}

function buildTweetUrl(accountName: string | null, tweetId: string) {
  return accountName
    ? `https://x.com/${accountName}/status/${tweetId}`
    : `https://x.com/i/status/${tweetId}`;
}

function getTwitterConnectionFixMessage() {
  const selected = getSelectedTwitterEnv();
  return `Regenerate ${selected.names.refreshToken} with \`npm run twitter:token\` using the currently configured Twitter app credentials, then restart the app.`;
}

function classifyTwitterAuthError(error: unknown): { error: Error; invalidToken: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  const apiError =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { error?: string; error_description?: string; errors?: Array<{ code?: number; message?: string }> } }).data
      : undefined;
  const errorCode = error && typeof error === "object" && "code" in error ? (error as { code?: number }).code : undefined;
  const apiDescription = apiError?.error_description || "";
  const invalidToken =
    apiError?.error === "invalid_request" ||
    apiError?.error === "invalid_grant" ||
    /token was invalid/i.test(apiDescription) ||
    apiError?.errors?.some((entry) => entry.code === 89 || entry.code === 131) ||
    (errorCode === 401 && /request failed with code 401/i.test(message));

  if (invalidToken) {
    return {
      error: new Error(`Twitter platform refresh token is invalid or expired. ${getTwitterConnectionFixMessage()}`),
      invalidToken: true,
    };
  }

  if (errorCode === 403) {
    return {
      error: new Error(
        "Twitter app permissions are insufficient. Ensure the configured app and token include tweet.write, users.read, and offline.access."
      ),
      invalidToken: false,
    };
  }

  return {
    error: error instanceof Error ? error : new Error(message),
    invalidToken: false,
  };
}

function normalizeTwitterRequestError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = error && typeof error === "object" && "code" in error ? (error as { code?: number }).code : undefined;
  const apiError =
    error && typeof error === "object" && "data" in error
      ? (error as {
          data?: {
            title?: string;
            detail?: string;
            reason?: string;
            required_enrollment?: string;
            registration_url?: string;
            error?: string;
            error_description?: string;
          };
        }).data
      : undefined;

  if (errorCode === 402) {
    return new Error(
      apiError?.detail ||
        "X API billing is blocking write requests. Add credits or review billing/spending limits in the X Developer Console, then retry."
    );
  }

  if (errorCode === 403) {
    const enrollment = apiError?.required_enrollment ? ` Required enrollment: ${apiError.required_enrollment}.` : "";
    const registration = apiError?.registration_url ? ` More info: ${apiError.registration_url}` : "";
    return new Error(
      apiError?.detail ||
        `The X app does not have access to this endpoint.${enrollment}${registration}`.trim()
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function getTwitterPlatformSettingKeys(mode: "production" | "test") {
  return {
    refreshToken: `twitter:${mode}:refresh_token`,
    accountName: `twitter:${mode}:account_name`,
  };
}

async function readPersistedTwitterState(mode: "production" | "test") {
  const keys = getTwitterPlatformSettingKeys(mode);
  const db = getDb();

  try {
    const rows = await db`
      SELECT key, value
      FROM platform_settings
      WHERE key = ${keys.refreshToken} OR key = ${keys.accountName}
    `;

    const persisted = { refreshToken: null as string | null, accountName: null as string | null };
    for (const row of rows as Array<{ key: string; value: string }>) {
      if (row.key === keys.refreshToken) persisted.refreshToken = row.value;
      if (row.key === keys.accountName) persisted.accountName = normalizeUsername(row.value);
    }

    return persisted;
  } catch {
    return { refreshToken: null, accountName: null };
  }
}

async function writePersistedTwitterState(
  mode: "production" | "test",
  values: { refreshToken?: string | null; accountName?: string | null }
) {
  const keys = getTwitterPlatformSettingKeys(mode);
  const db = getDb();

  try {
    if (values.refreshToken) {
      await db`
        INSERT INTO platform_settings (key, value)
        VALUES (${keys.refreshToken}, ${values.refreshToken})
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW()
      `;
    }

    if (values.accountName) {
      await db`
        INSERT INTO platform_settings (key, value)
        VALUES (${keys.accountName}, ${values.accountName})
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW()
      `;
    }
  } catch {
    // Persistence is a best-effort cache. Fall back to env/runtime state if DB storage is unavailable.
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function setDisconnectedState(mode: "production" | "test", message: string) {
  runtimeState[mode].connected = false;
  runtimeState[mode].connectionError = message;
  runtimeState[mode].lastValidatedAt = Date.now();
}

function setConnectedState(mode: "production" | "test") {
  runtimeState[mode].connected = true;
  runtimeState[mode].connectionError = null;
  runtimeState[mode].lastValidatedAt = Date.now();
}

async function getPlatformTwitterClient() {
  const { selected, state, envRefreshToken, envAccountName } = syncRuntimeState();
  const persisted = await readPersistedTwitterState(selected.mode);
  if (!state.accountName && persisted.accountName) {
    state.accountName = persisted.accountName;
  }

  let refreshTokenCandidates = uniqueNonEmpty([state.refreshToken, persisted.refreshToken, envRefreshToken]);
  if (refreshTokenCandidates.length === 0) {
    const message = `Missing Twitter platform refresh token. Set ${selected.names.refreshToken}.`;
    setDisconnectedState(selected.mode, message);
    throw new Error(message);
  }

  let retriedPersistedState = false;
  let lastError: Error | null = null;

  while (refreshTokenCandidates.length > 0) {
    const refreshToken = refreshTokenCandidates.shift()!;

    try {
      const { client, refreshToken: nextRefreshToken } =
        await getTwitterRequestClient().refreshOAuth2Token(refreshToken);

      const resolvedRefreshToken = nextRefreshToken || refreshToken;
      runtimeState[selected.mode].refreshToken = resolvedRefreshToken;

      let accountName = state.accountName ?? persisted.accountName ?? envAccountName;
      if (!accountName) {
        const me = await client.v2.me();
        accountName = normalizeUsername(me.data.username);
      }

      runtimeState[selected.mode].accountName = accountName;
      setConnectedState(selected.mode);
      await writePersistedTwitterState(selected.mode, {
        refreshToken: resolvedRefreshToken,
        accountName,
      });

      return {
        client,
        accountName,
      };
    } catch (error) {
      const classified = classifyTwitterAuthError(error);
      lastError = classified.error;

      if (!classified.invalidToken) {
        setDisconnectedState(selected.mode, classified.error.message);
        throw classified.error;
      }

      if (!retriedPersistedState) {
        retriedPersistedState = true;
        const latestPersisted = await readPersistedTwitterState(selected.mode);
        refreshTokenCandidates = uniqueNonEmpty([
          latestPersisted.refreshToken,
          ...refreshTokenCandidates,
        ]);
      }
    }
  }

  const finalError =
    lastError ||
    new Error(`Twitter platform refresh token is invalid or expired. ${getTwitterConnectionFixMessage()}`);
  setDisconnectedState(selected.mode, finalError.message);
  throw finalError;
}

function buildLaunchTweetText(options: {
  companyName: string;
  tagline: string;
  oneLiner: string;
  landingPageUrl: string;
  accountName: string | null;
}): string {
  const { companyName, tagline, oneLiner, landingPageUrl, accountName } = options;
  const header = `Introducing ${companyName} — ${tagline}`;
  const body = `\n\n${oneLiner}`;
  const footer = `\n\n${landingPageUrl}`;
  const attribution = accountName ? `\n\n— @${accountName}` : "";

  const full = header + body + footer + attribution;
  if (full.length <= TWEET_MAX_LENGTH) return full;

  const fixed = header + footer + attribution;
  const available = TWEET_MAX_LENGTH - fixed.length - 4;
  const trimmedBody = available > 20 ? `\n\n${oneLiner.slice(0, available)}…` : "";

  return header + trimmedBody + footer + attribution;
}

export interface PostedTweet {
  tweetId: string;
  tweetUrl: string;
  text: string;
  accountName: string | null;
}

export function isTwitterAppConfigured() {
  const selected = getSelectedTwitterEnv();
  return Boolean(selected.clientId && selected.clientSecret);
}

export function isTwitterPlatformAccountConfigured() {
  const { selected, state } = syncRuntimeState();
  return Boolean(isTwitterAppConfigured() && (state.refreshToken || selected.refreshToken));
}

export function getTwitterOAuthScopes() {
  const selected = getSelectedTwitterEnv();
  const configured = (selected.scopes || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  const scopes = configured.length > 0 ? configured : [...DEFAULT_TWITTER_SCOPES];
  for (const scope of DEFAULT_TWITTER_SCOPES) {
    if (!scopes.includes(scope)) scopes.push(scope);
  }

  return scopes;
}

export async function getTwitterAccountStatus(options?: {
  validate?: boolean;
}): Promise<TwitterAccountStatus> {
  const { selected, state, envAccountName } = syncRuntimeState();
  const persisted = await readPersistedTwitterState(selected.mode);
  if (!state.refreshToken && persisted.refreshToken) {
    state.refreshToken = persisted.refreshToken;
  }
  if (!state.accountName && persisted.accountName) {
    state.accountName = persisted.accountName;
  }
  const appConfigured = isTwitterAppConfigured();
  const hasRefreshToken = Boolean(state.refreshToken || persisted.refreshToken || selected.refreshToken);

  if (options?.validate && appConfigured && hasRefreshToken) {
    const isCacheFresh =
      state.lastValidatedAt > 0 && Date.now() - state.lastValidatedAt < CONNECTION_STATUS_CACHE_MS;

    if (!isCacheFresh) {
      try {
        await getPlatformTwitterClient();
      } catch {
        // getPlatformTwitterClient stores the normalized auth failure in runtime state.
      }
    }
  }

  return {
    appConfigured,
    connected: appConfigured && hasRefreshToken && state.connected !== false,
    accountId: null,
    accountName: state.accountName ?? envAccountName,
    connectionError: state.connectionError,
  };
}

export async function postTweet(options: {
  text: string;
}): Promise<PostedTweet> {
  const text = options.text.trim();
  const { client, accountName } = await getPlatformTwitterClient();
  let data;
  try {
    ({ data } = await client.v2.tweet(text));
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  return {
    tweetId: data.id,
    tweetUrl: buildTweetUrl(accountName, data.id),
    text,
    accountName,
  };
}

export async function postTweetWithMedia(options: {
  text: string;
  media: Buffer;
  mimeType?: string;
}): Promise<PostedTweet> {
  const text = options.text.trim();
  const { client, accountName } = await getPlatformTwitterClient();

  // Media upload requires OAuth 1.0a — use dedicated v1 client if available
  const v1Client = getTwitterV1Client();
  const uploadClient = v1Client || client;

  let mediaId: string;
  try {
    mediaId = await uploadClient.v1.uploadMedia(options.media, {
      mimeType: options.mimeType || "image/png",
    });
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  let data;
  try {
    ({ data } = await client.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    }));
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  return {
    tweetId: data.id,
    tweetUrl: buildTweetUrl(accountName, data.id),
    text,
    accountName,
  };
}

/**
 * Post a tweet with a video (MP4). Uses chunked media upload with async processing.
 * Twitter may take 10-60s to process the video after upload.
 */
export async function postTweetWithVideo(options: {
  text: string;
  videoBuffer: Buffer;
}): Promise<PostedTweet> {
  const text = options.text.trim();
  const { client, accountName } = await getPlatformTwitterClient();

  const v1Client = getTwitterV1Client();
  const uploadClient = v1Client || client;

  let mediaId: string;
  try {
    mediaId = await uploadClient.v1.uploadMedia(options.videoBuffer, {
      mimeType: "video/mp4",
      type: "longvideo",
    });
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  let data;
  try {
    ({ data } = await client.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    }));
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  return {
    tweetId: data.id,
    tweetUrl: buildTweetUrl(accountName, data.id),
    text,
    accountName,
  };
}

export async function postThread(tweets: Array<{
  text: string;
  media?: Buffer;
  mimeType?: string;
}>): Promise<PostedTweet[]> {
  if (tweets.length === 0) throw new Error("Thread must have at least one tweet");

  const { client, accountName } = await getPlatformTwitterClient();
  const v1Client = getTwitterV1Client();
  const uploadClient = v1Client || client;
  const posted: PostedTweet[] = [];

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    const text = tweet.text.trim();

    let mediaId: string | undefined;
    if (tweet.media) {
      try {
        mediaId = await uploadClient.v1.uploadMedia(tweet.media, {
          mimeType: tweet.mimeType || "image/png",
        });
      } catch (error) {
        throw normalizeTwitterRequestError(error);
      }
    }

    const tweetPayload: Record<string, unknown> = {};
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }
    if (i > 0 && posted.length > 0) {
      tweetPayload.reply = { in_reply_to_tweet_id: posted[i - 1].tweetId };
    }

    let data;
    try {
      ({ data } = await client.v2.tweet(text, tweetPayload));
    } catch (error) {
      throw normalizeTwitterRequestError(error);
    }

    posted.push({
      tweetId: data.id,
      tweetUrl: buildTweetUrl(accountName, data.id),
      text,
      accountName,
    });
  }

  return posted;
}

export async function deleteTweet(tweetId: string): Promise<void> {
  const { client } = await getPlatformTwitterClient();
  try {
    await client.v2.deleteTweet(tweetId);
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }
}

export async function replyToTweet(options: {
  text: string;
  inReplyToTweetId: string;
}): Promise<PostedTweet> {
  const text = options.text.trim();
  const { client, accountName } = await getPlatformTwitterClient();
  let data;
  try {
    ({ data } = await client.v2.tweet(text, {
      reply: { in_reply_to_tweet_id: options.inReplyToTweetId },
    }));
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  return {
    tweetId: data.id,
    tweetUrl: buildTweetUrl(accountName, data.id),
    text,
    accountName,
  };
}

async function composeLaunchReplyText(options: {
  companyName: string;
  tagline: string;
  oneLiner: string;
  landingPageUrl: string;
  launchTweetText: string;
}): Promise<string> {
  const { generateAgentJSON } = await import("@/lib/ai/agent-model-router");
  const { companyName, tagline, oneLiner, landingPageUrl, launchTweetText } = options;

  const result = await generateAgentJSON<{ reply: string }>(
    "twitter",
    `You are replying to a launch announcement tweet for a new company. Write a natural, creative follow-up reply that adds color and makes people want to check out the product.

Rules — follow every one:
- This is a REPLY to the launch tweet shown below — read it carefully and continue the thought naturally, don't repeat what it already says
- Share what makes this company interesting: the problem it solves, who it helps, or why it matters right now
- Sound like a real person who's genuinely excited, not a marketing bot
- Be conversational and specific — use details from the description, don't be vague
- Include the website URL naturally (not with "Check it out 👉" or similar cliché CTAs)
- Must be ≤280 characters (hard limit — count carefully)
- No hashtags
- Do NOT start with "More about", "Learn more", "Here's more", or any variation of that pattern
- Do NOT use phrases like "check it out", "take a look", "head over to"
- Vary your style — sometimes lead with the problem, sometimes with the audience, sometimes with a compelling detail

Return JSON with: reply (the reply text, ≤280 chars)`,
    `Launch tweet:\n"${launchTweetText}"\n\nCompany: ${companyName}\nTagline: ${tagline}\nDescription: ${oneLiner}\nWebsite: ${landingPageUrl}`
  );

  let text = result.reply.trim();
  if (text.length > TWEET_MAX_LENGTH) {
    text = text.slice(0, TWEET_MAX_LENGTH - 3) + "...";
  }
  return text;
}

export async function postLaunchTweetReply(options: {
  inReplyToTweetId: string;
  launchTweetText: string;
  companyName: string;
  tagline: string;
  oneLiner: string;
  landingPageUrl: string;
}): Promise<PostedTweet | null> {
  const status = await getTwitterAccountStatus();
  if (!status.appConfigured || !status.connected) {
    return null;
  }

  const text = await composeLaunchReplyText({
    companyName: options.companyName,
    tagline: options.tagline,
    oneLiner: options.oneLiner,
    landingPageUrl: options.landingPageUrl,
    launchTweetText: options.launchTweetText,
  });

  return replyToTweet({ text, inReplyToTweetId: options.inReplyToTweetId });
}

export async function postCompanyLaunchTweet(options: {
  companyName: string;
  tagline: string;
  oneLiner: string;
  landingPageUrl: string;
}): Promise<PostedTweet | null> {
  const status = await getTwitterAccountStatus();
  if (!status.appConfigured || !status.connected) {
    return null;
  }

  const { client, accountName } = await getPlatformTwitterClient();
  const text = buildLaunchTweetText({
    companyName: options.companyName,
    tagline: options.tagline,
    oneLiner: options.oneLiner,
    landingPageUrl: options.landingPageUrl,
    accountName,
  });
  let data;
  try {
    ({ data } = await client.v2.tweet(text));
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }

  return {
    tweetId: data.id,
    tweetUrl: buildTweetUrl(accountName, data.id),
    text,
    accountName,
  };
}

// ── Reply-fetching for auto-reply engine ────────────────────────────

export interface TweetReply {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorVerified: boolean;
  createdAt: string;
}

/** Cached user ID for the authenticated account. */
let cachedUserId: string | null = null;

/**
 * Returns the authenticated Twitter user's ID (cached after first call).
 */
export async function getOurTwitterUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { client } = await getPlatformTwitterClient();
  const me = await client.v2.me();
  cachedUserId = me.data.id;
  return cachedUserId;
}

/**
 * Fetches replies to a specific tweet using conversation_id search.
 * Filters out our own account's tweets. Returns newest first.
 */
export async function fetchRepliesToTweet(tweetId: string): Promise<TweetReply[]> {
  const { client } = await getPlatformTwitterClient();
  const ourUserId = await getOurTwitterUserId();

  try {
    const result = await client.v2.search(`conversation_id:${tweetId} is:reply`, {
      "tweet.fields": ["author_id", "created_at", "text"],
      "user.fields": ["username", "verified"],
      expansions: ["author_id"],
      max_results: 20,
    });

    if (!result.data?.data) return [];

    // Build author lookup from includes
    const authorMap = new Map<string, { username: string; verified: boolean }>();
    if (result.includes?.users) {
      for (const user of result.includes.users) {
        authorMap.set(user.id, {
          username: user.username,
          verified: Boolean(user.verified),
        });
      }
    }

    return result.data.data
      .filter((tweet) => tweet.author_id !== ourUserId) // exclude self
      .map((tweet) => {
        const author = authorMap.get(tweet.author_id || "") ?? { username: "unknown", verified: false };
        return {
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id || "",
          authorUsername: author.username,
          authorVerified: author.verified,
          createdAt: tweet.created_at || new Date().toISOString(),
        };
      });
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }
}

/**
 * Fetches recent mentions of our account. Pass sinceId for incremental polling.
 */
export async function fetchMentions(sinceId?: string): Promise<TweetReply[]> {
  const { client } = await getPlatformTwitterClient();
  const ourUserId = await getOurTwitterUserId();

  try {
    const options: Record<string, unknown> = {
      "tweet.fields": ["author_id", "created_at", "text"],
      "user.fields": ["username", "verified"],
      expansions: ["author_id"],
      max_results: 20,
    };
    if (sinceId) options.since_id = sinceId;

    const result = await client.v2.userMentionTimeline(ourUserId, options);

    if (!result.data?.data) return [];

    const authorMap = new Map<string, { username: string; verified: boolean }>();
    if (result.includes?.users) {
      for (const user of result.includes.users) {
        authorMap.set(user.id, {
          username: user.username,
          verified: Boolean(user.verified),
        });
      }
    }

    return result.data.data
      .filter((tweet) => tweet.author_id !== ourUserId)
      .map((tweet) => {
        const author = authorMap.get(tweet.author_id || "") ?? { username: "unknown", verified: false };
        return {
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id || "",
          authorUsername: author.username,
          authorVerified: author.verified,
          createdAt: tweet.created_at || new Date().toISOString(),
        };
      });
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }
}

// ── Search tweets (for trending discovery) ─────────────────────────

export interface SearchedTweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorVerified: boolean;
  createdAt: string;
  metrics: {
    retweets: number;
    replies: number;
    likes: number;
    impressions: number;
  };
}

/**
 * Search recent tweets using Twitter API v2.
 * Useful for discovering trending topics and viral content.
 */
export async function searchTweets(
  query: string,
  options?: {
    maxResults?: number;
    sortOrder?: "recency" | "relevancy";
  }
): Promise<SearchedTweet[]> {
  const { client } = await getPlatformTwitterClient();
  const maxResults = Math.min(options?.maxResults ?? 20, 100);
  const sortOrder = options?.sortOrder ?? "relevancy";

  try {
    const result = await client.v2.search(query, {
      max_results: maxResults,
      sort_order: sortOrder,
      "tweet.fields": ["created_at", "public_metrics", "author_id"],
      "user.fields": ["username", "verified"],
      expansions: ["author_id"],
    });

    if (!result.data?.data) return [];

    const authorMap = new Map<string, { username: string; verified: boolean }>();
    if (result.includes?.users) {
      for (const user of result.includes.users) {
        authorMap.set(user.id, {
          username: user.username,
          verified: Boolean(user.verified),
        });
      }
    }

    return result.data.data.map((tweet) => {
      const author = authorMap.get(tweet.author_id || "") ?? { username: "unknown", verified: false };
      const metrics = tweet.public_metrics;
      return {
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id || "",
        authorUsername: author.username,
        authorVerified: author.verified,
        createdAt: tweet.created_at || new Date().toISOString(),
        metrics: {
          retweets: metrics?.retweet_count ?? 0,
          replies: metrics?.reply_count ?? 0,
          likes: metrics?.like_count ?? 0,
          impressions: metrics?.impression_count ?? 0,
        },
      };
    });
  } catch (error) {
    throw normalizeTwitterRequestError(error);
  }
}
