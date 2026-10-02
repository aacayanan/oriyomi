interface FoldCreaseArtProps {
  /** 0-based fold index — drives a unique crease pattern */
  index: number;
  className?: string;
  /** gold mark at the crease center (active / playing) */
  active?: boolean;
}

/**
 * Procedural crease mark for one fold. Deterministic from `index`:
 * line count, rotation, and diamond geometry all shift, so every fold
 * reads as its own sheet without shipping unbounded CSS.
 */
export default function FoldCreaseArt({
  index,
  className = "",
  active = false,
}: FoldCreaseArtProps) {
  const n = Math.max(0, Math.floor(index));
  const lineCount = 3 + (n % 5);
  const rot = (n * 53) % 360;
  const innerRot = (n * 29) % 90;

  const lines = Array.from({ length: lineCount }, (_, i) => {
    const a = ((rot + (i * 360) / lineCount) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return {
      x1: 50 - 72 * c,
      y1: 50 - 72 * s,
      x2: 50 + 72 * c,
      y2: 50 + 72 * s,
    };
  });

  // Diamond / crease body varies with fold number
  const top = 8 + (n % 3) * 4;
  const bottom = 92 - (n % 3) * 4;
  const right = 92 - (n % 4) * 3;
  const left = 8 + (n % 4) * 3;
  const points = `50,${top} ${right},50 50,${bottom} ${left},50`;

  return (
    <div
      className={`relative overflow-hidden bg-vermilion ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="block h-full w-full">
        <rect width="100" height="100" fill="#C34838" />
        <g stroke="#F8F4EA" fill="none" strokeLinecap="square">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              strokeWidth={1.1 + (n % 3) * 0.25}
              opacity={0.75 + (i % 2) * 0.15}
            />
          ))}
          <polygon points={points} strokeWidth="1.6" opacity="0.95" />
          <g transform={`rotate(${innerRot} 50 50)`} opacity="0.45">
            <rect
              x={20 + (n % 3) * 2}
              y={20 + (n % 2) * 3}
              width={60 - (n % 3) * 4}
              height={60 - (n % 2) * 4}
              strokeWidth="0.9"
            />
          </g>
        </g>
        {active && <circle cx="50" cy="50" r="7" fill="#C9A227" />}
      </svg>
    </div>
  );
}
