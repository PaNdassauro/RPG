import { memo } from "react";

const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
  <filter id='n'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
    <feColorMatrix values='0 0 0 0 0.50
                            0 0 0 0 0.50
                            0 0 0 0 0.55
                            0 0 0 0.55 0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#n)' opacity='0.6'/>
</svg>`;

const NOISE_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(NOISE_SVG)}")`;

export const ParchmentBackground = memo(function ParchmentBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-canvas" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
        style={{ backgroundImage: NOISE_URL, backgroundSize: "240px 240px" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 100%, rgba(0,0,0,0.35) 0%, transparent 65%)",
        }}
      />
    </div>
  );
});
