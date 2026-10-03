import { BskyAgent, RichText, AppBskyFeedDefs, AppBskyFeedPost } from "@atproto/api";

// ── Config ───────────────────────────────────────────────────────────

function getBlueskyCredentials() {
  const identifier = process.env.BLUESKY_IDENTIFIER?.trim();
  const password = process.env.BLUESKY_APP_PASSWORD?.trim();
  return { identifier, password };
}

export function isBlueskyConfigured(): boolean {
  const { identifier, password } = getBlueskyCredentials();
  return Boolean(identifier && password);
}

async function getBlueskyAgent(): Promise<BskyAgent> {
  const { identifier, password } = getBlueskyCredentials();
  if (!identifier || !password) {
    throw new Error("Bluesky not configured. Set BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD.");
  }

  const agent = new BskyAgent({ service: "https://bsky.social" });
  await agent.login({ identifier, password });
  return agent;
}

// ── Posting ──────────────────────────────────────────────────────────

export interface BlueskyPost {
  uri: string;
  cid: string;
  postUrl: string;
}

function buildPostUrl(handle: string, uri: string): string {
  // uri format: at://did:plc:xxx/app.bsky.feed.post/rkey
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

/**
 * Post a single text post to Bluesky with auto-detected links/mentions.
 */
export async function postToBluesky(options: { text: string }): Promise<BlueskyPost> {
  const agent = await getBlueskyAgent();

  const rt = new RichText({ text: options.text });
  await rt.detectFacets(agent);

  const response = await agent.post({
    text: rt.text,
    facets: rt.facets,
  });

  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";
  return {
    uri: response.uri,
    cid: response.cid,
    postUrl: buildPostUrl(handle, response.uri),
  };
}

/**
 * Post a text post with an image to Bluesky.
 */
export async function postToBlueskyWithMedia(options: {
  text: string;
  media: Buffer;
  mimeType?: string;
  alt?: string;
}): Promise<BlueskyPost> {
  const agent = await getBlueskyAgent();

  const uploadResponse = await agent.uploadBlob(options.media, {
    encoding: options.mimeType || "image/png",
  });

  const rt = new RichText({ text: options.text });
  await rt.detectFacets(agent);

  const response = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: options.alt || "Screenshot of a company built with Artha",
          image: uploadResponse.data.blob,
        },
      ],
    },
  });

  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";
  return {
    uri: response.uri,
    cid: response.cid,
    postUrl: buildPostUrl(handle, response.uri),
  };
}

/**
 * Post a text post with a video to Bluesky.
 * Bluesky limit: 50MB, 60 seconds.
 */
export async function postToBlueskyWithVideo(options: {
  text: string;
  videoBuffer: Buffer;
  alt?: string;
}): Promise<BlueskyPost> {
  const agent = await getBlueskyAgent();

  const uploadResponse = await agent.uploadBlob(options.videoBuffer, {
    encoding: "video/mp4",
  });

  const rt = new RichText({ text: options.text });
  await rt.detectFacets(agent);

  const response = await agent.post({
    text: rt.text,
    facets: rt.facets,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embed: {
      $type: "app.bsky.embed.video",
      video: uploadResponse.data.blob,
      alt: options.alt || "Video from Artha",
    } as any,
  });

  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";
  return {
    uri: response.uri,
    cid: response.cid,
    postUrl: buildPostUrl(handle, response.uri),
  };
}

/**
 * Post a thread (multiple posts chained via replies) to Bluesky.
 */
export async function postThreadToBluesky(
  posts: Array<{ text: string; media?: Buffer; mimeType?: string }>
): Promise<BlueskyPost[]> {
  if (posts.length === 0) throw new Error("Thread must have at least one post");

  const agent = await getBlueskyAgent();
  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";
  const results: BlueskyPost[] = [];

  let parentRef: { uri: string; cid: string } | undefined;
  let rootRef: { uri: string; cid: string } | undefined;

  for (const post of posts) {
    const rt = new RichText({ text: post.text });
    await rt.detectFacets(agent);

    let embed: Record<string, unknown> | undefined;
    if (post.media) {
      const uploadResponse = await agent.uploadBlob(post.media, {
        encoding: post.mimeType || "image/png",
      });
      embed = {
        $type: "app.bsky.embed.images",
        images: [
          {
            alt: "Screenshot",
            image: uploadResponse.data.blob,
          },
        ],
      };
    }

    const record: Record<string, unknown> = {
      text: rt.text,
      facets: rt.facets,
    };

    if (embed) {
      record.embed = embed;
    }

    if (parentRef && rootRef) {
      record.reply = {
        root: { uri: rootRef.uri, cid: rootRef.cid },
        parent: { uri: parentRef.uri, cid: parentRef.cid },
      };
    }

    const response = await agent.post(record);

    if (!rootRef) {
      rootRef = { uri: response.uri, cid: response.cid };
    }
    parentRef = { uri: response.uri, cid: response.cid };

    results.push({
      uri: response.uri,
      cid: response.cid,
      postUrl: buildPostUrl(handle, response.uri),
    });
  }

  return results;
}

