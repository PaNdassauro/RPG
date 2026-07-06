/**
 * Rest mechanics.
 *
 * Long rest (8h):
 *  - HP → max
 *  - Spell slots → all refilled
 *  - Hit dice → recover up to half of total (rounded down, min 1)
 *  - Exhaustion → reduce by 1 level
 *  - Death saves → cleared
 *  - Temp HP → cleared
 *
 * Short rest (1h):
 *  - Spend hit dice voluntarily — each die rolled + CON mod = HP healed (min 1)
 *  - Warlock pact slots refresh
 *  - Some class features refresh (Second Wind, Action Surge — tracked elsewhere)
 */
import type { Character, Condition, HitDieEntry } from "@/schemas/character";
import { abilityModifier } from "@/schemas/character";
import { rollExpression } from "./dice";
import { resetAllSlots, resetWarlockSlots } from "./spells";

const EXHAUSTION_ORDER: Condition[] = [
  "exhaustion1",
  "exhaustion2",
  "exhaustion3",
  "exhaustion4",
  "exhaustion5",
  "exhaustion6",
];

function downgradeExhaustion(conditions: Condition[]): Condition[] {
  const filtered = conditions.filter((c) => !EXHAUSTION_ORDER.includes(c));
  const current = conditions
    .filter((c): c is Condition => EXHAUSTION_ORDER.includes(c))
    .map((c) => EXHAUSTION_ORDER.indexOf(c) + 1);
  const level = current.length ? Math.max(...current) : 0;
  const next = level - 1;
  if (next <= 0) return filtered;
  return [...filtered, EXHAUSTION_ORDER[next - 1]!];
}

export function applyLongRest(char: Character): Character {
  const hitDice = recoverHitDice(char.hitDice);
  const conditions = downgradeExhaustion(char.conditions);
  const refilled = resetAllSlots(char);
  return {
    ...refilled,
    hp: { ...char.hp, current: char.hp.max, temp: 0 },
    hitDice,
    conditions,
    deathSaves: { successes: 0, failures: 0 },
    updatedAt: Date.now(),
  };
}

function recoverHitDice(hd: HitDieEntry[]): HitDieEntry[] {
  const totalMax = hd.reduce((s, h) => s + h.max, 0);
  let canRecover = Math.max(1, Math.floor(totalMax / 2));
  return hd.map((entry) => {
    const room = entry.max - entry.current;
    const gained = Math.min(room, canRecover);
    canRecover -= gained;
    return { ...entry, current: entry.current + gained };
  });
}

export interface ShortRestRollResult {
  classId: string;
  die: number;
  rolled: number;
  conMod: number;
  healed: number;
}

/** Spend one hit die at short rest. Returns the heal applied + updated character. */
export function spendHitDie(
  char: Character,
  classId: string,
): { roll: ShortRestRollResult; next: Character } | null {
  const idx = char.hitDice.findIndex((h) => h.classId === classId && h.current > 0);
  if (idx < 0) return null;
  const entry = char.hitDice[idx]!;
  const result = rollExpression(`1d${entry.die}`);
  const conMod = abilityModifier(char.abilities.con);
  const healed = Math.max(1, result.total + conMod);
  const newCurrent = Math.min(char.hp.max, char.hp.current + healed);
  const nextHd: HitDieEntry[] = [...char.hitDice];
  nextHd[idx] = { ...entry, current: entry.current - 1 };
  const next: Character = {
    ...char,
    hp: { ...char.hp, current: newCurrent },
    hitDice: nextHd,
    updatedAt: Date.now(),
  };
  return {
    roll: {
      classId,
      die: entry.die,
      rolled: result.total,
      conMod,
      healed: newCurrent - char.hp.current,
    },
    next,
  };
}

/** Apply the non-hit-die effects of a short rest (warlock slots, etc.). */
export function applyShortRestRefreshes(char: Character): Character {
  return resetWarlockSlots(char);
}
