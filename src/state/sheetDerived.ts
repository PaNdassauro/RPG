/**
 * Pure derivations over a finalized `Character`. Used by the in-game character
 * sheet drawer, CharacterCrest, and the level-up flow. All functions are
 * synchronous and side-effect free — recompute as needed; no caching.
 */
import {
  getClass,
  getClassLevel,
  getClassLevels,
  getEquipment,
  getFeature,
  getSkill,
} from "@/data/srd";
import type { SrdClassLevel, SrdEquipment, SrdFeature } from "@/data/srd/types";
import { effectiveHpMax } from "@/engine/conditions";
import {
  abilityModifier,
  proficiencyBonus,
  totalLevel,
  SKILL_TO_ABILITY,
  SKILLS,
  type Ability,
  type Character,
  type ClassEntry,
  type SkillName,
} from "@/schemas/character";

// --- Basics ---------------------------------------------------------------

export function characterLevel(char: Character): number {
  return totalLevel(char);
}

export function characterProfBonus(char: Character): number {
  return proficiencyBonus(characterLevel(char));
}

export function abilityMod(char: Character, ability: Ability): number {
  return abilityModifier(char.abilities[ability]);
}

// --- Skills ---------------------------------------------------------------

export interface SkillModifier {
  skill: SkillName;
  ability: Ability;
  abilityMod: number;
  profBonus: number;
  isProficient: boolean;
  hasExpertise: boolean;
  total: number;
}

export function skillModifier(char: Character, skill: SkillName): SkillModifier {
  const ability = SKILL_TO_ABILITY[skill];
  const aMod = abilityMod(char, ability);
  const profBonus = characterProfBonus(char);
  const isProficient = char.proficientSkills.includes(skill);
  const hasExpertise = char.expertiseSkills.includes(skill);
  const profContribution = hasExpertise ? profBonus * 2 : isProficient ? profBonus : 0;
  return {
    skill,
    ability,
    abilityMod: aMod,
    profBonus,
    isProficient,
    hasExpertise,
    total: aMod + profContribution,
  };
}

export function allSkillModifiers(char: Character): SkillModifier[] {
  return SKILLS.map((s) => skillModifier(char, s));
}

// --- Saving throws --------------------------------------------------------

export interface SaveModifier {
  ability: Ability;
  abilityMod: number;
  profBonus: number;
  isProficient: boolean;
  total: number;
}

export function savingThrowModifier(char: Character, ability: Ability): SaveModifier {
  const aMod = abilityMod(char, ability);
  const profBonus = characterProfBonus(char);
  const isProficient = char.savingThrows.includes(ability);
  return {
    ability,
    abilityMod: aMod,
    profBonus,
    isProficient,
    total: aMod + (isProficient ? profBonus : 0),
  };
}

// --- Passive perception ---------------------------------------------------

export function passivePerception(char: Character): number {
  const perc = skillModifier(char, "perception");
  return 10 + perc.total;
}

// --- Armor class ----------------------------------------------------------

interface ArmorBreakdownPart {
  label: string;
  value: number;
}

export interface ArmorClass {
  value: number;
  parts: ArmorBreakdownPart[];
  source: "armor" | "unarmoredDefense" | "default";
}

function unarmoredDefenseForClass(char: Character): { ability: Ability; classId: string } | null {
  for (const c of char.classes) {
    if (c.classId === "monk") return { ability: "wis", classId: "monk" };
    if (c.classId === "barbarian") return { ability: "con", classId: "barbarian" };
  }
  return null;
}

function findEquippedArmor(char: Character): SrdEquipment | null {
  for (const item of char.inventory) {
    if (!item.equipped || !item.srdRef) continue;
    const eq = getEquipment(item.srdRef);
    if (!eq) continue;
    const cat = eq.armor_category;
    if (cat && cat !== "Shield") return eq;
  }
  return null;
}

function hasEquippedShield(char: Character): boolean {
  for (const item of char.inventory) {
    if (!item.equipped || !item.srdRef) continue;
    const eq = getEquipment(item.srdRef);
    if (eq?.armor_category === "Shield") return true;
  }
  return false;
}

