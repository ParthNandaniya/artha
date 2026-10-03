import { chromium } from "playwright";

/**
 * Takes a screenshot of a public URL and returns a PNG buffer.
 * Used by the Twitter growth bot to capture company landing pages.
 */
export async function screenshotSite(
  url: string,
  options?: {
    width?: number;
    height?: number;
    waitMs?: number;
  }
): Promise<Buffer> {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 800;
  const waitMs = options?.waitMs ?? 3000;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    const buffer = await page.screenshot({ type: "png" });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
