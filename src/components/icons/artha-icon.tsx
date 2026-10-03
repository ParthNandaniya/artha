interface ArthaIconProps {
  size?: number;
  className?: string;
}

export function ArthaIcon({ size = 24, className }: ArthaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      {/* Lines */}
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <line x1="6" y1="42" x2="24" y2="4" />
        <line x1="24" y1="4" x2="42" y2="42" />
        <line x1="6" y1="42" x2="33" y2="23" />
        <line x1="42" y1="42" x2="15" y2="23" />
      </g>
      {/* Vertex dots */}
      <circle cx="6" cy="42" r="4" fill="currentColor" />
      <circle cx="24" cy="4" r="4" fill="currentColor" />
      <circle cx="42" cy="42" r="4" fill="currentColor" />
    </svg>
  );
}
