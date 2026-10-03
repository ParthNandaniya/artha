import satori from "satori";

// ── Types ────────────────────────────────────────────────────────────

export type CardType = "quote-card" | "stat-highlight" | "announcement" | "tip-card";

export interface CardInput {
  type: CardType;
  companyName: string;
  primaryColor?: string;
  /** Main text content (quote, tip, announcement body) */
  text: string;
  /** Secondary text (attribution, subtitle, stat label) */
  subtitle?: string;
  /** For stat-highlight: the big number/metric */
  statValue?: string;
  /** For stat-highlight: metric label */
  statLabel?: string;
}

interface CardOutput {
  svg: string;
  width: number;
  height: number;
}

// ── Constants ────────────────────────────────────────────────────────

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;
const DEFAULT_PRIMARY = "#2563eb";

// ── Font loading ─────────────────────────────────────────────────────

let fontBoldCache: ArrayBuffer | null = null;
let fontRegularCache: ArrayBuffer | null = null;

async function loadFontBold(): Promise<ArrayBuffer> {
  if (fontBoldCache) return fontBoldCache;
  const res = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf",
  );
  fontBoldCache = await res.arrayBuffer();
  return fontBoldCache;
}

async function loadFontRegular(): Promise<ArrayBuffer> {
  if (fontRegularCache) return fontRegularCache;
  const res = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf",
  );
  fontRegularCache = await res.arrayBuffer();
  return fontRegularCache;
}

// ── Shared render ────────────────────────────────────────────────────

// Satori uses a plain-object JSX-like format (same approach as growth/card-generator.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderToSvg(element: any): Promise<string> {
  const [bold, regular] = await Promise.all([loadFontBold(), loadFontRegular()]);

  return satori(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: "Inter", data: bold, weight: 700, style: "normal" as const },
      { name: "Inter", data: regular, weight: 400, style: "normal" as const },
    ],
  });
}

// ── Color utils ──────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Card builders ────────────────────────────────────────────────────

function buildQuoteCard(input: CardInput) {
  const color = input.primaryColor || DEFAULT_PRIMARY;
  const fontSize = input.text.length > 200 ? 32 : input.text.length > 120 ? 38 : 44;

  return {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${darken(color, 80)} 0%, ${darken(color, 40)} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Company name header
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "12px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "18px",
                    fontWeight: 700,
                  },
                  children: input.companyName.charAt(0).toUpperCase(),
                },
              },
              {
                type: "span",
                props: {
                  style: { color: "#F8FAFC", fontSize: "24px", fontWeight: 700 },
                  children: input.companyName,
                },
              },
            ],
          },
        },
        // Quote text
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
                  color: "#F8FAFC",
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  textAlign: "center",
                  margin: 0,
                },
                children: `"${input.text}"`,
              },
            },
          },
        },
        // Attribution footer
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "flex-end",
            },
            children: input.subtitle
              ? {
                  type: "span",
                  props: {
                    style: { color: "#94A3B8", fontSize: "20px", fontWeight: 400 },
                    children: `-- ${input.subtitle}`,
                  },
                }
              : null,
          },
        },
      ],
    },
  };
}

function buildStatHighlightCard(input: CardInput) {
  const color = input.primaryColor || DEFAULT_PRIMARY;

  return {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, #0F172A 0%, #1E293B 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "12px" },
            children: {
              type: "span",
              props: {
                style: { color: "#F8FAFC", fontSize: "24px", fontWeight: 700 },
                children: input.companyName,
              },
            },
          },
        },
        // Big stat
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: "12px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    color: color,
                    fontSize: "96px",
                    fontWeight: 700,
                    lineHeight: 1,
                  },
                  children: input.statValue || input.text,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    color: "#94A3B8",
                    fontSize: "28px",
                    fontWeight: 400,
                    textAlign: "center",
                  },
                  children: input.statLabel || input.subtitle || "",
                },
              },
            ],
          },
        },
        // Context text at bottom
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "center" },
            children: input.text !== input.statValue
              ? {
                  type: "span",
                  props: {
                    style: { color: "#64748B", fontSize: "18px", fontWeight: 400 },
                    children: input.text,
                  },
                }
              : null,
          },
        },
      ],
    },
  };
}

function buildAnnouncementCard(input: CardInput) {
  const color = input.primaryColor || DEFAULT_PRIMARY;
  const fontSize = input.text.length > 150 ? 32 : input.text.length > 80 ? 40 : 48;

  return {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, ${color} 0%, ${darken(color, 30)} 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Badge + company
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "span",
                props: {
                  style: { color: "#F8FAFC", fontSize: "24px", fontWeight: 700 },
                  children: input.companyName,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    background: "rgba(255,255,255,0.2)",
                    color: "#F8FAFC",
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "6px 16px",
                    borderRadius: "20px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: "Announcement",
                },
              },
            ],
          },
        },
        // Main content
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
                  color: "#FFFFFF",
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  textAlign: "center",
                  margin: 0,
                },
                children: input.text,
              },
            },
          },
        },
        // Subtitle
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "center" },
            children: input.subtitle
              ? {
                  type: "span",
                  props: {
                    style: {
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "22px",
                      fontWeight: 400,
                    },
                    children: input.subtitle,
                  },
                }
              : null,
          },
        },
      ],
    },
  };
}

function buildTipCard(input: CardInput) {
  const color = input.primaryColor || DEFAULT_PRIMARY;
  const fontSize = input.text.length > 200 ? 30 : input.text.length > 120 ? 36 : 42;

  return {
    type: "div",
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        background: `linear-gradient(135deg, #0F172A 0%, #1E293B 100%)`,
        fontFamily: "Inter",
      },
      children: [
        // Header with tip badge
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "span",
                props: {
                  style: { color: "#F8FAFC", fontSize: "24px", fontWeight: 700 },
                  children: input.companyName,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    background: hexToRgba(color, 0.2),
                    color: color,
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "6px 16px",
                    borderRadius: "20px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: "Tip",
                },
              },
            ],
          },
        },
        // Tip content
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
                  color: "#F8FAFC",
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  textAlign: "center",
                  margin: 0,
                },
                children: input.text,
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
                type: "div",
                props: {
                  style: {
                    width: "60px",
                    height: "4px",
                    borderRadius: "2px",
                    background: color,
                  },
                  children: null,
                },
              },
              input.subtitle
                ? {
                    type: "span",
                    props: {
                      style: { color: "#64748B", fontSize: "18px", fontWeight: 400 },
                      children: input.subtitle,
                    },
                  }
                : null,
            ],
          },
        },
      ],
    },
  };
}

// ── Main export ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCardElement(input: CardInput): any {
  switch (input.type) {
    case "quote-card":
      return buildQuoteCard(input);
    case "stat-highlight":
      return buildStatHighlightCard(input);
    case "announcement":
      return buildAnnouncementCard(input);
    case "tip-card":
      return buildTipCard(input);
    default:
      throw new Error(`Unknown card type: ${input.type}`);
  }
}

export async function generateSocialCard(input: CardInput): Promise<CardOutput> {
  const element = getCardElement(input);
  const svg = await renderToSvg(element);

  return {
    svg,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
}
