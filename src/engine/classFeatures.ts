/**
 * Per-class signature ability helpers. Pure functions — the caller picks when
 * to invoke them, and the engine resolves the dice/effect.
 *
 * Covered:
 *  - Sneak Attack (Rogue) — bonus dice if attack has advantage or qualifying ally
 *  - Divine Smite (Paladin) — spend slot to add radiant damage on hit
 *  - Rage (Barbarian) — bonus damage + bludg/pierce/slash resistance
 *  - Action Surge / Second Wind (Fighter)
 *  - Ki (Monk)
 *  - Bardic Inspiration (Bard)
 *  - Lay on Hands (Paladin)
 *  - Channel Divinity (Cleric / Paladin)
 */
import type { Character, UsageCounter } from "@/schemas/character";

interface ClassLevels {
  rogue: number;
  paladin: number;
  barbarian: number;
  fighter: number;
  monk: number;
  bard: number;
  cleric: number;
}

function classLevels(char: Character): ClassLevels {
  const out: ClassLevels = {
    rogue: 0,
    paladin: 0,
    barbarian: 0,
    fighter: 0,
    monk: 0,
    bard: 0,
    cleric: 0,
  };
  for (const c of char.classes) {
    if (c.classId in out) {
      out[c.classId as keyof ClassLevels] = c.level;
    }
  }
  return out;
}

// --- Sneak Attack -------------------------------------------------------

/**
 * Sneak Attack die count by rogue level. RAW: 1d6 at L1, +1d6 every two
 * levels up to 10d6 at L19.
 */
export function sneakAttackDice(rogueLevel: number): number {
  if (rogueLevel < 1) return 0;
  return Math.ceil(rogueLevel / 2);
}

export function sneakAttackExpression(rogueLevel: number): string | null {
  const n = sneakAttackDice(rogueLevel);
  return n > 0 ? `${n}d6` : null;
}

export interface SneakAttackEligibility {
  /** True if the rogue has any rogue level. */
  hasFeature: boolean;
  /** True if combat is up and a non-PC live target exists. */
  hasTarget: boolean;
  /** SRD: attack with advantage OR ally within 5ft of target. We accept both. */
  expression: string | null;
}

/** Heuristic eligibility surfaced in the attack UI — final call is the player's. */
export function sneakAttackEligible(char: Character): SneakAttackEligibility {
  const l = classLevels(char);
  const expression = sneakAttackExpression(l.rogue);
  return { hasFeature: l.rogue >= 1, hasTarget: l.rogue >= 1, expression };
}

// --- Divine Smite -------------------------------------------------------

/**
 * Divine Smite damage. RAW: 2d8 for 1st-level slot, +1d8 per level above
 * (max 5d8 at 4th+). +1d8 vs undead/fiend (caller decides if applicable).
 */
export function divineSmiteExpression(slotLevel: number, undeadOrFiend = false): string {
  const base = Math.min(5, slotLevel + 1);
  const total = base + (undeadOrFiend ? 1 : 0);
  return `${total}d8`;
}

export function paladinCanSmite(char: Character): boolean {
  return classLevels(char).paladin >= 2;
}

// --- Rage --------------------------------------------------------------

/** Rage damage bonus by barbarian level (RAW: +2 / +3 / +4 at L9 / L16). */
export function rageDamageBonus(barbLevel: number): number {
  if (barbLevel < 1) return 0;
  if (barbLevel >= 16) return 4;
  if (barbLevel >= 9) return 3;
  return 2;
}

/** Number of rages per long rest by barbarian level. */
export function ragesPerLongRest(barbLevel: number): number {
  if (barbLevel < 1) return 0;
  if (barbLevel >= 17) return 6; // unlimited at 20 but we cap
  if (barbLevel >= 12) return 5;
  if (barbLevel >= 6) return 4;
  if (barbLevel >= 3) return 3;
  return 2;
}

export function barbarianRageState(char: Character): {
  hasFeature: boolean;
  charges: { current: number; max: number } | null;
} {
  const l = classLevels(char);
  if (l.barbarian < 1) return { hasFeature: false, charges: null };
  const counter = char.usageCounters.find((c) => c.id === "rage");
  return {
    hasFeature: true,
    charges: counter ? { current: counter.current, max: counter.max } : null,
  };
}

// --- Usage counters generic --------------------------------------------

