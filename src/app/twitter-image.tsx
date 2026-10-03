import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Artha — Build an AI-powered company that runs 24/7";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo mark */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
            <line x1="6" y1="42" x2="24" y2="4" />
            <line x1="24" y1="4" x2="42" y2="42" />
            <line x1="6" y1="42" x2="33" y2="23" />
            <line x1="42" y1="42" x2="15" y2="23" />
          </g>
          <circle cx="6" cy="42" r="4" fill="#ffffff" />
          <circle cx="24" cy="4" r="4" fill="#ffffff" />
          <circle cx="42" cy="42" r="4" fill="#ffffff" />
        </svg>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 800,
            color: "#ffffff",
            marginTop: 24,
            letterSpacing: "-0.02em",
          }}
        >
          Artha
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 12,
            maxWidth: 800,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Your company. Run by Agents. Launched in 3 minutes.
        </div>

        {/* URL */}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#3b82f6",
            marginTop: 32,
          }}
        >
          artha.run
        </div>
      </div>
    ),
    { ...size },
  );
}
