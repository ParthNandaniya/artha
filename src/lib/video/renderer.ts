import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

export interface RenderVideoOptions {
  /** Path to the HTML template file */
  templatePath: string;
  /** Width in pixels (default: 1920) */
  width?: number;
  /** Height in pixels (default: 1080) */
  height?: number;
  /** Total animation duration in milliseconds */
  durationMs: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Output MP4 file path */
  outputPath: string;
}

export interface RenderResult {
  filePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  frameCount: number;
}

function getFfmpegPath(): string {
  // Try ffmpeg-static first (devDependency)
  try {
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // Not installed
  }

  // Fall back to system ffmpeg
  try {
    execSync("which ffmpeg", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    throw new Error(
      "ffmpeg not found. Install ffmpeg-static (npm i -D ffmpeg-static) or install ffmpeg on your system."
    );
  }
}

export async function renderVideo(options: RenderVideoOptions): Promise<RenderResult> {
  const {
    templatePath,
    width = 1920,
    height = 1080,
    durationMs,
    fps = 30,
    outputPath,
  } = options;

  const absoluteTemplatePath = resolve(templatePath);
  if (!existsSync(absoluteTemplatePath)) {
    throw new Error(`Template not found: ${absoluteTemplatePath}`);
  }

  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  const frameIntervalMs = 1000 / fps;

  // Create temp directory for frames
  const framesDir = join(tmpdir(), `artha-video-${Date.now()}`);
  mkdirSync(framesDir, { recursive: true });

  // Ensure output directory exists
  const outputDir = resolve(outputPath, "..");
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width, height } });

    // Load the template
    await page.goto(`file://${absoluteTemplatePath}`, { waitUntil: "networkidle" });

    // Pause all animations at the start
    await page.evaluate(() => {
      document.documentElement.getAnimations({ subtree: true }).forEach((anim) => {
        anim.pause();
      });
    });

    // Capture each frame
    console.log(`Capturing ${totalFrames} frames at ${fps}fps (${durationMs}ms)...`);

    for (let i = 0; i < totalFrames; i++) {
      const currentTimeMs = i * frameIntervalMs;

      // Set all animations to the current time
      await page.evaluate((timeMs) => {
        document.documentElement.getAnimations({ subtree: true }).forEach((anim) => {
          anim.currentTime = timeMs;
        });
      }, currentTimeMs);

      // Small wait for rendering
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

      const framePath = join(framesDir, `frame_${String(i).padStart(5, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png" });

      if ((i + 1) % 30 === 0 || i === totalFrames - 1) {
        console.log(`  Frame ${i + 1}/${totalFrames}`);
      }
    }

    console.log("Encoding MP4 with ffmpeg...");

    const ffmpeg = getFfmpegPath();
    const absoluteOutput = resolve(outputPath);

    execSync(
      [
        ffmpeg,
        "-y",
        `-framerate ${fps}`,
        `-i "${join(framesDir, "frame_%05d.png")}"`,
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-pix_fmt yuv420p",
        // Ensure dimensions are even (required by H.264)
        `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`,
        `"${absoluteOutput}"`,
      ].join(" "),
      { stdio: "inherit" }
    );

    const { statSync } = await import("fs");
    const stats = statSync(absoluteOutput);

    return {
      filePath: absoluteOutput,
      fileSizeBytes: stats.size,
      durationSeconds: durationMs / 1000,
      frameCount: totalFrames,
    };
  } finally {
    await browser.close();
    // Clean up temp frames
    rmSync(framesDir, { recursive: true, force: true });
  }
}
