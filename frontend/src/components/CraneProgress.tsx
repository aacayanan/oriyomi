"use client";

interface CraneProgressProps {
  /** 0..1 playback or fold completion */
  progress: number;
  /** 0..1 how many folds are finished (structure-aware) */
  foldProgress?: number;
  className?: string;
}

/**
 * Vermilion crease sheet that folds forward with playback.
 * Procedural SVG — not a static plate — per the direction contract.
 */
export default function CraneProgress({
  progress,
  foldProgress,
  className = "",
}: CraneProgressProps) {
  const p = Math.min(1, Math.max(0, progress));
  const folds = Math.min(1, Math.max(0, foldProgress ?? p));
  const creaseIn = 0.15 + folds * 0.75;
  const craneIn = Math.max(0, (p - 0.55) / 0.45);

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden border border-hairline bg-vermilion ${className}`}
      role="img"
      aria-label={`Crease sheet ${Math.round(p * 100)}% folded`}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        {/* base paper field */}
        <rect width="200" height="200" fill="#C34838" />
        {/* soft kozo grain */}
        <g opacity="0.12" stroke="#F8F4EA" strokeWidth="0.6">
          <path d="M0 30h200M0 70h200M0 110h200M0 150h200" />
        </g>

        {/* progressive crease lattice */}
        <g
          stroke="#F8F4EA"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="square"
          style={{
            opacity: creaseIn,
            transition: "opacity 400ms ease",
          }}
        >
          <path d="M20 20 L180 180" />
          <path d="M180 20 L20 180" />
          <path d="M100 12 L100 188" />
          <path d="M12 100 L188 100" />
          <path d="M20 20 L100 70 L180 20" />
          <path d="M20 180 L100 130 L180 180" />
          <path d="M20 20 L70 100 L20 180" />
          <path d="M180 20 L130 100 L180 180" />
          <path
            d="M40 40 L100 88 L160 40 L160 120 L100 160 L40 120 Z"
            strokeWidth="1.8"
          />
        </g>

        {/* gold fold mark that advances with playback */}
        <circle
          cx="100"
          cy="100"
          r={4 + p * 10}
          fill="#C9A227"
          opacity={0.35 + p * 0.65}
          style={{ transition: "r 300ms ease, opacity 300ms ease" }}
        />

        {/* crane silhouette emerges as the sheet finishes */}
        <g
          opacity={craneIn}
          transform={`translate(100 108) scale(${0.55 + craneIn * 0.45}) translate(-100 -108)`}
          style={{ transition: "opacity 500ms ease" }}
        >
          <path
            d="M48 100 L88 72 L100 48 L112 72 L152 100 L112 104 L100 128 L88 104 Z
               M92 104 L100 168 L108 104 Z
               M112 72 L148 58 L128 78"
            fill="#F8F4EA"
            stroke="#F8F4EA"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      {/* corner registration ticks */}
      <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-fold/70" />
      <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-fold/70" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-fold/70" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-fold/70" />
    </div>
  );
}
