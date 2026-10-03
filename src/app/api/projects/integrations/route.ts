import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { ensureCompanyEmailAddressReady } from "@/lib/postmark";
import { getTwitterAccountStatus, postCompanyLaunchTweet, postLaunchTweetReply } from "@/lib/twitter";
import { postToBluesky, isBlueskyConfigured } from "@/lib/growth/bluesky";
import { postToLinkedInPlatform, isLinkedInPlatformConfigured } from "@/lib/growth/linkedin";
import { sendCompanyWelcome } from "@/lib/postmark";

type IntegrationAction = "create_email_address" | "post_launch_tweet" | "deploy_cloudflare";

function firstSentence(text: string): string {
  const clean = text.trim();
  if (!clean) return "";
  const [head] = clean.split(/[.!?]\s/);
  const sentence = head ? `${head.trim()}.` : clean;
  return sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, action } = body as { projectId?: string; action?: IntegrationAction };
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, memory, first_tweet_url
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = rows[0] as {
    id: string;
    name: string;
    slug: string;
    memory: Record<string, unknown> | null;
    first_tweet_url: string | null;
  };

  if (action === "create_email_address") {
    const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
    const companyEmail = `${project.slug}@${companyDomain}`;
    const setup = await ensureCompanyEmailAddressReady();

    if (!setup.ok) {
      await db`UPDATE projects SET company_email = NULL WHERE id = ${project.id}`;
      await db`
        UPDATE projects
        SET email_setup_status = ${setup.status},
            email_setup_error = ${setup.reason}
        WHERE id = ${project.id}
      `;
      return NextResponse.json(
        { error: "Email setup unavailable", reason: setup.reason, status: setup.status },
        { status: 503 }
      );
    }

    await db`UPDATE projects SET company_email = ${companyEmail} WHERE id = ${project.id}`;
    await db`
      UPDATE projects
      SET email_setup_status = 'configured',
          email_setup_error = NULL
      WHERE id = ${project.id}
    `;

    try {
      await db`
        INSERT INTO memory (key, value, project_id)
        VALUES ('companyEmail', ${JSON.stringify(companyEmail)}::jsonb, ${projectId})
        ON CONFLICT (key, project_id) DO UPDATE SET value = ${JSON.stringify(companyEmail)}::jsonb
      `;
      await db`
        INSERT INTO memory (key, value, project_id)
        VALUES ('emailConfigured', 'true'::jsonb, ${projectId})
        ON CONFLICT (key, project_id) DO UPDATE SET value = 'true'::jsonb
      `;

      // Resend welcome email since it likely failed during onboarding
      try {
        const queuedTasks = await db`
          SELECT title, description FROM tasks WHERE project_id = ${projectId} AND status = 'queued' ORDER BY priority ASC LIMIT 3
        `;
        const researchDocs = await db`
          SELECT content FROM documents WHERE project_id = ${projectId} AND type = 'market_research' ORDER BY created_at DESC LIMIT 1
        `;
        const researchSummary = researchDocs.length > 0
          ? (researchDocs[0].content as string).split("\n").filter((l: string) => l.trim()).slice(0, 2).join(" ").slice(0, 300)
          : undefined;

        await sendCompanyWelcome({
          slug: project.slug,
          companyName: project.name,
          founderEmail: user.email as string,
          founderName: user.name as string | null,
          researchSummary,
          tweetUrl: project.first_tweet_url || undefined,
          tasks: queuedTasks.map((t: Record<string, unknown>) => ({
            title: t.title as string,
            description: (t.description as string)?.slice(0, 80),
          })),
        });
      } catch (emailErr) {
        console.error("Failed to resend welcome email post-setup", emailErr);
      }
    } catch {
      // Non-fatal for manual setup action.
    }

    return NextResponse.json({ success: true, companyEmail });
  }

  if (action === "deploy_cloudflare") {
    try {
      const { deployProjectWebsite } = await import("@/lib/website");
      const result = await deployProjectWebsite(project.id);
      return NextResponse.json({ success: true, siteUrl: result.liveUrl });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: "Cloudflare deployment failed", reason }, { status: 500 });
    }
  }

  if (project.first_tweet_url) {
    await db`
      UPDATE projects
      SET tweet_setup_status = 'configured',
          tweet_setup_error = NULL
      WHERE id = ${project.id}
    `;
    return NextResponse.json({
      success: true,
      alreadyPosted: true,
      tweetUrl: project.first_tweet_url,
    });
  }

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const landingPageUrl = `https://${project.slug}.${companyDomain}`;
  const projectMemory = project.memory || {};

  let tagline =
    asString(projectMemory.tagline) ||
    asString(projectMemory.mission) ||
    `${project.name} is now live`;
  let oneLiner =
    asString(projectMemory.companyDescription) ||
    `${project.name} just launched on Artha.`;

  try {
    const memRows = await db`
      SELECT key, value FROM memory WHERE project_id = ${projectId} AND key IN ('tagline', 'ideaResearch', 'companyDescription')
    `;

    for (const row of memRows as Array<{ key: string; value: unknown }>) {
      if (row.key === "tagline") {
        tagline = asString(row.value) || tagline;
      }
      if (row.key === "companyDescription") {
        oneLiner = asString(row.value) || oneLiner;
      }
      if (row.key === "ideaResearch" && row.value && typeof row.value === "object") {
        const summary = asString((row.value as Record<string, unknown>).summary);
        if (summary) oneLiner = summary;
      }
    }
  } catch {
    // Non-fatal: use project-level memory fallbacks.
  }

  try {
    const twitterStatus = await getTwitterAccountStatus({ validate: true });
    if (!twitterStatus.appConfigured) {
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = 'Twitter app credentials are missing.'
        WHERE id = ${project.id}
      `;
      return NextResponse.json(
        { error: "Twitter setup unavailable", reason: "Twitter app credentials are missing." },
        { status: 503 }
      );
    }

    if (!twitterStatus.connected) {
      const reason = twitterStatus.connectionError || "Twitter platform account is not configured.";
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = ${reason}
        WHERE id = ${project.id}
      `;
      return NextResponse.json(
        { error: "Twitter setup unavailable", reason },
        { status: 503 }
      );
    }

    const cleanTagline = tagline.replace(/[.!?]+$/, "").trim() || `${project.name} is live`;
    const posted = await postCompanyLaunchTweet({
      companyName: project.name,
      tagline: cleanTagline,
      oneLiner: firstSentence(oneLiner),
      landingPageUrl,
    });

    if (!posted) {
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = 'Twitter platform account is not configured.'
        WHERE id = ${project.id}
      `;
      return NextResponse.json(
        { error: "Twitter setup unavailable", reason: "Twitter platform account is not configured." },
        { status: 503 }
      );
    }

    await db`UPDATE projects SET first_tweet_url = ${posted.tweetUrl} WHERE id = ${project.id}`;
    await db`
      UPDATE projects
      SET tweet_setup_status = 'configured',
          tweet_setup_error = NULL
      WHERE id = ${project.id}
    `;

    try {
      await db`
        INSERT INTO tweets (tweet_id, tweet_url, content, type, project_id)
        VALUES (${posted.tweetId}, ${posted.tweetUrl}, ${posted.text}, 'launch', ${projectId})
      `;
    } catch {
      // Non-fatal: project-level link is already persisted.
    }

    // Cross-post to Bluesky + LinkedIn (non-blocking, non-fatal)
    if (isBlueskyConfigured()) {
      postToBluesky({ text: posted.text }).catch(() => {});
    }
    if (isLinkedInPlatformConfigured()) {
      postToLinkedInPlatform({ text: posted.text }).catch(() => {});
    }

    // Post a reply to the launch tweet with more company details
    let replyTweet = null;
    try {
      const reply = await postLaunchTweetReply({
        inReplyToTweetId: posted.tweetId,
        launchTweetText: posted.text,
        companyName: project.name,
        tagline: cleanTagline,
        oneLiner: firstSentence(oneLiner),
        landingPageUrl,
      });
      if (reply) {
        replyTweet = { tweetId: reply.tweetId, tweetUrl: reply.tweetUrl, text: reply.text };
        await db`
          INSERT INTO tweets (tweet_id, tweet_url, content, type, project_id)
          VALUES (${reply.tweetId}, ${reply.tweetUrl}, ${reply.text}, 'launch', ${projectId})
        `;
      }
    } catch {
      // Non-fatal: the main launch tweet was already posted successfully.
    }

    return NextResponse.json({
      success: true,
      tweetId: posted.tweetId,
      tweetUrl: posted.tweetUrl,
      text: posted.text,
      replyTweet,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db`
      UPDATE projects
      SET tweet_setup_status = 'failed',
          tweet_setup_error = ${reason}
      WHERE id = ${project.id}
    `;
    return NextResponse.json({ error: "Failed to post launch tweet", reason }, { status: 500 });
  }
}
