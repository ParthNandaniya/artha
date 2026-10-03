import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@resvg/resvg-js"],
  async headers() {
    // Advertise machine-readable alternates so agents can discover them
    // without parsing HTML. Next.js doesn't merge same-key headers across
    // matching rules — the more specific rule wins — so per-page Link
    // headers must re-include the global describedby/service-desc values.
    const globalAgentLinks = [
      '</llms.txt>; rel="describedby"; type="text/plain"',
      '</llms-full.txt>; rel="describedby"; type="text/markdown"',
      '</agents.json>; rel="service-desc"; type="application/json"',
    ].join(", ");

    const pageLink = (mdPath: string): string =>
      `${globalAgentLinks}, <${mdPath}>; rel="alternate"; type="text/markdown"`;

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "browsing-topics=(), interest-cohort=(), presentation=(), bluetooth=(), usb=(), serial=(), hid=(), window-management=()",
          },
          { key: "Link", value: globalAgentLinks },
          { key: "X-Robots-Tag", value: "index, follow" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Link", value: pageLink("/index.md") }],
      },
      {
        source: "/pricing",
        headers: [{ key: "Link", value: pageLink("/pricing.md") }],
      },
      {
        source: "/privacy",
        headers: [{ key: "Link", value: pageLink("/privacy.md") }],
      },
      {
        source: "/terms",
        headers: [{ key: "Link", value: pageLink("/terms.md") }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/sitemap-companies.xml",
        destination: "/api/sitemap-companies",
      },
      // PostHog reverse proxy — avoids ad blockers
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
