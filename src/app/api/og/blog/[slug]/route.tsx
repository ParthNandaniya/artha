import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return new Response("Not found", { status: 404 });
  }

  // If there's a cover image, redirect to it
  if (post.coverImageUrl) {
    return Response.redirect(post.coverImageUrl, 302);
  }

  // Generate a branded OG card on the fly
  const titleSize = post.title.length > 80 ? 40 : post.title.length > 50 ? 48 : 56;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px",
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header: Artha logo + Blog badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
            >
              <g stroke="#F8FAFC" strokeWidth="3" strokeLinecap="round">
                <line x1="6" y1="42" x2="24" y2="4" />
                <line x1="24" y1="4" x2="42" y2="42" />
                <line x1="6" y1="42" x2="33" y2="23" />
                <line x1="42" y1="42" x2="15" y2="23" />
              </g>
              <circle cx="6" cy="42" r="4" fill="#F8FAFC" />
              <circle cx="24" cy="4" r="4" fill="#F8FAFC" />
              <circle cx="42" cy="42" r="4" fill="#F8FAFC" />
            </svg>
            <span
              style={{
                color: "#F8FAFC",
                fontSize: "32px",
                fontWeight: 700,
              }}
            >
              Artha
            </span>
          </div>
          <div
            style={{
              background: "#38BDF8",
              color: "#0F172A",
              fontSize: "16px",
              fontWeight: 700,
              padding: "6px 18px",
              borderRadius: "20px",
              textTransform: "uppercase" as const,
              letterSpacing: "1px",
            }}
          >
            Blog
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 0",
          }}
        >
          <div
            style={{
              color: "#F8FAFC",
              fontSize: `${titleSize}px`,
              fontWeight: 700,
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            {post.title}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "#94A3B8",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            artha.run
          </span>
          <span
            style={{
              color: "#94A3B8",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            @tryarthaHQ
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
