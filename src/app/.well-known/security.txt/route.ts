import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

// RFC 9116 security.txt. The Expires field is required; refreshed yearly.
function nextYearIso(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function GET() {
  const body = [
    "# artha.run security contact — RFC 9116",
    `Contact: mailto:security@artha.run`,
    `Expires: ${nextYearIso()}`,
    `Preferred-Languages: en`,
    `Canonical: https://artha.run/.well-known/security.txt`,
    `Policy: https://artha.run/privacy`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
