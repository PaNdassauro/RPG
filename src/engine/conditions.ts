/**
 * Condition effects: surface advantage/disadvantage and other modifiers that
 * conditions impose on the player's d20 rolls. The combat is theater-of-mind,
 * so we focus on roll-affecting effects, not movement/positioning.
 *
 * SRD 5e summary (only effects the engine can mechanize):
 *  - blinded: attack rolls disadvantage; attackers have advantage vs you
 *  - charmed: cannot attack charmer; charmer has advantage on social checks
 *  - deafened: cannot hear (narrative, no roll effect by itself)
 *  - frightened: disadvantage on ability checks AND attack rolls while source is in sight
 *  - grappled: speed 0 (narrative; combat is TOM)
 *  - incapacitated: no actions/reactions
 *  - invisible: attacks have advantage; attackers have disadvantage
 *  - paralyzed: incap + auto-fail STR/DEX saves; auto-crit melee within 5ft
 *  - petrified: paralyzed + resistance
 *  - poisoned: disadvantage on attack rolls AND ability checks
 *  - prone: disadvantage on attack rolls; attackers within 5ft have advantage
 *  - restrained: disadvantage on attack rolls; advantage to attackers; disadvantage on DEX saves
 *  - stunned: incap + auto-fail STR/DEX saves
 *  - unconscious: paralyzed + drops items
 *  - exhaustion 1: disadvantage on ability checks
 *  - exhaustion 2: speed halved
 *  - exhaustion 3: disadvantage on attack rolls and saving throws
 *  - exhaustion 4: HP max halved
 *  - exhaustion 5: speed 0
 *  - exhaustion 6: death
 */
import type { Ability, Condition } from "@/schemas/character";

export type RollKind = "attack" | "check" | "save";

interface ConditionEffect {
  disadvantageAttack?: boolean;
  disadvantageCheck?: boolean;
  disadvantageSave?: boolean;
  /** Auto-fail save of these abilities (e.g. paralyzed fails STR & DEX). */
  autoFailSaves?: Ability[];
}

const EFFECTS: Partial<Record<Condition, ConditionEffect>> = {
  blinded: { disadvantageAttack: true },
  frightened: { disadvantageAttack: true, disadvantageCheck: true },
  poisoned: { disadvantageAttack: true, disadvantageCheck: true },
  prone: { disadvantageAttack: true },
  restrained: { disadvantageAttack: true },
  paralyzed: { autoFailSaves: ["str", "dex"] },
  stunned: { autoFailSaves: ["str", "dex"] },
  unconscious: { autoFailSaves: ["str", "dex"] },
  petrified: { autoFailSaves: ["str", "dex"] },
  exhaustion1: { disadvantageCheck: true },
  exhaustion3: { disadvantageAttack: true, disadvantageSave: true },
  exhaustion4: { disadvantageAttack: true, disadvantageSave: true },
  exhaustion5: { disadvantageAttack: true, disadvantageSave: true },
  exhaustion6: { disadvantageAttack: true, disadvantageSave: true },
};

export type RollMode = "adv" | "dis" | null;

/**
 * Combine a base mode (e.g. caller-imposed adv/dis) with the condition-
 * derived mode. If one of each is present, they cancel to null (5e RAW).
 */
function combine(a: RollMode, b: RollMode): RollMode {
  if (a === b) return a;
  if (!a) return b;
  if (!b) return a;
  return null; // adv + dis cancels
}

export interface ConditionModeArgs {
  conditions: Condition[];
  kind: RollKind;
  /** For saves: which ability. */
  ability?: Ability;
  /** Base mode the caller wanted (from spell, item, etc). */
  base?: RollMode;
}

export interface ConditionModeResult {
  mode: RollMode;
  /** True if the save auto-fails because of a condition. */
  autoFail: boolean;
  /** Conditions that contributed to the mode (for tooltips). */
  sources: Condition[];
}

export function applyConditionsToRoll(args: ConditionModeArgs): ConditionModeResult {
  const sources: Condition[] = [];
  let mode: RollMode = args.base ?? null;
  let autoFail = false;
  for (const c of args.conditions) {
    const eff = EFFECTS[c];
    if (!eff) continue;
    if (args.kind === "attack" && eff.disadvantageAttack) {
      mode = combine(mode, "dis");
      sources.push(c);
    }
    if (args.kind === "check" && eff.disadvantageCheck) {
      mode = combine(mode, "dis");
      sources.push(c);
    }
    if (args.kind === "save") {
      if (eff.disadvantageSave) {
        mode = combine(mode, "dis");
        sources.push(c);
      }
      if (args.ability && eff.autoFailSaves?.includes(args.ability)) {
        autoFail = true;
        sources.push(c);
      }
    }
  }
  return { mode, autoFail, sources };
}

/**
 * Add or refresh a condition timer. Adds the matching condition flag to the
 * conditions array if absent, and replaces any existing timer for the same
 * condition (latest spell wins — typical RAW for overlapping effects).
 */
export function addConditionTimer(
  char: { conditions: Condition[]; conditionTimers: import("@/schemas/character").ConditionTimer[] },
  input: {
    index: Condition;
    rounds: number;
    saveEnd?: { ability: Ability; dc: number };
    source?: string;
  },
): { conditions: Condition[]; conditionTimers: import("@/schemas/character").ConditionTimer[] } {
  const timers = char.conditionTimers.filter((t) => t.index !== input.index);
  const newTimer: import("@/schemas/character").ConditionTimer = {
    index: input.index,
    rounds: Math.max(0, Math.floor(input.rounds)),
    ...(input.saveEnd ? { saveEnd: input.saveEnd } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
  const conditions = char.conditions.includes(input.index)
    ? char.conditions
    : [...char.conditions, input.index];
  return { conditions, conditionTimers: [...timers, newTimer] };
}

/**
 * Decrement every timer by 1. Timers reaching 0 are dropped; their matching
 * condition flag is also removed from `conditions` (so the UI clears the chip).
 * Returns the diff so the caller can log expirations.
 */
export function decrementConditionTimers(
  char: { conditions: Condition[]; conditionTimers: import("@/schemas/character").ConditionTimer[] },
): {
  conditions: Condition[];
  conditionTimers: import("@/schemas/character").ConditionTimer[];
  expired: Condition[];
} {
  const expired: Condition[] = [];
  const nextTimers: import("@/schemas/character").ConditionTimer[] = [];
  for (const t of char.conditionTimers) {
    const r = t.rounds - 1;
    if (r <= 0) {
      expired.push(t.index);
    } else {
      nextTimers.push({ ...t, rounds: r });
    }
  }
  const conditions = char.conditions.filter((c) => !expired.includes(c));
  return { conditions, conditionTimers: nextTimers, expired };
}

/** Speed multiplier from conditions. Used to display effective speed in UI. */
export function speedMultiplier(conditions: Condition[]): number {
  if (conditions.includes("exhaustion5") || conditions.includes("exhaustion6")) return 0;
  if (conditions.includes("grappled") || conditions.includes("restrained")) return 0;
  if (conditions.includes("paralyzed") || conditions.includes("petrified")) return 0;
  if (conditions.includes("stunned") || conditions.includes("unconscious")) return 0;
  if (conditions.includes("exhaustion2") || conditions.includes("exhaustion3") || conditions.includes("exhaustion4")) return 0.5;
  return 1;
}
