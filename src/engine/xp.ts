/**
 * 5e XP thresholds — total XP required to reach each level.
 */
export const XP_THRESHOLDS: readonly number[] = [
  0,        // L1
  300,      // L2
  900,      // L3
  2700,     // L4
  6500,     // L5
  14000,    // L6
  23000,    // L7
  34000,    // L8
  48000,    // L9
  64000,    // L10
  85000,    // L11
  100000,   // L12
  120000,   // L13
  140000,   // L14
  165000,   // L15
  195000,   // L16
  225000,   // L17
  265000,   // L18
  305000,   // L19
  355000,   // L20
];

export function levelForXp(xp: number): number {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]!) return i + 1;
  }
  return 1;
}

export function xpForLevel(level: number): number {
  const i = Math.max(1, Math.min(20, level));
  return XP_THRESHOLDS[i - 1]!;
}

export function xpToNext(xp: number, currentLevel: number): { needed: number; total: number } {
  if (currentLevel >= 20) return { needed: 0, total: 0 };
  const next = xpForLevel(currentLevel + 1);
  const cur = xpForLevel(currentLevel);
  return {
    needed: Math.max(0, next - xp),
    total: next - cur,
  };
}

export function progressToNext(xp: number, currentLevel: number): number {
  const { needed, total } = xpToNext(xp, currentLevel);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - needed / total));
}
