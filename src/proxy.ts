import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "artha_session";
const CANONICAL_HOST = "artha.run";

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const { pathname, search } = request.nextUrl;
  const isApiPath = pathname.startsWith("/api/");
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "artha.run";
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

  // ── SEO: www → canonical redirect ──────────────────────────────────
  if (hostname === `www.${CANONICAL_HOST}`) {
    return NextResponse.redirect(
      new URL(`https://${CANONICAL_HOST}${pathname}${search}`),
      301,
    );
  }

  // ── SEO: strip tracking params to avoid duplicate-URL issues ───────
  const url = request.nextUrl.clone();
  const trackingParams = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
  let stripped = false;
  for (const param of trackingParams) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      stripped = true;
    }
  }
  if (stripped && url.searchParams.size === 0) {
    return NextResponse.redirect(
      new URL(`https://${CANONICAL_HOST}${pathname}`),
      301,
    );
  }
  if (stripped) {
    return NextResponse.redirect(url, 301);
  }

  // Serve robots.txt and sitemap.xml for tryartha.com (bare + subdomains)
  const isCompanyDomain =
    hostname === companyDomain ||
    hostname === `www.${companyDomain}` ||
    hostname.endsWith(`.${companyDomain}`);

  if (isCompanyDomain && pathname === "/robots.txt") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/company-robots";
    return NextResponse.rewrite(url);
  }
  if (isCompanyDomain && pathname === "/sitemap.xml") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/sitemap-companies";
    return NextResponse.rewrite(url);
  }

  if (!isApiPath && hostname.endsWith(`.${companyDomain}`) && !hostname.startsWith("www.")) {
    const subdomain = hostname.replace(`.${companyDomain}`, "");
    if (subdomain) {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!isApiPath && hostname.endsWith(`.${appDomain}`) && !hostname.startsWith("www.")) {
    const subdomain = hostname.replace(`.${appDomain}`, "");
    if (subdomain && subdomain !== appDomain) {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|site/|api/stripe/webhook|api/postmark/inbound).*)",
  ],
};
