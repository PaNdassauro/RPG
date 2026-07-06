/**
 * Saving throw resolver. 5e: d20 + ability mod + (proficiency if proficient).
 * Conditions like blinded, restrained, frightened, poisoned, exhaustion1+
 * generally do NOT impose advantage/disadvantage on saves themselves — those
 * are at the call site (e.g. magic effects). We accept an optional mode.
 */
import {
  abilityModifier,
  proficiencyBonus,
  type Ability,
  type Character,
} from "@/schemas/character";
import { rollExpression, rollWithMode, type RollMode } from "./dice";
import type { DiceRollResult } from "./types";

export interface SaveResolution {
  result: DiceRollResult;
  modifier: number;
  breakdown: {
    ability: number;
    proficient: boolean;
    profBonus: number;
  };
  total: number;
  dc: number;
  success: boolean;
  isCritical: boolean;
  isFumble: boolean;
}

export function resolveSavingThrow(
  character: Character,
  ability: Ability,
  dc: number,
  mode: RollMode = null,
): SaveResolution {
  const score = character.abilities[ability];
  const abilityMod = abilityModifier(score);
  const level = character.classes.reduce((s, c) => s + c.level, 0);
  const profBonus = proficiencyBonus(level);
  const proficient = character.savingThrows.includes(ability);
  const profComponent = proficient ? profBonus : 0;
  const modifier = abilityMod + profComponent;
  const sign = modifier >= 0 ? "+" : "-";
  const expr = `1d20${sign}${Math.abs(modifier)}`;

  const result = mode ? rollWithMode(expr, mode) : rollExpression(expr);

  return {
    result,
    modifier,
    breakdown: {
      ability: abilityMod,
      proficient,
      profBonus,
    },
    total: result.total,
    dc,
    success: result.isCritical
      ? true
      : result.isFumble
        ? false
        : result.total >= dc,
    isCritical: result.isCritical,
    isFumble: result.isFumble,
  };
}
