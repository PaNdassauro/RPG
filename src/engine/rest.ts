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
import type { Character, HitDieEntry } from "@/schemas/character";
import { abilityModifier } from "@/schemas/character";
import { CLEAR_DEATH_SAVES } from "./deathSave";
import { rollExpression } from "./dice";
import { effectiveHpMax, exhaustionLevel, withExhaustionLevel } from "./conditions";
import { resetAllSlots, resetWarlockSlots } from "./spells";

export function applyLongRest(char: Character): Character {
  const hitDice = recoverHitDice(char.hitDice);
  const conditions = withExhaustionLevel(char.conditions, exhaustionLevel(char.conditions) - 1);
  const refilled = resetAllSlots(char);
  return {
    ...refilled,
    // Healed to the post-rest maximum (still halved while exhaustion >= 4).
    hp: { ...char.hp, current: effectiveHpMax(char.hp.max, conditions), temp: 0 },
    hitDice,
    conditions,
    deathSaves: { ...CLEAR_DEATH_SAVES },
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
  const newCurrent = Math.max(
    char.hp.current,
    Math.min(effectiveHpMax(char.hp.max, char.conditions), char.hp.current + healed),
  );
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
