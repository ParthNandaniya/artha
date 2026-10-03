import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── CLI argument parsing ─────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, ...valueParts] = arg.slice(2).split("=");
      parsed[key] = valueParts.join("=") || "true";
    }
  }

  return parsed;
}

type Platform = "twitter" | "bluesky" | "linkedin";

async function main() {
  const args = parseArgs();

  const filePath = args.file;
  const platformsStr = args.platforms || "twitter,bluesky,linkedin";
  const caption = args.caption || "";
  const dryRun = args["dry-run"] === "true";

  if (!filePath) {
    console.error("Usage: npm run video:post -- --file=./output/video.mp4 --platforms=twitter,bluesky,linkedin --caption=\"...\"");
    console.error("\nOptions:");
    console.error("  --file         Path to the MP4 file (required)");
    console.error("  --platforms    Comma-separated platforms: twitter,bluesky,linkedin (default: all)");
    console.error("  --caption      Text caption for the post");
    console.error("  --dry-run      Print what would be posted without actually posting");
    process.exit(1);
  }

  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const videoBuffer = readFileSync(absolutePath);
  const platforms = platformsStr.split(",").map((p) => p.trim()) as Platform[];
  const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

  console.log(`\nVideo Post`);
  console.log(`─────────────────────────────────`);
  console.log(`File:       ${absolutePath} (${fileSizeMB} MB)`);
  console.log(`Platforms:  ${platforms.join(", ")}`);
  console.log(`Caption:    ${caption.slice(0, 80)}${caption.length > 80 ? "..." : ""}`);
  console.log(`Dry run:    ${dryRun}`);
  console.log(`─────────────────────────────────\n`);

  if (dryRun) {
    console.log("[dry-run] Would post video to:", platforms.join(", "));
    console.log("[dry-run] Caption:", caption);
    console.log("[dry-run] Done.");
    return;
  }

  const results: { platform: string; url?: string; error?: string }[] = [];

  // Post to each platform
  for (const platform of platforms) {
    console.log(`Posting to ${platform}...`);
    try {
      switch (platform) {
        case "twitter": {
          const { postTweetWithVideo } = await import("../src/lib/twitter");
          const result = await postTweetWithVideo({ text: caption, videoBuffer });
          results.push({ platform, url: result.tweetUrl });
          console.log(`  Twitter: ${result.tweetUrl}`);
          break;
        }
        case "bluesky": {
          const { postToBlueskyWithVideo } = await import("../src/lib/growth/bluesky");
          const result = await postToBlueskyWithVideo({ text: caption, videoBuffer });
          results.push({ platform, url: result.postUrl });
          console.log(`  Bluesky: ${result.postUrl}`);
          break;
        }
        case "linkedin": {
          const { postToLinkedInPlatformWithVideo } = await import("../src/lib/growth/linkedin");
          const result = await postToLinkedInPlatformWithVideo({ text: caption, videoBuffer });
          results.push({ platform, url: result.postUrl });
          console.log(`  LinkedIn: ${result.postUrl}`);
          break;
        }
        default:
          console.log(`  Skipping unknown platform: ${platform}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, error: message });
      console.error(`  ${platform} failed: ${message}`);
    }
  }

  console.log(`\nResults:`);
  for (const r of results) {
    if (r.url) {
      console.log(`  ${r.platform}: ${r.url}`);
    } else {
      console.log(`  ${r.platform}: FAILED - ${r.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Failed to post video:", err);
  process.exit(1);
});
