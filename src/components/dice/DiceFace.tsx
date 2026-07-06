import { memo, useId } from "react";

interface DiceFaceProps {
  sides: number;
  value: number;
  size?: number;
  cracked?: boolean;
  glowing?: boolean;
  dimmed?: boolean;
}

/**
 * Polyhedral die silhouette. Each die type has a distinct 2D shape so the
 * narration log reads at a glance: triangles for d4/d20, square for d6,
 * rhombus for d8, kite for d10, pentagon for d12.
 */
export const DiceFace = memo(function DiceFace({
  sides,
  value,
  size = 88,
  cracked,
  glowing,
  dimmed,
}: DiceFaceProps) {
  const uid = useId().replace(/:/g, "");
  const fillId = `df-fill-${uid}`;
  const shineId = `df-shine-${uid}`;
  const glowId = `df-glow-${uid}`;

  const shape = SHAPES[sides] ?? GENERIC_SHAPE;
  const palette = PALETTES[sides] ?? GENERIC_PALETTE;
  const numberFontSize = sides === 6 ? 30 : sides >= 100 ? 18 : 26;
  const numberY = shape.numberY;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`d${sides} face ${value}`}
      style={{
        display: "block",
        opacity: dimmed ? 0.45 : 1,
        filter: dimmed ? "saturate(0.6)" : undefined,
      }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.fillTop} />
          <stop offset="1" stopColor={palette.fillBottom} />
        </linearGradient>
        <radialGradient id={shineId} cx="0.35" cy="0.25" r="0.7">
          <stop offset="0" stopColor={palette.shine} stopOpacity="0.35" />
          <stop offset="1" stopColor={palette.shine} stopOpacity="0" />
        </radialGradient>
        {glowing && (
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <g filter={glowing ? `url(#${glowId})` : undefined}>
        <path
          d={shape.outline}
          fill={`url(#${fillId})`}
          stroke={palette.stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {shape.facets && (
          <path
            d={shape.facets}
            fill="none"
            stroke={palette.stroke}
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        )}
        <path d={shape.outline} fill={`url(#${shineId})`} />

        {cracked && (
          <g
            stroke="#a83232"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.95"
          >
            <path d="M50 18 L52 38 L46 50 L58 60 L50 76" />
            <path d="M52 38 L66 42" />
            <path d="M46 50 L34 54" />
          </g>
        )}

        <text
          x="50"
          y={numberY}
          textAnchor="middle"
          fontFamily="Cinzel, serif"
          fontWeight={700}
          fontSize={numberFontSize}
          fill="#e8dcc4"
          style={{ paintOrder: "stroke", stroke: "#0f0a06", strokeWidth: 0.5 }}
        >
          {value}
        </text>
      </g>
    </svg>
  );
});

interface ShapeDef {
  outline: string;
  facets?: string;
  numberY: number;
}

/**
 * Each shape is centered on a 100x100 viewBox. `outline` is the silhouette;
 * `facets` are optional inner lines hinting at the polyhedron's geometry.
 */
const SHAPES: Record<number, ShapeDef> = {
  // d4 — tetrahedron, plain upward triangle, number near the wide base.
  4: {
    outline: "M50 14 L88 80 L12 80 Z",
    numberY: 70,
  },
  // d6 — cube, rounded square. Subtle inner stroke suggesting a face edge.
  6: {
    outline: "M18 14 H82 A4 4 0 0 1 86 18 V82 A4 4 0 0 1 82 86 H18 A4 4 0 0 1 14 82 V18 A4 4 0 0 1 18 14 Z",
    facets: "M14 30 H86 M30 86 V14",
    numberY: 60,
  },
  // d8 — octahedron, vertical rhombus split horizontally.
  8: {
    outline: "M50 8 L88 50 L50 92 L12 50 Z",
    facets: "M12 50 H88",
    numberY: 60,
  },
  // d10 — pentagonal kite (taller, narrower base).
  10: {
    outline: "M50 6 L86 36 L72 88 L28 88 L14 36 Z",
    facets: "M14 36 L50 50 L86 36 M50 50 L50 88",
    numberY: 60,
  },
  // d12 — dodecahedron, regular pentagon.
  12: {
    outline: "M50 10 L88 38 L74 86 L26 86 L12 38 Z",
    facets: "M12 38 L50 56 L88 38 M50 56 L26 86 M50 56 L74 86",
    numberY: 62,
  },
  // d20 — icosahedron silhouette: hexagonal outline with the central upward
  // triangle as inner facets, matching the canonical 2D representation.
  20: {
    outline: "M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z",
    facets: "M50 4 L10 73 L90 73 Z M50 96 L36 73 M50 96 L64 73",
    numberY: 64,
  },
  // d100 — same kite as d10, shown for percentile rolls.
  100: {
    outline: "M50 6 L86 36 L72 88 L28 88 L14 36 Z",
    facets: "M14 36 L50 50 L86 36",
    numberY: 60,
  },
};

const GENERIC_SHAPE: ShapeDef = {
  outline: "M18 18 H82 V82 H18 Z",
  numberY: 60,
};

interface DicePalette {
  /** Outer + facet stroke color. */
  stroke: string;
  /** Top of the linear fill gradient. */
  fillTop: string;
  /** Bottom of the linear fill gradient. */
  fillBottom: string;
  /** Color used for the radial highlight + glow. */
  shine: string;
}

/**
 * Each die type has its own metal/gem treatment so the row reads at a glance.
 * The d20 stays gold — it is the signature die. Other dice get distinct hues
 * that still sit comfortably on the dark canvas.
 */
const PALETTES: Record<number, DicePalette> = {
  // d4 — copper / dried blood
  4: { stroke: "#d8674a", fillTop: "#3a1e15", fillBottom: "#180806", shine: "#ff8a64" },
  // d6 — pewter / steel
  6: { stroke: "#a6b0bd", fillTop: "#1f2530", fillBottom: "#080c12", shine: "#d8dee8" },
  // d8 — emerald / forest
  8: { stroke: "#67c87f", fillTop: "#13281a", fillBottom: "#050f08", shine: "#9be0a8" },
  // d10 — amethyst
  10: { stroke: "#b985e0", fillTop: "#221530", fillBottom: "#0e0818", shine: "#cfa3e8" },
  // d12 — viridian / sea-glass
  12: { stroke: "#6dc8c8", fillTop: "#0f2a2a", fillBottom: "#04100f", shine: "#a8e0e0" },
  // d20 — gold (signature, unchanged)
  20: { stroke: "#d4af37", fillTop: "#2a1f17", fillBottom: "#0f0a06", shine: "#f0c95a" },
  // d100 — same amethyst as d10 (percentile context)
  100: { stroke: "#b985e0", fillTop: "#221530", fillBottom: "#0e0818", shine: "#cfa3e8" },
};

const GENERIC_PALETTE: DicePalette = {
  stroke: "#d4af37",
  fillTop: "#2a1f17",
  fillBottom: "#0f0a06",
  shine: "#d4af37",
};
