import { resolve, join } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { renderVideo } from "../src/lib/video/renderer";

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

const TEMPLATES_DIR = resolve(__dirname, "../src/lib/video/templates");
const OUTPUT_DIR = resolve(__dirname, "../output");

async function main() {
  const args = parseArgs();

  const template = args.template || "speed-build";
  const text = args.text || "An AI-powered tutoring platform that adapts to each student's learning style";
  const companyName = args["company-name"] || "EduSpark AI";
  const companySlug = args["company-slug"] || "eduspark-ai";
  const durationStr = args.duration || "16";
  const durationMs = parseFloat(durationStr) * 1000;
  const fps = parseInt(args.fps || "30", 10);
  const width = parseInt(args.width || "1920", 10);
  const height = parseInt(args.height || "1080", 10);

  const templatePath = join(TEMPLATES_DIR, `${template}.html`);

  if (!existsSync(templatePath)) {
    const available = require("fs")
      .readdirSync(TEMPLATES_DIR)
      .filter((f: string) => f.endsWith(".html"))
      .map((f: string) => f.replace(".html", ""));
    console.error(`Template "${template}" not found. Available: ${available.join(", ")}`);
    process.exit(1);
  }

  // Inject data attributes into the template
  const originalHtml = readFileSync(templatePath, "utf-8");
  const injectedHtml = originalHtml.replace(
    "<body>",
    `<body data-idea-text="${text.replace(/"/g, "&quot;")}" data-company-name="${companyName.replace(/"/g, "&quot;")}" data-company-slug="${companySlug.replace(/"/g, "&quot;")}">`
  );

  // Write modified template to a temp file
  const tmpTemplatePath = join(OUTPUT_DIR, `_tmp_${template}.html`);
  writeFileSync(tmpTemplatePath, injectedHtml);

  const outputFilename = `${template}-${Date.now()}.mp4`;
  const outputPath = join(OUTPUT_DIR, outputFilename);

  console.log(`\nVideo Creation`);
  console.log(`─────────────────────────────────`);
  console.log(`Template:     ${template}`);
  console.log(`Idea:         ${text}`);
  console.log(`Company:      ${companyName} (${companySlug})`);
  console.log(`Resolution:   ${width}x${height}`);
  console.log(`Duration:     ${durationMs / 1000}s at ${fps}fps`);
  console.log(`Output:       ${outputPath}`);
  console.log(`─────────────────────────────────\n`);

  try {
    const result = await renderVideo({
      templatePath: tmpTemplatePath,
      width,
      height,
      durationMs,
      fps,
      outputPath,
    });

    console.log(`\nVideo created successfully!`);
    console.log(`  File:     ${result.filePath}`);
    console.log(`  Size:     ${(result.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Duration: ${result.durationSeconds}s`);
    console.log(`  Frames:   ${result.frameCount}`);
  } finally {
    // Clean up temp template
    try {
      require("fs").unlinkSync(tmpTemplatePath);
    } catch {}
  }
}

main().catch((err) => {
  console.error("Failed to create video:", err);
  process.exit(1);
});
