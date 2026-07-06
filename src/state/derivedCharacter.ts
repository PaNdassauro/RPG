/**
 * Pure helpers that turn wizard state into the derived numbers the Live Sheet
 * shows. Kept synchronous and outside React so we can also reuse them in the
 * Review step and at submit time.
 */
import {
  getRace,
  getSubrace,
  getClass,
  getClassLevel,
} from "@/data/srd";
import { abilityModifier, ABILITIES, type Ability, proficiencyBonus } from "@/schemas/character";
import type { WizardAbilities, WizardClass, WizardRace } from "@/state/wizardStore";

export interface DerivedAbilityScores {
  base: Record<Ability, number>;
  raceBonus: Record<Ability, number>;
  total: Record<Ability, number>;
  modifier: Record<Ability, number>;
}

export interface DerivedSheet {
  abilities: DerivedAbilityScores;
  level: number;
  hpMax: number | null;
  ac: number | null;
  speed: number | null;
  initiativeBonus: number | null;
  profBonus: number;
  hitDie: number | null;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_BUDGET = 27;

const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointBuyCost(score: number): number {
  return POINT_BUY_COST[score] ?? 0;
}

export function pointBuySpent(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((sum, ability) => sum + pointBuyCost(scores[ability]), 0);
}

export function pointBuyRemaining(scores: Record<Ability, number>): number {
  return POINT_BUY_BUDGET - pointBuySpent(scores);
}

export function deriveAbilities(args: {
  race: WizardRace;
  abilities: WizardAbilities;
}): DerivedAbilityScores {
  const base = { ...args.abilities.scores };

  const raceBonus: Record<Ability, number> = {
    str: 0,
    dex: 0,
    con: 0,
    int: 0,
    wis: 0,
    cha: 0,
  };

  const race = args.race.raceId ? getRace(args.race.raceId) : undefined;
  if (race) {
    for (const bonus of race.ability_bonuses) {
      const key = bonus.ability_score.index.toLowerCase() as Ability;
      raceBonus[key] += bonus.bonus;
    }
  }

  const subrace = args.race.subraceId ? getSubrace(args.race.subraceId) : undefined;
  if (subrace) {
    for (const bonus of subrace.ability_bonuses) {
      const key = bonus.ability_score.index.toLowerCase() as Ability;
      raceBonus[key] += bonus.bonus;
    }
  }

  for (const [ability, bonus] of Object.entries(args.race.abilityChoiceBonuses) as [
    Ability,
    number,
  ][]) {
    raceBonus[ability] += bonus;
  }

  const total: Record<Ability, number> = { ...base };
  const modifier: Record<Ability, number> = { ...base };
  for (const a of ABILITIES) {
    total[a] = base[a] + raceBonus[a];
    modifier[a] = abilityModifier(total[a]);
  }

  return { base, raceBonus, total, modifier };
}

export function deriveSheet(args: {
  race: WizardRace;
  classChoice: WizardClass;
  abilities: WizardAbilities;
}): DerivedSheet {
  const abilities = deriveAbilities(args);
  const klass = args.classChoice.classId ? getClass(args.classChoice.classId) : undefined;
  const level = args.classChoice.level;
  const lvlEntry = klass ? getClassLevel(klass.index, level) : undefined;
  const profBonus = lvlEntry ? lvlEntry.prof_bonus : proficiencyBonus(level);

  const race = args.race.raceId ? getRace(args.race.raceId) : undefined;
  const speed = race?.speed ?? null;

  const conMod = abilities.modifier.con;
  const dexMod = abilities.modifier.dex;
  const hitDie = klass?.hit_die ?? null;
  const hpMax = hitDie ? hitDie + conMod : null;

  // Default unarmored AC (10 + dex). Specific class features (Unarmored Defense)
  // will refine this later via class features at character finalization.
  const ac = 10 + dexMod;

  return {
    abilities,
    level,
    hpMax,
    ac,
    speed,
    initiativeBonus: dexMod,
    profBonus,
    hitDie,
  };
}
