export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface CaptionStyle {
  fontSize?: number;
  fontName?: string;
  primaryColor?: string;
  highlightColor?: string;
  position?: "bottom" | "center";
}

/**
 * Generate word-level timestamps by evenly distributing words across the duration.
 */
export function generateCaptions(
  text: string,
  durationSeconds: number
): WordTimestamp[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const wordDuration = durationSeconds / words.length;

  return words.map((word, i) => ({
    word,
    start: i * wordDuration,
    end: (i + 1) * wordDuration,
  }));
}

/**
 * Convert seconds to ASS timestamp format: H:MM:SS.cc
 */
function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Convert a hex color like "#FFFFFF" to ASS BGR format "&H00FFFFFF"
 */
function hexToAssBgr(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

const DEFAULT_STYLE: Required<CaptionStyle> = {
  fontSize: 18,
  fontName: "Arial",
  primaryColor: "#FFFFFF",
  highlightColor: "#FFFF00",
  position: "bottom",
};

/**
 * Format word timestamps as ASS subtitle content with TikTok-style
 * word-by-word highlighting (current word in highlight color, others in primary).
 */
export function formatAssSubs(
  words: WordTimestamp[],
  options?: CaptionStyle
): string {
  const style = { ...DEFAULT_STYLE, ...options };
  const primaryAss = hexToAssBgr(style.primaryColor);
  const highlightAss = hexToAssBgr(style.highlightColor);

  // Vertical alignment: bottom = \an2, center = \an5
  const alignment = style.position === "center" ? 5 : 2;

  const header = `[Script Info]
Title: UGC Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${primaryAss},${primaryAss},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,${alignment},40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Group words into lines of ~5 words for readability
  const WORDS_PER_LINE = 5;
  const lines: string[] = [];

  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const group = words.slice(i, i + WORDS_PER_LINE);
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;

    // For each word in the group, create a dialogue line that highlights it
    for (let j = 0; j < group.length; j++) {
      const wordStart = group[j].start;
      const wordEnd = group[j].end;

      // Build the text with highlight on the current word
      const textParts = group.map((w, k) => {
        if (k === j) {
          return `{\\c${highlightAss}}${w.word}{\\c${primaryAss}}`;
        }
        return w.word;
      });

      const text = `{\\an${alignment}}${textParts.join(" ")}`;
      lines.push(
        `Dialogue: 0,${toAssTime(wordStart)},${toAssTime(wordEnd)},Default,,0,0,0,,${text}`
      );
    }
  }

  return `${header}\n${lines.join("\n")}\n`;
}
