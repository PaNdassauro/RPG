/**
 * Combat resolution helpers. Pure: roll the dice, compute the new HP — the
 * caller is responsible for persisting state and animating the change.
 *
 * 5e rules honored:
 *  - Damage first chews through temporary HP, then current HP.
 *  - Healing cannot exceed max HP and cannot revive from outside the engine.
 *  - Reducing HP to zero exactly does not "overflow" — stops at 0.
 *  - Resistance halves typed damage (rounded down), vulnerability doubles it,
 *    immunity zeroes it. Resistance + vulnerability cancel (RAW).
 */
import { rollDamage, rollExpression } from "./dice";
import type { DiceRollResult } from "./types";
import type { Character } from "@/schemas/character";

export type DamageScale = "normal" | "resisted" | "vulnerable" | "immune";

export interface DamageResolution {
  /** The damage dice that were rolled. */
  result: DiceRollResult;
  /** The raw rolled total, before resistance/vulnerability scaling. */
  rawAmount: number;
  /** The damage actually inflicted after scaling and HP math (>= 0). */
  amount: number;
  /** How resistance/vulnerability/immunity altered the raw damage. */
  scale: DamageScale;
  /** How much was absorbed by temporary HP. */
  absorbedByTemp: number;
  /** How much actually reduced the character's current HP. */
  appliedToHp: number;
  /** New HP block to write back to the character. */
  newHp: Character["hp"];
  /** True if this damage drops the character to 0 HP. */
  dropsToZero: boolean;
}

export interface HealResolution {
  result: DiceRollResult;
  /** The total amount rolled. */
  rolled: number;
  /** How much actually went onto the HP bar (capped at max). */
  applied: number;
  newHp: Character["hp"];
}

interface DamageScaleInput {
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
}

/**
 * Apply 5e resistance/vulnerability/immunity scaling to a raw damage amount.
 * Exported so callers (e.g. concentration save DC math) can re-derive the
 * post-scaling value.
 */
export function scaleDamageByType(
  amount: number,
  damageType: string | undefined,
  who: DamageScaleInput,
): { amount: number; scale: DamageScale } {
  if (!damageType || amount <= 0) return { amount, scale: "normal" };
  const t = damageType.toLowerCase();
  const has = (list: string[] | undefined) =>
    !!list?.some((x) => x.toLowerCase() === t);
  if (has(who.immunities)) return { amount: 0, scale: "immune" };
  const resisted = has(who.resistances);
  const vulnerable = has(who.vulnerabilities);
  if (resisted && vulnerable) return { amount, scale: "normal" };
  if (resisted) return { amount: Math.floor(amount / 2), scale: "resisted" };
  if (vulnerable) return { amount: amount * 2, scale: "vulnerable" };
  return { amount, scale: "normal" };
}

export function resolveDamage(
  character: Pick<Character, "hp"> & Partial<DamageScaleInput>,
  expression: string,
  damageType?: string,
  opts?: { crit?: boolean },
): DamageResolution {
  // On a critical hit the damage dice are rolled twice (modifier added once).
  const result = opts?.crit ? rollDamage(expression, { crit: true }) : rollExpression(expression);
  const rawAmount = Math.max(0, result.total);
  const { amount, scale } = scaleDamageByType(rawAmount, damageType, character);

  const tempBefore = character.hp.temp;
  const absorbedByTemp = Math.min(tempBefore, amount);
  const remaining = amount - absorbedByTemp;
  const newTemp = tempBefore - absorbedByTemp;
  const newCurrent = Math.max(0, character.hp.current - remaining);
  const appliedToHp = character.hp.current - newCurrent;

  return {
    result,
    rawAmount,
    amount,
    scale,
    absorbedByTemp,
    appliedToHp,
    newHp: { max: character.hp.max, current: newCurrent, temp: newTemp },
    dropsToZero: newCurrent === 0 && character.hp.current > 0,
  };
}

export function resolveHealing(
  character: Pick<Character, "hp">,
  expression: string,
  /** Healing cap when below `hp.max` (e.g. exhaustion level 4 halves it). */
  maxHp: number = character.hp.max,
): HealResolution {
  const result = rollExpression(expression);
  const rolled = Math.max(0, result.total);
  const newCurrent = Math.max(character.hp.current, Math.min(maxHp, character.hp.current + rolled));
  const applied = newCurrent - character.hp.current;

  return {
    result,
    rolled,
    applied,
    newHp: { ...character.hp, current: newCurrent },
  };
}

/**
 * 5e concentration save DC after taking damage: 10 or half the damage taken
 * (rounded down), whichever is higher. The caller fires this only when the
 * character was concentrating.
 */
export function concentrationSaveDc(damageTaken: number): number {
  return Math.max(10, Math.floor(damageTaken / 2));
}
