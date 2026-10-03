import { NextResponse } from "next/server";

export function GET(request: Request) {
  const companyDomain =
    process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";

  // Try to extract the company slug from the Host header
  const host = request.headers.get("host") || "";
  const slug = host.replace(`.${companyDomain}`, "").split(".")[0];
  const isCompanySite = host.endsWith(`.${companyDomain}`) && slug && slug !== "www";

  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
    // Per-site sitemap if served from a company subdomain
    ...(isCompanySite
      ? [`Sitemap: https://${slug}.${companyDomain}/sitemap.xml`]
      : [
          `Sitemap: https://${companyDomain}/sitemap.xml`,
          `Sitemap: ${appUrl}/sitemap.xml`,
        ]),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
