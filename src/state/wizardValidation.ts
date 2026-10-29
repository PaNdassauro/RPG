import { getRace, getClass } from "@/data/srd";
import { ABILITIES, type Ability, type SkillName } from "@/schemas/character";
import { pointBuyRemaining, STANDARD_ARRAY } from "./derivedCharacter";
import type { WizardStep } from "./wizardStore";

interface WizardSnapshot {
  identity: { name: string };
  race: {
    raceId: string | null;
    subraceId: string | null;
    abilityChoiceBonuses: Partial<Record<Ability, number>>;
  };
  classChoice: { classId: string | null };
  background: { backgroundId: string | null };
  abilities: {
    mode: "point_buy" | "standard_array" | "manual";
    scores: Record<Ability, number>;
    arrayAssignments: Partial<Record<Ability, number>>;
    manualRolls: number[];
  };
  skills: { selected: SkillName[] };
  equipment: { choices: number[] };
}

export function isStepComplete(step: WizardStep, w: WizardSnapshot): boolean {
  switch (step) {
    case "identity":
      return w.identity.name.trim().length > 0;
    case "race":
      return isRaceComplete(w);
    case "class":
      return !!w.classChoice.classId;
    case "background":
      return !!w.background.backgroundId;
    case "abilities":
      return isAbilitiesComplete(w);
    case "skills":
      return isSkillsComplete(w);
    case "equipment":
      return isEquipmentComplete(w);
    case "review":
      return true;
  }
}

function isRaceComplete(w: WizardSnapshot): boolean {
  if (!w.race.raceId) return false;
  const race = getRace(w.race.raceId);
  if (!race) return false;

  const subraceCount = race.subraces?.length ?? 0;
  if (subraceCount > 0 && !w.race.subraceId) return false;

  // Some races (Half-Elf) require choosing extra ability bonuses.
  if (race.ability_bonus_options) {
    const need = race.ability_bonus_options.choose;
    const chosen = Object.keys(w.race.abilityChoiceBonuses).length;
    if (chosen < need) return false;
  }
  return true;
}

function isAbilitiesComplete(w: WizardSnapshot): boolean {
  if (w.abilities.mode === "standard_array") {
    // every ability must have an assignment
    return ABILITIES.every((a) => w.abilities.arrayAssignments[a] != null);
  }
  if (w.abilities.mode === "point_buy") {
    return pointBuyRemaining(w.abilities.scores) === 0;
  }
  // manual: every score must be a positive integer (assigned)
  return ABILITIES.every((a) => w.abilities.scores[a] > 0);
}

function isSkillsComplete(w: WizardSnapshot): boolean {
  const klass = w.classChoice.classId ? getClass(w.classChoice.classId) : null;
  if (!klass) return false;
  const skillChoice = klass.proficiency_choices.find((c) =>
    c.from.options?.some((o) =>
      typeof o === "object" && o !== null && "item" in o,
    ),
  );
  // Simpler: total selected count must equal class skill budget. Class skill
  // budget is the `choose` of the first proficiency_choices entry that
  // restricts to skills. In 5e SRD shape the first entry is typically skills.
  const need = klass.proficiency_choices[0]?.choose ?? 0;
  void skillChoice;
  return w.skills.selected.length === need;
}

function isEquipmentComplete(w: WizardSnapshot): boolean {
  const klass = w.classChoice.classId ? getClass(w.classChoice.classId) : null;
  if (!klass) return false;
  const groups = klass.starting_equipment_options ?? [];
  return groups.every((_, i) => w.equipment.choices[i] != null);
}

export function isStandardArrayValid(
  assignments: Partial<Record<Ability, number>>,
): boolean {
  const used = new Set(Object.values(assignments));
  return used.size === STANDARD_ARRAY.length && ABILITIES.every((a) => assignments[a] != null);
}