export function armorClass(char: Character): ArmorClass {
  const dexMod = abilityMod(char, "dex");
  const armor = findEquippedArmor(char);
  const shield = hasEquippedShield(char);
  const shieldBonus = shield ? 2 : 0;

  if (armor && armor.armor_class) {
    const base = armor.armor_class.base;
    const dexAllowed = armor.armor_class.dex_bonus !== false;
    const dexCap = armor.armor_class.max_bonus;
    let dexUsed = 0;
    if (dexAllowed) {
      dexUsed = typeof dexCap === "number" ? Math.min(dexMod, dexCap) : dexMod;
    }
    const parts: ArmorBreakdownPart[] = [
      { label: armor.name, value: base },
      { label: "DEX", value: dexUsed },
    ];
    if (shieldBonus) parts.push({ label: "Escudo", value: shieldBonus });
    return {
      value: base + dexUsed + shieldBonus,
      parts,
      source: "armor",
    };
  }

  // Unarmored — try class-specific Unarmored Defense.
  const ud = unarmoredDefenseForClass(char);
  if (ud) {
    const otherMod = abilityMod(char, ud.ability);
    const parts: ArmorBreakdownPart[] = [
      { label: "Base", value: 10 },
      { label: "DEX", value: dexMod },
      { label: ud.ability.toUpperCase(), value: otherMod },
    ];
    if (shieldBonus) parts.push({ label: "Escudo", value: shieldBonus });
    return {
      value: 10 + dexMod + otherMod + shieldBonus,
      parts,
      source: "unarmoredDefense",
    };
  }

  const parts: ArmorBreakdownPart[] = [
    { label: "Base", value: 10 },
    { label: "DEX", value: dexMod },
  ];
  if (shieldBonus) parts.push({ label: "Escudo", value: shieldBonus });
  return {
    value: 10 + dexMod + shieldBonus,
    parts,
    source: "default",
  };
}

// --- Attacks --------------------------------------------------------------

export interface AttackEntry {
  id: string;
  name: string;
  source: "weapon" | "unarmed";
  ability: Ability;
  toHit: number;
  damage: {
    dice: string;
    mod: number;
    type: string;
  };
  damageVersatile?: { dice: string; mod: number };
  properties: string[];
  range: { kind: "melee"; reach: number } | { kind: "ranged"; normal: number; long: number | null };
}

function weaponAbility(eq: SrdEquipment): Ability {
  const propIndices = (eq.properties ?? []).map((p) => p.index);
  if (eq.weapon_range === "Ranged") {
    return propIndices.includes("thrown") ? "str" : "dex";
  }
  if (propIndices.includes("finesse")) return "dex";
  return "str";
}

function isProficientWith(char: Character, eq: SrdEquipment): boolean {
  // Coarse heuristic: SRD classes grant proficiency with "simple weapons" or
  // "martial weapons" + a few specific picks. We don't yet track these on the
  // Character, so we conservatively assume proficiency. The DM can override
  // narratively. Refine later when proficiencies are tracked at character
  // level.
  void char;
  void eq;
  return true;
}

function martialArtsDie(monkLevel: number): number {
  if (monkLevel >= 17) return 10;
  if (monkLevel >= 11) return 8;
  if (monkLevel >= 5) return 6;
  return 4;
}

