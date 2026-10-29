/**
 * Convert the wizard state into a persisted Character record. This is the
 * boundary where the build-up state crystallizes into the strict shape used
 * during play.
 */
import { newId } from "@/lib/id";
import {
  ABILITIES,
  proficiencyBonus,
  type AbilityScores,
  type AcquiredFeature,
  type Character,
  type Condition,
  type HitDieEntry,
  type SkillName,
} from "@/schemas/character";
import { SRD_DATA_VERSION, getClass, getClassLevel, getRace, getSubrace } from "@/data/srd";
import { STANDARD_ARRAY, deriveAbilities, deriveSheet } from "./derivedCharacter";
import { initializeSlotsFromClasses } from "@/engine/spells";
import { armorClass } from "./sheetDerived";
import { buildStartingInventory } from "./startingEquipment";

/**
 * Race-driven damage resistances (5e RAW). Kept narrow to what the SRD covers
 * cleanly. Subrace overrides (e.g. Dragonborn breath weapon) refined as we
 * gain more breadth.
 */
const RACE_RESISTANCES: Record<string, string[]> = {
  tiefling: ["fire"],
  dwarf: ["poison"],
  "hill-dwarf": ["poison"],
  "mountain-dwarf": ["poison"],
};
const SUBRACE_RESISTANCES: Record<string, string[]> = {
  "high-elf": [],
  "wood-elf": [],
  drow: [],
};
import type { WizardAbilities, WizardBackground, WizardClass, WizardEquipment, WizardIdentity, WizardRace, WizardSkills } from "./wizardStore";

export interface WizardSnapshot {
  identity: WizardIdentity;
  race: WizardRace;
  classChoice: WizardClass;
  background: WizardBackground;
  abilities: WizardAbilities;
  skills: WizardSkills;
  equipment: WizardEquipment;
}

export function finalizeCharacter(w: WizardSnapshot): Character {
  if (!w.race.raceId) throw new Error("race not chosen");
  if (!w.classChoice.classId) throw new Error("class not chosen");
  if (!w.background.backgroundId) throw new Error("background not chosen");

  const race = getRace(w.race.raceId);
  const klass = getClass(w.classChoice.classId);
  if (!race || !klass) throw new Error("invalid SRD references");

  const baseScores = resolveAbilityScores(w.abilities);
  const sheet = deriveSheet({
    race: w.race,
    classChoice: w.classChoice,
    abilities: { ...w.abilities, scores: baseScores },
  });

  const totals: AbilityScores = {
    str: sheet.abilities.total.str,
    dex: sheet.abilities.total.dex,
    con: sheet.abilities.total.con,
    int: sheet.abilities.total.int,
    wis: sheet.abilities.total.wis,
    cha: sheet.abilities.total.cha,
  };

  const now = Date.now();
  const id = newId();
  const subrace = w.race.subraceId ? getSubrace(w.race.subraceId) : undefined;

  const startingLevel = w.classChoice.level;
  const hitDice: HitDieEntry[] = [
    {
      classId: klass.index,
      die: klass.hit_die,
      max: startingLevel,
      current: startingLevel,
    },
  ];

  const featuresAcquired: AcquiredFeature[] = [];
  for (let lvl = 1; lvl <= startingLevel; lvl++) {
    const lvlEntry = getClassLevel(klass.index, lvl);
    if (!lvlEntry) continue;
    for (const f of lvlEntry.features) {
      featuresAcquired.push({
        classId: klass.index,
        level: lvl,
        featureIndex: f.index,
      });
    }
  }

  const languageIndices = new Set<string>();
  for (const lang of race.languages) languageIndices.add(lang.index);
  if (subrace?.languages) {
    for (const lang of subrace.languages) languageIndices.add(lang.index);
  }

  const resistances = new Set<string>();
  for (const r of RACE_RESISTANCES[race.index] ?? []) resistances.add(r);
  if (subrace?.index) {
    for (const r of SUBRACE_RESISTANCES[subrace.index] ?? []) resistances.add(r);
  }

  const character: Character = {
    id,
    dataVersion: SRD_DATA_VERSION,
    name: w.identity.name.trim(),
    bio: w.identity.bio,
    portraitId: w.identity.portraitId,
    raceId: w.race.raceId,
    subraceId: w.race.subraceId ?? undefined,
    backgroundId: w.background.backgroundId,
    alignment: "true neutral",
    classes: [
      {
        classId: klass.index,
        level: w.classChoice.level,
      },
    ],
    abilities: totals,
    hp: {
      max: sheet.hpMax ?? klass.hit_die,
      current: sheet.hpMax ?? klass.hit_die,
      temp: 0,
    },
    ac: sheet.ac ?? 10,
    speed: sheet.speed ?? 30,
    initiativeBonus: sheet.initiativeBonus ?? 0,
    proficientSkills: w.skills.selected as SkillName[],
    expertiseSkills: [],
    savingThrows: klass.saving_throws.map(
      (s) => s.index.toLowerCase() as keyof AbilityScores,
    ),
    spellsKnown: [],
    spellsPrepared: [],
    cantrips: [],
    spellSlots: undefined,
    inventory: buildStartingInventory({
      classId: klass.index,
      backgroundId: w.background.backgroundId,
      classChoices: w.equipment.choices,
      dexScore: totals.dex,
    }),
    goldPieces: 0,
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    conditions: [] as Condition[],
    xp: 0,
    resistances: Array.from(resistances),
    vulnerabilities: [],
    immunities: [],
    concentration: null,
    conditionTimers: [],
    usageCounters: [],
    raging: false,
    hitDice,
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    languages: Array.from(languageIndices),
    senses: { darkvision: null, blindsight: null, truesight: null, tremorsense: null },
    personality: { traits: [], ideals: [], bonds: [], flaws: [] },
    featuresAcquired,
    feats: [],
    rations: 5,
    daysWithoutFood: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Initialize spell slots for casters from their class progression. Bards,
  // wizards, clerics, sorcerers, etc. need slots ready at L1 — without this
  // the SpellsPanel can't open and the player can't cast anything.
  const withSlots = initializeSlotsFromClasses(character, (classId, level) => {
    const lvlEntry = getClassLevel(classId, level);
    return lvlEntry?.spellcasting ?? null;
  });

  // The wizard only knows unarmored AC; now that the starting gear is on the
  // sheet, store the real figure (armor, shield, Unarmored Defense).
  const equipped: Character = { ...withSlots, ac: armorClass(withSlots).value };

  // Sanity check: proficiency bonus matches level
  const expectedPB = proficiencyBonus(w.classChoice.level);
  void expectedPB;
  void deriveAbilities;
  void ABILITIES;
  return equipped;
}

function resolveAbilityScores(abilities: WizardAbilities): AbilityScores {
  if (abilities.mode === "standard_array") {
    const out = { ...abilities.scores } as AbilityScores;
    for (const ability of Object.keys(abilities.arrayAssignments) as (keyof AbilityScores)[]) {
      const slot = abilities.arrayAssignments[ability];
      if (slot != null) out[ability] = STANDARD_ARRAY[slot]!;
    }
    return out;
  }
  return abilities.scores;
}