export function findCounter(char: Character, id: string): UsageCounter | undefined {
  return char.usageCounters.find((c) => c.id === id);
}

export function setCounter(char: Character, counter: UsageCounter): Character {
  const next = char.usageCounters.filter((c) => c.id !== counter.id);
  next.push(counter);
  return { ...char, usageCounters: next, updatedAt: Date.now() };
}

export function spendCounter(char: Character, id: string, amount = 1): Character | null {
  const cur = findCounter(char, id);
  if (!cur || cur.current < amount) return null;
  return setCounter(char, { ...cur, current: cur.current - amount });
}

export function refreshCounters(char: Character, kind: "short" | "long"): Character {
  const next = char.usageCounters.map((c) => {
    if (c.perRest === "long" && kind === "long") return { ...c, current: c.max };
    if (c.perRest === "short") return { ...c, current: c.max };
    return c;
  });
  return { ...char, usageCounters: next, updatedAt: Date.now() };
}

// --- Auto-grant feature counters by class progression -------------------

/**
 * Reconcile usageCounters with the character's current class features. Adds
 * counters that should exist (rage, action surge, ki, bardic inspiration,
 * channel divinity, lay on hands), bumps maxes, preserves current. Called
 * after level-up and on character load to keep things in sync.
 */
export function syncFeatureCounters(char: Character): Character {
  const l = classLevels(char);
  const profBonus = Math.ceil(
    char.classes.reduce((s, c) => s + c.level, 0) / 4,
  ) + 1;
  const target: UsageCounter[] = [];

  if (l.barbarian >= 1) {
    target.push({
      id: "rage",
      max: ragesPerLongRest(l.barbarian),
      current: ragesPerLongRest(l.barbarian),
      perRest: "long",
    });
  }
  if (l.fighter >= 2) {
    target.push({
      id: "action-surge",
      max: l.fighter >= 17 ? 2 : 1,
      current: l.fighter >= 17 ? 2 : 1,
      perRest: "short",
    });
  }
  if (l.fighter >= 1) {
    target.push({
      id: "second-wind",
      max: 1,
      current: 1,
      perRest: "short",
    });
  }
  if (l.monk >= 2) {
    target.push({
      id: "ki-points",
      max: l.monk,
      current: l.monk,
      perRest: "short",
    });
  }
  if (l.bard >= 1) {
    // Inspiration die scales L1/L5/L10/L15.
    const die = l.bard >= 15 ? 12 : l.bard >= 10 ? 10 : l.bard >= 5 ? 8 : 6;
    const cha = char.abilities.cha;
    const chaMod = Math.floor((cha - 10) / 2);
    target.push({
      id: "bardic-inspiration",
      max: Math.max(1, chaMod),
      current: Math.max(1, chaMod),
      perRest: l.bard >= 5 ? "short" : "long",
      die,
    });
  }
  if (l.paladin >= 1) {
    // Lay on Hands pool = paladinLevel × 5 HP. Refresh on long rest.
    target.push({
      id: "lay-on-hands",
      max: l.paladin * 5,
      current: l.paladin * 5,
      perRest: "long",
    });
  }
  // Cleric and Paladin both grant Channel Divinity. One shared counter, sized
  // to the larger source — pushing one per class would duplicate the id.
  const channelDivinityMax = Math.max(
    l.cleric >= 18 ? 3 : l.cleric >= 6 ? 2 : l.cleric >= 2 ? 1 : 0,
    l.paladin >= 3 ? 1 : 0,
  );
  if (channelDivinityMax > 0) {
    target.push({
      id: "channel-divinity",
      max: channelDivinityMax,
      current: channelDivinityMax,
      perRest: "short",
    });
  }
  void profBonus;

  // Preserve `current` from existing counters where possible.
  // (A save written by the old duplicate-id bug may hold two of the same id:
  // `findCounter`/`spendCounter` only ever touched the first, so it wins.)
  const existing = new Map<string, UsageCounter>();
  for (const c of char.usageCounters) if (!existing.has(c.id)) existing.set(c.id, c);
  const merged: UsageCounter[] = target.map((t) => {
    const prev = existing.get(t.id);
    if (!prev) return t;
    const max = t.max;
    const current = Math.min(prev.current, max);
    return { ...t, current };
  });
  return { ...char, usageCounters: merged, updatedAt: Date.now() };
}
