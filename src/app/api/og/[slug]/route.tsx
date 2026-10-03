import { ImageResponse } from "next/og";
import { getDb } from "@/lib/neon";

export const runtime = "edge";

interface BuildSummary {
  buildDurationSeconds?: number;
  competitorsFound?: number;
  tasksQueued?: number;
  tagline?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const db = getDb();
  const rows = await db`
    SELECT p.name, p.slug, p.memory, cp.tagline
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.slug = ${slug} AND p.status = 'active'
    LIMIT 1
  `;

  if (rows.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const project = rows[0];
  const memory = (project.memory as Record<string, unknown>) || {};
  const buildSummary = (memory.buildSummary as BuildSummary) || {};
  const tagline = (project.tagline as string) || buildSummary.tagline || "";
  const duration = buildSummary.buildDurationSeconds
    ? `${Math.round(buildSummary.buildDurationSeconds)}s`
    : "< 60s";
  const competitors = String(buildSummary.competitorsFound ?? 0);
  const tasks = String(buildSummary.tasksQueued ?? 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          flexDirection: "column",
          background: "#000",
          color: "#fff",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle gradient accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #f59e0b, #8b5cf6, #06b6d4)",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 80px",
            flex: 1,
          }}
        >
          {/* "Built with Artha" badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#22c55e",
              }}
            />
            <span
              style={{
                fontSize: "18px",
                color: "rgba(255,255,255,0.6)",
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
              }}
            >
              Built with Artha
            </span>
          </div>

          {/* Company name */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: "16px",
            }}
          >
            {project.name as string}
          </div>

          {/* Tagline */}
          {tagline && (
            <div
              style={{
                fontSize: "24px",
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.4,
                maxWidth: "700px",
              }}
            >
              {tagline}
            </div>
          )}
        </div>

        {/* Stats bar at bottom */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "32px 80px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ display: "flex", gap: "48px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: 700,
                  color: "#f59e0b",
                }}
              >
                {duration}
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Build time
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: 700,
                  color: "#8b5cf6",
                }}
              >
                {competitors}
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Competitors found
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: 700,
                  color: "#06b6d4",
                }}
              >
                {tasks}
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Tasks queued
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "20px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            artha.run
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