export function attacks(char: Character): AttackEntry[] {
  const list: AttackEntry[] = [];
  const profBonus = characterProfBonus(char);
  const strMod = abilityMod(char, "str");
  const dexMod = abilityMod(char, "dex");

  for (const item of char.inventory) {
    if (!item.equipped || !item.srdRef) continue;
    const eq = getEquipment(item.srdRef);
    if (!eq?.damage) continue;
    const ability = weaponAbility(eq);
    const aMod = abilityMod(char, ability);
    const prof = isProficientWith(char, eq) ? profBonus : 0;
    const props = (eq.properties ?? []).map((p) => p.name);

    let range: AttackEntry["range"];
    if (eq.weapon_range === "Ranged") {
      range = {
        kind: "ranged",
        normal: eq.range?.normal ?? 0,
        long: eq.range?.long ?? null,
      };
    } else {
      const reach = (eq.properties ?? []).some((p) => p.index === "reach") ? 10 : 5;
      range = { kind: "melee", reach };
    }

    const entry: AttackEntry = {
      id: item.id,
      name: item.name || eq.name,
      source: "weapon",
      ability,
      toHit: aMod + prof,
      damage: {
        dice: eq.damage.damage_dice,
        mod: aMod,
        type: eq.damage.damage_type.name,
      },
      properties: props,
      range,
    };

    // Versatile: SRD encodes the two-handed die in the property's name parsing
    // is unreliable, so we leave it off the auto-list for now and let the
    // player toggle in UI when implemented.
    list.push(entry);
  }

  // Natural attack: unarmed strike (always available).
  const monk = char.classes.find((c) => c.classId === "monk");
  const usesMartialArts = !!monk;
  const martialDie = monk ? martialArtsDie(monk.level) : null;
  const unarmedAbility: Ability = usesMartialArts && dexMod > strMod ? "dex" : "str";
  const unarmedMod = abilityMod(char, unarmedAbility);
  list.push({
    id: "natural-unarmed",
    name: usesMartialArts ? "Golpe Marcial (desarmado)" : "Ataque desarmado",
    source: "unarmed",
    ability: unarmedAbility,
    toHit: unarmedMod + profBonus,
    damage: {
      dice: martialDie ? `1d${martialDie}` : "1",
      mod: unarmedMod,
      type: "bludgeoning",
    },
    properties: usesMartialArts ? ["Artes Marciais"] : [],
    range: { kind: "melee", reach: 5 },
  });

  return list;
}

// --- Spellcasting ---------------------------------------------------------

interface ClassSpellcasting {
  ability: Ability;
  classId: string;
}

const SPELLCASTING_ABILITY: Record<string, Ability> = {
  wizard: "int",
  cleric: "wis",
  druid: "wis",
  bard: "cha",
  sorcerer: "cha",
  warlock: "cha",
  paladin: "cha",
  ranger: "wis",
};

function primarySpellcasterClass(char: Character): ClassSpellcasting | null {
  for (const c of char.classes) {
    const ability = SPELLCASTING_ABILITY[c.classId];
    if (ability) {
      const srdClass = getClass(c.classId);
      if (srdClass?.spellcasting) {
        return { ability, classId: c.classId };
      }
    }
  }
  return null;
}

export interface SpellSlotInfo {
  level: number;
  max: number;
}

export interface SpellcastingInfo {
  ability: Ability;
  abilityMod: number;
  profBonus: number;
  saveDc: number;
  attackBonus: number;
  slots: SpellSlotInfo[];
  cantripsKnown: number | null;
  spellsKnown: number | null;
}

export function spellcasting(char: Character): SpellcastingInfo | null {
  const primary = primarySpellcasterClass(char);
  if (!primary) return null;
  const classEntry = char.classes.find((c) => c.classId === primary.classId);
  if (!classEntry) return null;
  const lvlEntry = getClassLevel(primary.classId, classEntry.level);
  if (!lvlEntry?.spellcasting) {
    return {
      ability: primary.ability,
      abilityMod: abilityMod(char, primary.ability),
      profBonus: characterProfBonus(char),
      saveDc: 8 + characterProfBonus(char) + abilityMod(char, primary.ability),
      attackBonus: characterProfBonus(char) + abilityMod(char, primary.ability),
      slots: [],
      cantripsKnown: null,
      spellsKnown: null,
    };
  }
  const sc = lvlEntry.spellcasting;
  const slots: SpellSlotInfo[] = [];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const key = `spell_slots_level_${lvl}` as keyof typeof sc;
    const max = (sc[key] as number | undefined) ?? 0;
    if (max > 0) slots.push({ level: lvl, max });
  }
  const aMod = abilityMod(char, primary.ability);
  const prof = characterProfBonus(char);
  return {
    ability: primary.ability,
    abilityMod: aMod,
    profBonus: prof,
    saveDc: 8 + prof + aMod,
    attackBonus: prof + aMod,
    slots,
    cantripsKnown: sc.cantrips_known ?? null,
    spellsKnown: sc.spells_known ?? null,
  };
}

// --- Class features unlocked ---------------------------------------------

