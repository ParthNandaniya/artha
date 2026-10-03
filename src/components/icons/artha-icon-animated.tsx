"use client";

interface ArthaIconAnimatedProps {
  size?: number;
  className?: string;
}

// Line lengths (approximate): BL→T ≈ 42, T→BR ≈ 42, BL→cross ≈ 32, BR→cross ≈ 32
const lines = [
  { x1: 6, y1: 42, x2: 24, y2: 4, len: 42, delay: 0 },
  { x1: 24, y1: 4, x2: 42, y2: 42, len: 42, delay: 200 },
  { x1: 6, y1: 42, x2: 33, y2: 23, len: 32, delay: 400 },
  { x1: 42, y1: 42, x2: 15, y2: 23, len: 32, delay: 500 },
];

const vertices = [
  { cx: 6, cy: 42, delay: 300, glowDelay: 0 },
  { cx: 24, cy: 4, delay: 500, glowDelay: 1 },
  { cx: 42, cy: 42, delay: 700, glowDelay: 2 },
];

export function ArthaIconAnimated({
  size = 48,
  className,
}: ArthaIconAnimatedProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      {/* Lines that draw themselves */}
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            style={{
              strokeDasharray: l.len,
              strokeDashoffset: l.len,
              animation: `logo-draw 400ms ease-out ${l.delay}ms both`,
            }}
          />
        ))}
      </g>

      {/* Pulse ring from center after draw completes */}
      <circle
        cx="24"
        cy="24"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{
          opacity: 0,
          animation: "logo-pulse-ring 800ms ease-out 900ms both",
        }}
      />

      {/* Vertex dots — fade in + scale, then breathe */}
      {vertices.map((v, i) => (
        <circle
          key={i}
          cx={v.cx}
          cy={v.cy}
          r="4"
          fill="currentColor"
          style={{
            transformOrigin: `${v.cx}px ${v.cy}px`,
            opacity: 0,
            animation: `logo-vertex-in 300ms ease-out ${v.delay}ms both, logo-vertex-glow 3s ease-in-out ${1200 + v.glowDelay * 400}ms infinite`,
          }}
        />
      ))}
    </svg>
  );
}
