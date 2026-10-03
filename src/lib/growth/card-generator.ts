import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// ── Constants ────────────────────────────────────────────────────────

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;

// Artha brand colors
const BG_DARK = "#0F172A";
const BG_GRADIENT_END = "#1E293B";
const TEXT_WHITE = "#F8FAFC";
const TEXT_MUTED = "#94A3B8";
const ACCENT = "#38BDF8"; // sky-400 for badge

// ── Font loading ─────────────────────────────────────────────────────

let fontDataCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontDataCache) return fontDataCache;

  // Load Inter Bold from Google Fonts CDN
  const response = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf"
  );
  fontDataCache = await response.arrayBuffer();
  return fontDataCache;
}

let fontRegularCache: ArrayBuffer | null = null;

async function loadFontRegular(): Promise<ArrayBuffer> {
  if (fontRegularCache) return fontRegularCache;

  const response = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
  );
  fontRegularCache = await response.arrayBuffer();
  return fontRegularCache;
}

// ── Shared render pipeline ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderCard(element: any): Promise<Buffer> {
  const [fontBold, fontRegular] = await Promise.all([loadFont(), loadFontRegular()]);

  const svg = await satori(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: "Inter", data: fontBold, weight: 700, style: "normal" },
      { name: "Inter", data: fontRegular, weight: 400, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_WIDTH },
  });
  const png = resvg.render();
  return Buffer.from(png.asPng());
}

// ── Artha logo as JSX (inline, white stroke for dark bg) ────────────

function ArthaLogo() {
  return {
    type: "svg",
    props: {
      width: 48,
      height: 48,
      viewBox: "0 0 48 48",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      children: [
        {
          type: "g",
          props: {
            stroke: TEXT_WHITE,
            strokeWidth: "3",
            strokeLinecap: "round",
            children: [
              { type: "line", props: { x1: "6", y1: "42", x2: "24", y2: "4" } },
              { type: "line", props: { x1: "24", y1: "4", x2: "42", y2: "42" } },
              { type: "line", props: { x1: "6", y1: "42", x2: "33", y2: "23" } },
              { type: "line", props: { x1: "42", y1: "42", x2: "15", y2: "23" } },
            ],
          },
        },
        { type: "circle", props: { cx: "6", cy: "42", r: "4", fill: TEXT_WHITE } },
        { type: "circle", props: { cx: "24", cy: "4", r: "4", fill: TEXT_WHITE } },
        { type: "circle", props: { cx: "42", cy: "42", r: "4", fill: TEXT_WHITE } },
      ],
    },
  };
}

// ── Tip card (branded quote card) ────────────────────────────────────

export async function generateTipCard(tipText: string): Promise<Buffer> {
  // Strip the signature line if present (we show it on the card differently)
  // Strip signature line if present
  const sigIdx = tipText.lastIndexOf("\n\n—");
  const cleanText = (sigIdx > 0 ? tipText.slice(0, sigIdx) : tipText).trim();

  // Adjust font size based on text length
  const fontSize = cleanText.length > 200 ? 38 : cleanText.length > 120 ? 44 : 50;

  const element = {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BG_GRADIENT_END} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header: logo + "Artha"
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "14px" },
            children: [
              ArthaLogo(),
              {
                type: "span",
                props: {
                  style: { color: TEXT_WHITE, fontSize: "32px", fontWeight: 700 },
                  children: "Artha",
                },
              },
            ],
          },
        },
        // Main text
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 0",
            },
            children: {
              type: "p",
              props: {
                style: {
                  color: TEXT_WHITE,
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  textAlign: "center",
                  margin: 0,
                },
                children: cleanText,
              },
            },
          },
        },
        // Footer
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            },
            children: [
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "artha.run",
                },
              },
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "@tryarthaHQ",
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderCard(element);
}

// ── Thread / Article header card ─────────────────────────────────────