// ── Search (for outbound engagement engine) ─────────────────────────

export interface BlueskySearchResult {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  text: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  postUrl: string;
  createdAt: string;
}

/**
 * Search Bluesky posts by query. Uses app.bsky.feed.searchPosts.
 */
export async function searchBlueskyPosts(
  query: string,
  limit = 20
): Promise<BlueskySearchResult[]> {
  const agent = await getBlueskyAgent();
  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";

  const response = await agent.app.bsky.feed.searchPosts({
    q: query,
    limit: Math.min(limit, 100),
    sort: "latest",
  });

  if (!response.data.posts) return [];

  return response.data.posts.map((post) => {
    const record = post.record as AppBskyFeedPost.Record;
    return {
      uri: post.uri,
      cid: post.cid,
      authorDid: post.author.did,
      authorHandle: post.author.handle,
      text: record.text || "",
      likeCount: post.likeCount ?? 0,
      replyCount: post.replyCount ?? 0,
      repostCount: post.repostCount ?? 0,
      postUrl: buildPostUrl(post.author.handle, post.uri),
      createdAt: record.createdAt || post.indexedAt,
    };
  });
}

// ── Reply fetching & posting (for auto-reply engine) ─────────────────

export interface BlueskyReply {
  id: string;       // post uri (unique identifier)
  text: string;
  authorId: string;  // DID
  authorUsername: string; // handle
  authorVerified: boolean;
  createdAt: string;
}

/**
 * Fetch replies to a Bluesky post. Filters out our own account.
 */
export async function fetchRepliesToBlueskyPost(postUri: string): Promise<BlueskyReply[]> {
  const agent = await getBlueskyAgent();
  const ourDid = agent.session?.did;

  const thread = await agent.getPostThread({ uri: postUri, depth: 1 });

  const replies: BlueskyReply[] = [];

  if (!AppBskyFeedDefs.isThreadViewPost(thread.data.thread)) return replies;

  const threadReplies = thread.data.thread.replies || [];
  for (const reply of threadReplies) {
    if (!AppBskyFeedDefs.isThreadViewPost(reply)) continue;

    const post = reply.post;
    const author = post.author;

    // Skip our own replies
    if (author.did === ourDid) continue;

    const record = post.record as AppBskyFeedPost.Record;

    replies.push({
      id: post.uri,
      text: record.text || "",
      authorId: author.did,
      authorUsername: author.handle,
      authorVerified: false, // Bluesky doesn't have verification in the same way
      createdAt: record.createdAt || post.indexedAt,
    });
  }

  return replies;
}

/**
 * Reply to a Bluesky post.
 */
export async function replyToBlueskyPost(options: {
  text: string;
  parentUri: string;
  parentCid: string;
  rootUri?: string;
  rootCid?: string;
}): Promise<BlueskyPost> {
  const agent = await getBlueskyAgent();

  const rt = new RichText({ text: options.text });
  await rt.detectFacets(agent);

  const rootUri = options.rootUri || options.parentUri;
  const rootCid = options.rootCid || options.parentCid;

  const response = await agent.post({
    text: rt.text,
    facets: rt.facets,
    reply: {
      root: { uri: rootUri, cid: rootCid },
      parent: { uri: options.parentUri, cid: options.parentCid },
    },
  });

  const handle = agent.session?.handle || getBlueskyCredentials().identifier || "unknown";
  return {
    uri: response.uri,
    cid: response.cid,
    postUrl: buildPostUrl(handle, response.uri),
  };
}

/**
 * Get the CID for a Bluesky post (needed for reply references).
 */
export async function getBlueskyPostCid(postUri: string): Promise<string> {
  const agent = await getBlueskyAgent();
  const thread = await agent.getPostThread({ uri: postUri, depth: 0 });

  if (!AppBskyFeedDefs.isThreadViewPost(thread.data.thread)) {
    throw new Error(`Could not fetch post: ${postUri}`);
  }

  return thread.data.thread.post.cid;
}