export interface UnlockedFeature {
  classId: string;
  level: number;
  feature: SrdFeature;
}

export function unlockedFeatures(char: Character): UnlockedFeature[] {
  const out: UnlockedFeature[] = [];
  for (const acq of char.featuresAcquired ?? []) {
    const feature = getFeature(acq.featureIndex);
    if (feature) out.push({ classId: acq.classId, level: acq.level, feature });
  }
  // Stable sort: classId asc, level asc.
  out.sort((a, b) => {
    if (a.classId !== b.classId) return a.classId.localeCompare(b.classId);
    return a.level - b.level;
  });
  return out;
}

// --- Level-up helpers -----------------------------------------------------

/**
 * Returns the features granted at the given class level (the *new* ones for
 * advancing from level N-1 to N). Used by the level-up modal to preview /
 * register newly unlocked abilities.
 */
export function featuresForClassLevel(classId: string, level: number): SrdFeature[] {
  const lvlEntry = getClassLevel(classId, level);
  if (!lvlEntry) return [];
  return lvlEntry.features
    .map((ref) => getFeature(ref.index))
    .filter((f): f is SrdFeature => !!f);
}

/** Average hit-die roll (e.g., d8 → 5). Used as HP gain at level up. */
export function averageHitDieGain(die: number, conMod: number): number {
  return Math.floor(die / 2) + 1 + conMod;
}

/** Ability score levels per class (when ASI is granted). */
export const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

/** Levels at which a subclass is chosen (rough SRD averages — most are L3). */
export const SUBCLASS_LEVEL_BY_CLASS: Record<string, number> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
};

export function isAsiLevel(level: number): boolean {
  return ASI_LEVELS.has(level);
}

export function isSubclassPickLevel(classId: string, level: number): boolean {
  return SUBCLASS_LEVEL_BY_CLASS[classId] === level;
}

/** Lookup helper re-exported so consumers don't need a second import. */
export function getClassLevelInfo(classId: string, level: number): SrdClassLevel | undefined {
  return getClassLevel(classId, level);
}

export function getAllClassLevels(classId: string): SrdClassLevel[] {
  return getClassLevels(classId);
}

/** Convenience: locate a specific ClassEntry by classId on a character. */
export function findClassEntry(char: Character, classId: string): ClassEntry | undefined {
  return char.classes.find((c) => c.classId === classId);
}

/** Sum total hit dice maximum across all classes (= character level). */
export function totalHitDiceMax(char: Character): number {
  return (char.hitDice ?? []).reduce((sum, h) => sum + h.max, 0);
}

/**
 * Number of attacks the player gets per Attack action. Default 1; +1 for each
 * "extra-attack" feature (Fighter L5, L11, L20; Barbarian/Paladin/Ranger L5;
 * Monk Extra Attack at L5). The SRD encodes scaling Fighter as separate
 * "extra-attack" + "extra-attack-2" + "extra-attack-3" features.
 */
export function attacksPerAction(char: Character): number {
  let attacks = 1;
  for (const acq of char.featuresAcquired ?? []) {
    // SRD feature indices: "extra-attack", "extra-attack-2", "extra-attack-3"
    if (acq.featureIndex === "extra-attack") attacks = Math.max(attacks, 2);
    else if (acq.featureIndex === "extra-attack-2") attacks = Math.max(attacks, 3);
    else if (acq.featureIndex === "extra-attack-3") attacks = Math.max(attacks, 4);
  }
  return attacks;
}

/** Get the SrdSkill record for a SkillName (re-export with mapping). */
export function getSkillData(skill: SkillName) {
  // Map our camelCase SkillName → SRD's kebab-case index where they differ.
  const SKILL_INDEX_MAP: Partial<Record<SkillName, string>> = {
    animalHandling: "animal-handling",
    sleightOfHand: "sleight-of-hand",
  };
  const idx = SKILL_INDEX_MAP[skill] ?? skill;
  return getSkill(idx);
}

// --- Hit points -----------------------------------------------------------

/** HP ceiling for healing/rest: halved at exhaustion level 4+ (SRD). */
export function effectiveMaxHp(char: Character): number {
  return effectiveHpMax(char.hp.max, char.conditions);
}