export async function generateThreadCard(
  title: string,
  type: "thread" | "article"
): Promise<Buffer> {
  const badgeLabel = type === "thread" ? "Thread" : "Article";
  const fontSize = title.length > 100 ? 40 : title.length > 60 ? 46 : 54;

  const element = {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BG_GRADIENT_END} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header: logo + badge
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: "14px" },
                  children: [
                    ArthaLogo(),
                    {
                      type: "span",
                      props: {
                        style: { color: TEXT_WHITE, fontSize: "32px", fontWeight: 700 },
                        children: "Artha",
                      },
                    },
                  ],
                },
              },
              // Badge
              {
                type: "div",
                props: {
                  style: {
                    background: ACCENT,
                    color: BG_DARK,
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "6px 18px",
                    borderRadius: "20px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: badgeLabel,
                },
              },
            ],
          },
        },
        // Title
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 0",
            },
            children: {
              type: "h1",
              props: {
                style: {
                  color: TEXT_WHITE,
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  textAlign: "center",
                  margin: 0,
                },
                children: title,
              },
            },
          },
        },
        // Footer
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            },
            children: [
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "artha.run",
                },
              },
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "@tryarthaHQ",
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderCard(element);
}

// ── Trending card (headline with fire accent) ──────────────────────

const ACCENT_ORANGE = "#F97316"; // orange-500 for trending

export async function generateTrendingCard(headline: string): Promise<Buffer> {
  const fontSize = headline.length > 80 ? 36 : headline.length > 50 ? 42 : 50;

  const element = {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BG_GRADIENT_END} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header: logo + badge
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: "14px" },
                  children: [
                    ArthaLogo(),
                    {
                      type: "span",
                      props: {
                        style: { color: TEXT_WHITE, fontSize: "32px", fontWeight: 700 },
                        children: "Artha",
                      },
                    },
                  ],
                },
              },
              // Badge
              {
                type: "div",
                props: {
                  style: {
                    background: ACCENT_ORANGE,
                    color: TEXT_WHITE,
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "6px 18px",
                    borderRadius: "20px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: "Trending",
                },
              },
            ],
          },
        },
        // Headline
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 0",
            },
            children: {
              type: "h1",
              props: {
                style: {
                  color: TEXT_WHITE,
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  textAlign: "center",
                  margin: 0,
                },
                children: headline,
              },
            },
          },
        },
        // Footer
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            },
            children: [
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "artha.run",
                },
              },
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "@tryarthaHQ",
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderCard(element);
}

// ── Founder story card (big green metric + context subtitle) ────────

const ACCENT_GREEN = "#34D399"; // emerald-400

export async function generateFounderStoryCard(
  headline: string,
  subtitle?: string
): Promise<Buffer> {
  const headlineFontSize = headline.length > 30 ? 48 : headline.length > 20 ? 56 : 64;

  const centerChildren: unknown[] = [
    {
      type: "div",
      props: {
        style: {
          color: ACCENT_GREEN,
          fontSize: `${headlineFontSize}px`,
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: "center",
          margin: 0,
        },
        children: headline,
      },
    },
  ];

  if (subtitle) {
    centerChildren.push({
      type: "div",
      props: {
        style: {
          color: TEXT_MUTED,
          fontSize: "28px",
          fontWeight: 400,
          lineHeight: 1.4,
          textAlign: "center",
          maxWidth: "900px",
        },
        children: subtitle,
      },
    });
  }

  const storyElement = {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BG_GRADIENT_END} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: "14px" },
                  children: [
                    ArthaLogo(),
                    {
                      type: "span",
                      props: {
                        style: { color: TEXT_WHITE, fontSize: "32px", fontWeight: 700 },
                        children: "Artha",
                      },
                    },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    background: ACCENT_GREEN,
                    color: BG_DARK,
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "8px 20px",
                    borderRadius: "20px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: "Founder Story",
                },
              },
            ],
          },
        },
        // Center content
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flex: 1,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              padding: "20px 0",
            },
            children: centerChildren,
          },
        },
        // Footer
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "artha.run",
                },
              },
              {
                type: "span",
                props: {
                  style: { color: TEXT_MUTED, fontSize: "24px", fontWeight: 700 },
                  children: "@tryarthaHQ",
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderCard(storyElement);
}
