import { NextRequest, NextResponse } from "next/server";

/**
 * Short link redirect: artha.run/s/SLUG → TrustMRR startup page.
 * Used in founder story tweets to save character space.
 *
 * Pattern:
 *   /s/trustmrr-kibu       → https://trustmrr.com/startup/kibu
 *   /s/ih-some-product      → https://www.indiehackers.com/product/some-product
 *   /s/https-example-com    → https://example.com (direct URL encoded as slug)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let destination: string;

  if (slug.startsWith("trustmrr-")) {
    // trustmrr-kibu → https://trustmrr.com/startup/kibu
    const startupSlug = slug.slice("trustmrr-".length);
    destination = `https://trustmrr.com/startup/${startupSlug}`;
  } else if (slug.startsWith("ih-")) {
    // ih-some-product → https://www.indiehackers.com/product/some-product
    const productSlug = slug.slice("ih-".length);
    destination = `https://www.indiehackers.com/product/${productSlug}`;
  } else {
    // Fallback: try to reconstruct a URL
    // e.g., slug = "example-com" is ambiguous, so redirect to TrustMRR search
    destination = `https://trustmrr.com/startup/${slug}`;
  }

  return NextResponse.redirect(destination, 302);
}
