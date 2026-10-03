import satori from "satori";

/**
 * Generate hero images for landing pages using Satori (SVG → PNG).
 * Uses the same pattern as growth/card-generator.ts but for landing page assets.
 */

interface HeroImageOptions {
  companyName: string;
  tagline: string;
  primaryColor?: string;
  style?: "gradient" | "minimal" | "bold";
  width?: number;
  height?: number;
}

interface FeatureImageOptions {
  title: string;
  description: string;
  icon?: string;
  primaryColor?: string;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

// Inter font (subset for image generation)
let fontData: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const res = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff",
  );
  fontData = await res.arrayBuffer();
  return fontData;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function generateHeroImage(options: HeroImageOptions): Promise<Buffer> {
  const {
    companyName,
    tagline,
    primaryColor = "#2563eb",
    style = "gradient",
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = options;

  const font = await loadFont();

  const backgrounds: Record<string, { background: string }> = {
    gradient: {
      background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.7)} 50%, #111827 100%)`,
    },
    minimal: {
      background: "#ffffff",
    },
    bold: {
      background: `linear-gradient(to bottom right, #111827 0%, ${primaryColor} 100%)`,
    },
  };

  const isLight = style === "minimal";
  const textColor = isLight ? "#111827" : "#ffffff";
  const subtextColor = isLight ? "#6b7280" : "rgba(255,255,255,0.8)";

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px",
          ...backgrounds[style],
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                fontSize: Math.min(72, Math.max(48, 800 / companyName.length)),
                fontWeight: 700,
                color: textColor,
                textAlign: "center",
                lineHeight: 1.1,
                marginBottom: "24px",
              },
              children: companyName,
            },
          },
          {
            type: "div",
            props: {
              style: {
                fontSize: Math.min(32, Math.max(20, 600 / tagline.length)),
                color: subtextColor,
                textAlign: "center",
                lineHeight: 1.4,
                maxWidth: "800px",
              },
              children: tagline,
            },
          },
        ],
      },
    } as any,
    {
      width,
      height,
      fonts: [{ name: "Inter", data: font, weight: 400, style: "normal" }],
    },
  );

  // Convert SVG to PNG using resvg-js if available, otherwise return SVG as buffer
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
    return Buffer.from(resvg.render().asPng());
  } catch {
    // Fallback: return SVG as buffer
    return Buffer.from(svg);
  }
}

export async function generateFeatureImage(options: FeatureImageOptions): Promise<Buffer> {
  const {
    title,
    description,
    icon = "⚡",
    primaryColor = "#2563eb",
    width = 600,
    height = 400,
  } = options;

  const font = await loadFont();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px",
          background: "#ffffff",
          border: `2px solid ${hexToRgba(primaryColor, 0.2)}`,
          borderRadius: "16px",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                fontSize: 48,
                marginBottom: "16px",
              },
              children: icon,
            },
          },
          {
            type: "div",
            props: {
              style: {
                fontSize: 28,
                fontWeight: 700,
                color: "#111827",
                textAlign: "center",
                marginBottom: "12px",
              },
              children: title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                fontSize: 16,
                color: "#6b7280",
                textAlign: "center",
                lineHeight: 1.5,
                maxWidth: "400px",
              },
              children: description,
            },
          },
        ],
      },
    } as any,
    {
      width,
      height,
      fonts: [{ name: "Inter", data: font, weight: 400, style: "normal" }],
    },
  );

  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return Buffer.from(svg);
  }
}
