/**
 * Synchronous accessors over the bundled SRD data. Spells and monsters are
 * loaded lazily — see `src/data/srd/lazy.ts`.
 *
 * Source: 5e-bits/5e-database (OGL 1.0a). See ATTRIBUTION.md.
 */
import racesJson from "./races.json";
import subracesJson from "./subraces.json";
import backgroundsJson from "./backgrounds.json";
import classesJson from "./classes.json";
import subclassesJson from "./subclasses.json";
import levelsJson from "./levels.json";
import skillsJson from "./skills.json";
import conditionsJson from "./conditions.json";
import damageTypesJson from "./damage-types.json";
import magicSchoolsJson from "./magic-schools.json";
import languagesJson from "./languages.json";
import equipmentJson from "./equipment.json";
import weaponPropertiesJson from "./weapon-properties.json";
import traitsJson from "./traits.json";
import featuresJson from "./features.json";
import proficienciesJson from "./proficiencies.json";
import abilityScoresJson from "./ability-scores.json";
import alignmentsJson from "./alignments.json";

import type {
  ApiReference,
  SrdAbilityScore,
  SrdAlignment,
  SrdBackground,
  SrdClass,
  SrdClassLevel,
  SrdCondition,
  SrdDamageType,
  SrdEquipment,
  SrdFeature,
  SrdLanguage,
  SrdMagicSchool,
  SrdProficiency,
  SrdRace,
  SrdSkill,
  SrdSubclass,
  SrdSubrace,
  SrdTrait,
  SrdWeaponProperty,
} from "./types";

export const SRD_DATA_VERSION = "5e-bits/5e-database@2014" as const;

export const races = racesJson as unknown as SrdRace[];
export const subraces = subracesJson as unknown as SrdSubrace[];
export const backgrounds = backgroundsJson as unknown as SrdBackground[];
export const classes = classesJson as unknown as SrdClass[];
export const subclasses = subclassesJson as unknown as SrdSubclass[];
export const classLevels = levelsJson as unknown as SrdClassLevel[];
export const skills = skillsJson as unknown as SrdSkill[];
export const conditions = conditionsJson as unknown as SrdCondition[];
export const damageTypes = damageTypesJson as unknown as SrdDamageType[];
export const magicSchools = magicSchoolsJson as unknown as SrdMagicSchool[];
export const languages = languagesJson as unknown as SrdLanguage[];
export const equipment = equipmentJson as unknown as SrdEquipment[];
export const weaponProperties = weaponPropertiesJson as unknown as SrdWeaponProperty[];
export const traits = traitsJson as unknown as SrdTrait[];
export const features = featuresJson as unknown as SrdFeature[];
export const proficiencies = proficienciesJson as unknown as SrdProficiency[];
export const abilityScores = abilityScoresJson as unknown as SrdAbilityScore[];
export const alignments = alignmentsJson as unknown as SrdAlignment[];

// --- Indexes (built once) ---

const byIndex = <T extends { index: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((item) => [item.index, item]));

const RACE_INDEX = byIndex(races);
const SUBRACE_INDEX = byIndex(subraces);
const BACKGROUND_INDEX = byIndex(backgrounds);
const CLASS_INDEX = byIndex(classes);
const SUBCLASS_INDEX = byIndex(subclasses);
const SKILL_INDEX = byIndex(skills);
const CONDITION_INDEX = byIndex(conditions);
const EQUIPMENT_INDEX = byIndex(equipment);
const FEATURE_INDEX = byIndex(features);
const TRAIT_INDEX = byIndex(traits);
const LANGUAGE_INDEX = byIndex(languages);
const ALIGNMENT_INDEX = byIndex(alignments);

const CLASS_LEVELS_BY_CLASS: Map<string, SrdClassLevel[]> = (() => {
  const m = new Map<string, SrdClassLevel[]>();
  for (const lvl of classLevels) {
    if (lvl.subclass) continue; // skip subclass-specific level entries for now
    const id = lvl.class.index;
    const list = m.get(id) ?? [];
    list.push(lvl);
    m.set(id, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.level - b.level);
  return m;
})();

const SUBRACES_BY_RACE: Map<string, SrdSubrace[]> = (() => {
  const m = new Map<string, SrdSubrace[]>();
  for (const sub of subraces) {
    const id = sub.race.index;
    const list = m.get(id) ?? [];
    list.push(sub);
    m.set(id, list);
  }
  return m;
})();

// --- Accessors ---

export function getRace(index: string): SrdRace | undefined {
  return RACE_INDEX.get(index);
}
export function getSubrace(index: string): SrdSubrace | undefined {
  return SUBRACE_INDEX.get(index);
}
export function getSubracesForRace(raceIndex: string): SrdSubrace[] {
  return SUBRACES_BY_RACE.get(raceIndex) ?? [];
}
export function getBackground(index: string): SrdBackground | undefined {
  return BACKGROUND_INDEX.get(index);
}
export function getClass(index: string): SrdClass | undefined {
  return CLASS_INDEX.get(index);
}
export function getSubclass(index: string): SrdSubclass | undefined {
  return SUBCLASS_INDEX.get(index);
}
export function getClassLevel(classIndex: string, level: number): SrdClassLevel | undefined {
  return CLASS_LEVELS_BY_CLASS.get(classIndex)?.find((l) => l.level === level);
}
export function getClassLevels(classIndex: string): SrdClassLevel[] {
  return CLASS_LEVELS_BY_CLASS.get(classIndex) ?? [];
}
export function getSkill(index: string): SrdSkill | undefined {
  return SKILL_INDEX.get(index);
}
export function getCondition(index: string): SrdCondition | undefined {
  return CONDITION_INDEX.get(index);
}
export function getEquipment(index: string): SrdEquipment | undefined {
  return EQUIPMENT_INDEX.get(index);
}
export function getFeature(index: string): SrdFeature | undefined {
  return FEATURE_INDEX.get(index);
}
export function getTrait(index: string): SrdTrait | undefined {
  return TRAIT_INDEX.get(index);
}
export function getLanguage(index: string): SrdLanguage | undefined {
  return LANGUAGE_INDEX.get(index);
}
export function getAlignment(index: string): SrdAlignment | undefined {
  return ALIGNMENT_INDEX.get(index);
}

/**
 * Resolve an `ApiReference` to its concrete record. Returns `undefined` when
 * the type can't be inferred from the URL (e.g., features in unfamiliar paths).
 */
export function resolveRef<T extends { index: string }>(
  ref: Pick<ApiReference, "index" | "url">,
  index: ReadonlyMap<string, T>,
): T | undefined {
  return index.get(ref.index);
}
