/**
 * Typed views over the 5e SRD JSON data. We only model the fields we use;
 * extra fields in the JSON are ignored. The data uses URL-style references
 * like `/api/2014/races/dwarf` between entities — the loader resolves these
 * to indexes lazily.
 */

export interface ApiReference {
  index: string;
  name: string;
  url: string;
}

export interface AbilityBonus {
  ability_score: ApiReference;
  bonus: number;
}

export interface Choice<T = ApiReference> {
  desc?: string;
  choose: number;
  type?: string;
  from: {
    option_set_type: string;
    options?: T[];
    options_array?: T[];
  };
}

export interface SrdRace {
  index: string;
  name: string;
  speed: number;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  size_description: string;
  age: string;
  alignment: string;
  language_desc: string;
  ability_bonuses: AbilityBonus[];
  ability_bonus_options?: Choice;
  starting_proficiencies: ApiReference[];
  starting_proficiency_options?: Choice;
  languages: ApiReference[];
  language_options?: Choice;
  traits: ApiReference[];
  subraces: ApiReference[];
}

export interface SrdSubrace {
  index: string;
  name: string;
  race: ApiReference;
  desc: string;
  ability_bonuses: AbilityBonus[];
  starting_proficiencies?: ApiReference[];
  languages?: ApiReference[];
  racial_traits: ApiReference[];
}

export interface SrdBackground {
  index: string;
  name: string;
  starting_proficiencies: ApiReference[];
  language_options?: Choice;
  starting_equipment: { equipment: ApiReference; quantity: number }[];
  starting_equipment_options?: Choice<unknown>[];
  feature: { name: string; desc: string[] };
  personality_traits?: Choice<{ option_type: string; string: string }>;
  ideals?: Choice<{ option_type: string; desc: string; alignments?: ApiReference[] }>;
  bonds?: Choice<{ option_type: string; string: string }>;
  flaws?: Choice<{ option_type: string; string: string }>;
}

export interface SrdSkill {
  index: string;
  name: string;
  desc: string[];
  ability_score: ApiReference;
}

export interface SrdCondition {
  index: string;
  name: string;
  desc: string[];
}

export interface SrdAbilityScore {
  index: string;
  name: string;
  full_name: string;
  desc: string[];
  skills: ApiReference[];
}

export interface SrdLanguage {
  index: string;
  name: string;
  type: "Standard" | "Exotic";
  typical_speakers: string[];
  script: string;
}

export interface SrdAlignment {
  index: string;
  name: string;
  abbreviation: string;
  desc: string;
}

export interface SrdMagicSchool {
  index: string;
  name: string;
  desc: string;
}

export interface SrdDamageType {
  index: string;
  name: string;
  desc: string[];
}

export interface SrdWeaponProperty {
  index: string;
  name: string;
  desc: string[];
}

export interface SrdTrait {
  index: string;
  name: string;
  desc: string[];
  races?: ApiReference[];
  subraces?: ApiReference[];
}

export interface SrdFeature {
  index: string;
  name: string;
  desc: string[];
  level: number;
  class: ApiReference;
  subclass?: ApiReference;
  feature_specific?: unknown;
  prerequisites?: unknown[];
}

export interface SrdProficiency {
  index: string;
  name: string;
  type: string;
  classes: ApiReference[];
  races: ApiReference[];
  references?: ApiReference[];
}

export interface SrdEquipment {
  index: string;
  name: string;
  equipment_category: ApiReference;
  weapon_category?: string;
  weapon_range?: "Melee" | "Ranged";
  category_range?: string;
  cost: { quantity: number; unit: string };
  weight?: number;
  damage?: {
    damage_dice: string;
    damage_type: ApiReference;
  };
  range?: { normal: number; long?: number };
  properties?: ApiReference[];
  armor_category?: string;
  armor_class?: { base: number; dex_bonus?: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  desc?: string[];
  /** Adventuring gear bundles can contain other items. */
  contents?: { item: ApiReference; quantity: number }[];
}

export interface SrdClass {
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices: Choice[];
  proficiencies: ApiReference[];
  saving_throws: ApiReference[];
  starting_equipment: { equipment: ApiReference; quantity: number }[];
  starting_equipment_options: Choice<unknown>[];
  class_levels: string;
  multi_classing?: unknown;
  subclasses: ApiReference[];
  spellcasting?: unknown;
}

export interface SrdSubclass {
  index: string;
  name: string;
  class: ApiReference;
  subclass_flavor: string;
  desc: string[];
  subclass_levels: string;
}

export interface SrdClassLevel {
  index: string;
  level: number;
  ability_score_bonuses: number;
  prof_bonus: number;
  features: ApiReference[];
  class: ApiReference;
  subclass?: ApiReference;
  spellcasting?: {
    cantrips_known?: number;
    spells_known?: number;
    spell_slots_level_1?: number;
    spell_slots_level_2?: number;
    spell_slots_level_3?: number;
    spell_slots_level_4?: number;
    spell_slots_level_5?: number;
    spell_slots_level_6?: number;
    spell_slots_level_7?: number;
    spell_slots_level_8?: number;
    spell_slots_level_9?: number;
  };
  class_specific?: Record<string, number | string>;
}

export interface SrdSpell {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: "melee" | "ranged";
  damage?: {
    damage_type?: ApiReference;
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  };
  dc?: {
    dc_type: ApiReference;
    dc_success: string;
  };
  school: ApiReference;
  classes: ApiReference[];
  subclasses?: ApiReference[];
}

export interface SrdMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class: { type: string; value: number }[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies?: { proficiency: ApiReference; value: number }[];
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: ApiReference[];
  senses?: Record<string, string>;
  languages?: string;
  challenge_rating: number;
  proficiency_bonus: number;
  xp: number;
  special_abilities?: { name: string; desc: string }[];
  actions?: {
    name: string;
    desc: string;
    attack_bonus?: number;
    damage?: unknown[];
    dc?: unknown;
  }[];
  legendary_actions?: { name: string; desc: string }[];
}
