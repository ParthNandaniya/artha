import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { postTweet } from "@/lib/twitter";
import { postToChannel } from "@/lib/social/adapter";
import { logAgentActivity } from "@/lib/agent-activity";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const scheduledPosts = await db`
    SELECT cc.*, p.id AS owner_project_id
    FROM content_calendar cc
    JOIN projects p ON p.id = cc.project_id
    WHERE cc.status = 'scheduled' AND cc.scheduled_at <= NOW()
    ORDER BY cc.scheduled_at ASC
  `;

  let posted = 0;
  let failed = 0;

  for (const post of scheduledPosts) {
    try {
      const content = post.content as string;
      const platform = post.platform as string;
      const projectId = post.project_id as string;

      if (platform === "twitter" || platform === "both") {
        // Try company's connected Twitter account first, fall back to platform account
        const companyConnection = await db`
          SELECT access_token FROM social_connections
          WHERE project_id = ${projectId} AND platform = 'twitter'
          LIMIT 1
        `;

        if (companyConnection.length > 0) {
          const result = await postToChannel("twitter", content, projectId);
          if (result.success) {
            await db`
              UPDATE content_calendar
              SET status = 'posted', posted_at = NOW(),
                  external_id = ${result.externalId || null},
                  external_url = ${result.externalUrl || null}
              WHERE id = ${post.id}
            `;
          } else {
            throw new Error(result.error || "Company Twitter post failed");
          }
        } else {
          const result = await postTweet({ text: content });
          await db`
            UPDATE content_calendar
            SET status = 'posted', posted_at = NOW(),
                external_id = ${result.tweetId},
                external_url = ${result.tweetUrl}
            WHERE id = ${post.id}
          `;
        }
      }

      if (platform === "linkedin" || platform === "both") {
        const linkedinResult = await postToChannel("linkedin", content, projectId);
        if (linkedinResult.success) {
          // If this was a linkedin-only post, update status
          if (platform === "linkedin") {
            await db`
              UPDATE content_calendar
              SET status = 'posted', posted_at = NOW(),
                  external_id = ${linkedinResult.externalId || null},
                  external_url = ${linkedinResult.externalUrl || null}
              WHERE id = ${post.id}
            `;
          }
        } else if (platform === "linkedin") {
          throw new Error(linkedinResult.error || "LinkedIn post failed");
        }
        // For "both" platform, don't fail if LinkedIn fails but Twitter succeeded
      }

      await logAgentActivity({
        projectId,
        agentType: "content_poster",
        action: "completed",
        title: `Posted ${platform} content`,
        description: (content as string).slice(0, 200),
        metadata: { platform, postId: post.id },
      }).catch(() => {});

      posted++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await db`
        UPDATE content_calendar
        SET status = 'failed',
            error_message = ${errorMessage}
        WHERE id = ${post.id}
      `;
      failed++;
    }
  }

  return NextResponse.json({ posted, failed });
}
