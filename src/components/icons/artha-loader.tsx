interface ArthaLoaderProps {
  size?: number;
  className?: string;
}

export function ArthaLoader({ size = 40, className }: ArthaLoaderProps) {
  // Animation path: BL → T → BR → cross-center → BL
  // Segment lengths (approx): BL→T: 42, T→BR: 42, BR→center: 22, center→BL: 22
  // Total ≈ 128. Fractions: 0.33, 0.33, 0.17, 0.17
  const dur = "1.2s";
  const kt = "0;0.33;0.66;0.83;1";
  const cx = "6;24;42;24;6";
  const cy = "42;4;42;29;42";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Loading"
    >
      {/* Structure lines */}
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.12">
        <line x1="6" y1="42" x2="24" y2="4" />
        <line x1="24" y1="4" x2="42" y2="42" />
        <line x1="6" y1="42" x2="33" y2="23" />
        <line x1="42" y1="42" x2="15" y2="23" />
      </g>

      {/* Vertex dots — pulse when the traveling dot arrives */}
      <circle cx="6" cy="42" r="3.5" fill="currentColor">
        <animate
          attributeName="opacity"
          values="0.7;0.12;0.12;0.12;0.7"
          keyTimes={kt}
          dur={dur}
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="24" cy="4" r="3.5" fill="currentColor">
        <animate
          attributeName="opacity"
          values="0.12;0.7;0.12;0.12;0.12"
          keyTimes={kt}
          dur={dur}
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="42" cy="42" r="3.5" fill="currentColor">
        <animate
          attributeName="opacity"
          values="0.12;0.12;0.7;0.12;0.12"
          keyTimes={kt}
          dur={dur}
          repeatCount="indefinite"
        />
      </circle>

      {/* Soft glow behind moving dot */}
      <circle r="7" fill="currentColor" opacity="0.07">
        <animate attributeName="cx" values={cx} keyTimes={kt} dur={dur} repeatCount="indefinite" />
        <animate attributeName="cy" values={cy} keyTimes={kt} dur={dur} repeatCount="indefinite" />
      </circle>

      {/* Moving dot */}
      <circle r="3" fill="currentColor" opacity="0.9">
        <animate attributeName="cx" values={cx} keyTimes={kt} dur={dur} repeatCount="indefinite" />
        <animate attributeName="cy" values={cy} keyTimes={kt} dur={dur} repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
