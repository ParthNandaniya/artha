import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const size = { width: 1200, height: 675 };

async function loadSyneFont() {
  const res = await fetch(
    "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap"
  );
  const css = await res.text();
  const match = css.match(/src: url\((.+?)\) format\('woff2'\)/);
  if (!match?.[1]) return null;
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const text = searchParams.get("text");
  const badge = searchParams.get("badge");

  if (!text) {
    return new Response("Missing ?text= parameter", { status: 400 });
  }

  let syneFont: ArrayBuffer | null = null;
  try {
    syneFont = await loadSyneFont();
  } catch {
    // Fall back to system font if fetch fails
  }

  const fontSize = text.length > 160 ? 36 : text.length > 100 ? 42 : 48;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          padding: "48px 60px",
          fontFamily: syneFont ? "Syne, system-ui" : "system-ui, sans-serif",
          border: "1px solid #e4e4e7",
        }}
      >
        {/* Header: logo + badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Logo + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg
              width="42"
              height="42"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round">
                <line x1="6" y1="42" x2="24" y2="4" />
                <line x1="24" y1="4" x2="42" y2="42" />
                <line x1="6" y1="42" x2="33" y2="23" />
                <line x1="42" y1="42" x2="15" y2="23" />
              </g>
              <circle cx="6" cy="42" r="4" fill="#0a0a0a" />
              <circle cx="24" cy="4" r="4" fill="#0a0a0a" />
              <circle cx="42" cy="42" r="4" fill="#0a0a0a" />
            </svg>
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.02em",
              }}
            >
              Artha
            </span>
          </div>

          {/* Badge */}
          {badge && (
            <div
              style={{
                display: "flex",
                backgroundColor: "#0a0a0a",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 700,
                padding: "8px 20px",
                borderRadius: 20,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
              }}
            >
              {badge}
            </div>
          )}
        </div>

        {/* Main text — centered */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "0 20px",
          }}
        >
          <div
            style={{
              fontSize,
              fontWeight: 800,
              color: "#0a0a0a",
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              textAlign: "center",
              maxWidth: 960,
            }}
          >
            {text}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <span style={{ fontSize: 22, color: "#52525b", fontWeight: 600 }}>artha.run</span>
          <span style={{ fontSize: 22, color: "#52525b", fontWeight: 600 }}>@tryarthaHQ</span>
        </div>
      </div>
    ),
    {
      ...size,
      ...(syneFont
        ? {
            fonts: [
              {
                name: "Syne",
                data: syneFont,
                style: "normal" as const,
                weight: 800 as const,
              },
            ],
          }
        : {}),
    }
  );
}
