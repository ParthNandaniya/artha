import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { canPostProjectTweet, getTweetSetupBlockedReason } from "@/lib/project-integrations";
import { getTwitterAccountStatus, postTweet, deleteTweet as deleteTwitterTweet } from "@/lib/twitter";
import { postToBluesky, isBlueskyConfigured } from "@/lib/growth/bluesky";
import { postToLinkedInPlatform, isLinkedInPlatformConfigured } from "@/lib/growth/linkedin";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";

// GET /api/tweets?projectId=... — list all tweets for the company
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const tweets = await db`
      SELECT * FROM tweets WHERE project_id = ${projectId} ORDER BY posted_at DESC
    `;
    return NextResponse.json(tweets);
  } catch {
    return NextResponse.json([]);
  }
}

// DELETE /api/tweets — remove a tweet from the company DB by row ID
export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const tweetId = searchParams.get("id");
  if (!projectId || !tweetId) return NextResponse.json({ error: "Missing projectId or id" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db`SELECT tweet_id FROM tweets WHERE id = ${tweetId} AND project_id = ${projectId} LIMIT 1`;
  if (rows.length === 0) return NextResponse.json({ error: "Tweet not found" }, { status: 404 });

  try {
    await deleteTwitterTweet(rows[0].tweet_id as string);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to delete tweet from X", reason }, { status: 500 });
  }

  await db`DELETE FROM tweets WHERE id = ${tweetId} AND project_id = ${projectId}`;

  return NextResponse.json({ success: true });
}

// POST /api/tweets — compose and post a new tweet from the configured platform X account
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, content } = body as { projectId: string; content: string };

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Tweet content is required" }, { status: 400 });
  if (content.trim().length > 280) return NextResponse.json({ error: "Tweet exceeds 280 characters" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id, name, slug, first_tweet_url, tweet_setup_status, tweet_setup_error
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = projects[0];

  if (!canPostProjectTweet(project)) {
    return NextResponse.json(
      { error: getTweetSetupBlockedReason(project) || "Twitter setup is not ready yet." },
      { status: 409 }
    );
  }

  const twitterStatus = await getTwitterAccountStatus({ validate: true });
  if (!twitterStatus.appConfigured) {
    await db`
      UPDATE projects
      SET tweet_setup_status = 'skipped',
          tweet_setup_error = 'Twitter app credentials are missing.'
      WHERE id = ${projectId}
    `;
    return NextResponse.json({ error: "Twitter is not configured on this server." }, { status: 503 });
  }

  if (!twitterStatus.connected) {
    const reason = twitterStatus.connectionError || "Twitter platform account is not configured.";
    await db`
      UPDATE projects
      SET tweet_setup_status = 'skipped',
          tweet_setup_error = ${reason}
      WHERE id = ${projectId}
    `;
    return NextResponse.json({ error: reason }, { status: 503 });
  }

  // Content moderation — block vulgar, hateful, or inappropriate language
  try {
    const moderation = await generateAgentJSON<{ approved: boolean; reason?: string }>(
      "content_moderation",
      `You are a content moderation system. Check if this tweet is appropriate to post from a professional business account. Reject content with vulgar language, profanity, slurs, hate speech, harassment, explicit sexual content, or threats. Minor informal language and humor are fine. Respond with JSON: { "approved": true } or { "approved": false, "reason": "brief explanation" }.`,
      `Tweet: "${content.trim()}"`,
      { maxTokens: 150, temperature: 0 }
    );
    if (!moderation.approved) {
      return NextResponse.json(
        { error: "Content not appropriate for posting. Please revise your tweet.", reason: moderation.reason, moderation_failed: true },
        { status: 422 }
      );
    }
  } catch {
    // If moderation check fails, don't block — let it through
  }

  try {
    const posted = await postTweet({
      text: content.trim(),
    });

    // Cross-post to Bluesky + LinkedIn (non-blocking, non-fatal)
    if (isBlueskyConfigured()) {
      const bskyText = content.trim().replace(/@tryarthaHQ/g, "@artha.run");
      postToBluesky({ text: bskyText }).catch(() => {});
    }
    if (isLinkedInPlatformConfigured()) {
      postToLinkedInPlatform({ text: content.trim() }).catch(() => {});
    }

    // Save to platform DB
    const rows = await db`
      INSERT INTO tweets (project_id, tweet_id, tweet_url, content, type)
      VALUES (${projectId}, ${posted.tweetId}, ${posted.tweetUrl}, ${content.trim()}, 'custom')
      RETURNING *
    `;

    await db`
      UPDATE projects
      SET tweet_setup_status = 'configured',
          tweet_setup_error = NULL
      WHERE id = ${projectId}
    `;

    return NextResponse.json(rows[0]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db`
      UPDATE projects
      SET tweet_setup_status = 'failed',
          tweet_setup_error = ${reason}
      WHERE id = ${projectId}
    `;
    return NextResponse.json({ error: "Failed to post tweet", reason }, { status: 500 });
  }
}
