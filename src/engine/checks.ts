/**
 * Skill check resolver. Computes the proper modifier from the character's
 * abilities, proficiency, and expertise, rolls the d20 (with optional
 * advantage/disadvantage), and reports success vs the DC.
 */
import {
  abilityModifier,
  proficiencyBonus,
  SKILL_TO_ABILITY,
  type Character,
  type SkillName,
} from "@/schemas/character";
import { rollExpression, rollWithMode, type RollMode } from "./dice";
import type { DiceRollResult } from "./types";

export interface SkillCheckResolution {
  result: DiceRollResult;
  modifier: number;
  /** Components of the modifier — useful for the UI explanation. */
  breakdown: {
    ability: number;
    proficient: boolean;
    expertise: boolean;
    profBonus: number;
  };
  total: number;
  dc: number;
  success: boolean;
  isCritical: boolean;
  isFumble: boolean;
}

export function resolveSkillCheck(
  character: Character,
  skill: SkillName,
  dc: number,
  mode: RollMode = null,
): SkillCheckResolution {
  const ability = SKILL_TO_ABILITY[skill];
  const score = character.abilities[ability];
  const abilityMod = abilityModifier(score);

  const level = character.classes.reduce((sum, c) => sum + c.level, 0);
  const profBonus = proficiencyBonus(level);

  const proficient = character.proficientSkills.includes(skill);
  const expertise = character.expertiseSkills.includes(skill);
  const profComponent = expertise ? profBonus * 2 : proficient ? profBonus : 0;

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
      expertise,
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
