import { z } from "zod";

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS = [
  "acrobatics",
  "animalHandling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleightOfHand",
  "stealth",
  "survival",
] as const;
export type SkillName = (typeof SKILLS)[number];

export const SKILL_TO_ABILITY: Record<SkillName, Ability> = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
};

export const AbilityScoresSchema = z.object({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});
export type AbilityScores = z.infer<typeof AbilityScoresSchema>;

export const ConditionSchema = z.enum([
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
  "exhaustion1",
  "exhaustion2",
  "exhaustion3",
  "exhaustion4",
  "exhaustion5",
  "exhaustion6",
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  srdRef: z.string().optional(),
  name: z.string(),
  qty: z.number().int().min(1).default(1),
  equipped: z.boolean().default(false),
  attuned: z.boolean().default(false),
  notes: z.string().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const SpellSlotsSchema = z.object({
  l1: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l2: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l3: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l4: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l5: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l6: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l7: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l8: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
  l9: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }),
});
export type SpellSlots = z.infer<typeof SpellSlotsSchema>;

export const ClassEntrySchema = z.object({
  classId: z.string(),
  subclassId: z.string().optional(),
  level: z.number().int().min(1).max(20),
});
export type ClassEntry = z.infer<typeof ClassEntrySchema>;

export const HitDieEntrySchema = z.object({
  classId: z.string(),
  die: z.number().int(),
  max: z.number().int().min(0),
  current: z.number().int().min(0),
});
export type HitDieEntry = z.infer<typeof HitDieEntrySchema>;

export const DeathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
  /** True once stabilized at 0 HP: no death saves until healed or hurt again. */
  stable: z.boolean().optional(),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const SensesSchema = z.object({
  darkvision: z.number().int().nullable().default(null),
  blindsight: z.number().int().nullable().default(null),
  truesight: z.number().int().nullable().default(null),
  tremorsense: z.number().int().nullable().default(null),
});
export type Senses = z.infer<typeof SensesSchema>;

export const PersonalitySchema = z.object({
  traits: z.array(z.string()).default([]),
  ideals: z.array(z.string()).default([]),
  bonds: z.array(z.string()).default([]),
  flaws: z.array(z.string()).default([]),
});
export type Personality = z.infer<typeof PersonalitySchema>;

export const CurrencySchema = z.object({
  pp: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  cp: z.number().int().min(0).default(0),
});
export type Currency = z.infer<typeof CurrencySchema>;

export const AcquiredFeatureSchema = z.object({
  classId: z.string(),
  level: z.number().int().min(1),
  featureIndex: z.string(),
});
export type AcquiredFeature = z.infer<typeof AcquiredFeatureSchema>;

export const AcquiredFeatSchema = z.object({
  featId: z.string(),
  /** Character level at which the feat was taken (for sheet display). */
  level: z.number().int().min(1),
  /** Some feats (Resilient) ask for an ability — store it here. */
  choice: z.string().optional(),
});
export type AcquiredFeat = z.infer<typeof AcquiredFeatSchema>;

/**
 * Generic per-rest usage counter. Used by class features whose budget refreshes
 * on long/short rest (Action Surge, Second Wind, Ki points, Bardic Inspiration,
 * Lay on Hands pool, Channel Divinity, etc.). Avoids one schema field per
 * feature.
 */
export const UsageCounterSchema = z.object({
  /** Stable id — typically the feature index ("action-surge", "ki-points"). */
  id: z.string(),
  /** Maximum charges this rest cycle (recomputed on level up). */
  max: z.number().int().min(0),
  /** Charges remaining. Decrements when spent, refreshed by `perRest`. */
  current: z.number().int().min(0),
  /** Where the charges come back. "always" = no rest needed. */
  perRest: z.enum(["short", "long", "always"]),
  /** Optional die for "pool" mechanics like Bardic Inspiration (d6/d8/d10/d12). */
  die: z.number().int().optional(),
});
export type UsageCounter = z.infer<typeof UsageCounterSchema>;

/**
 * A condition with an active duration. Distinct from the simple `conditions`
 * string array — those are flags ("blinded") with no end. Timers are 5e RAW:
 * "blinded for 3 rounds, save ends at start of your turn". When `rounds`
 * reaches 0, the engine removes both the timer AND the matching string from
 * the conditions array.
 */
export const ConditionTimerSchema = z.object({
  index: ConditionSchema,
  /** Rounds remaining. Decrements by 1 each round-advance. Removed at 0. */
  rounds: z.number().int().min(0),
  /** Optional save-ends ability + DC; UI surfaces this at start-of-turn. */
  saveEnd: z
    .object({
      ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
      dc: z.number().int().min(1).max(40),
    })
    .optional(),
  /** Where this came from (spell name, NPC, etc.) — for log readability. */
  source: z.string().optional(),
});
export type ConditionTimer = z.infer<typeof ConditionTimerSchema>;

/**
 * Active concentration on a spell or feature. Set when the player casts a
 * spell that requires concentration; cleared when the spell ends, another
 * concentration effect starts, or a CON save fails after damage.
 */
export const ConcentrationSchema = z.object({
  spellName: z.string(),
  /** SRD index (e.g., "bless", "hold-person") when available. */
  srdRef: z.string().optional(),
  /** Round number when concentration started — for narrative timing. */
  startedAtRound: z.number().int().optional(),
  /** Timestamp for display ("concentrating for 12s"). */
  startedAtTs: z.number().int(),
});
export type Concentration = z.infer<typeof ConcentrationSchema>;

export const CharacterSchema = z.object({
  id: z.string(),
  dataVersion: z.string(),
  name: z.string().min(1).max(60),
  bio: z.string().max(2000).default(""),
  portraitId: z.string().optional(),

  raceId: z.string(),
  subraceId: z.string().optional(),
  backgroundId: z.string(),
  alignment: z.string().default("true neutral"),

  classes: z.array(ClassEntrySchema).min(1),
  abilities: AbilityScoresSchema,

  hp: z.object({
    max: z.number().int().min(1),
    current: z.number().int().min(0),
    temp: z.number().int().min(0).default(0),
  }),
  ac: z.number().int().min(1).max(40),
  speed: z.number().int().min(0).max(120),
  initiativeBonus: z.number().int().default(0),

  proficientSkills: z.array(z.enum(SKILLS)).default([]),
  expertiseSkills: z.array(z.enum(SKILLS)).default([]),
  savingThrows: z.array(z.enum(ABILITIES)).default([]),

  spellsKnown: z.array(z.string()).default([]),
  spellsPrepared: z.array(z.string()).default([]),
  cantrips: z.array(z.string()).default([]),
  spellSlots: SpellSlotsSchema.optional(),

  inventory: z.array(InventoryItemSchema).default([]),
  goldPieces: z.number().int().min(0).default(0),
  currency: CurrencySchema.default({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }),

  conditions: z.array(ConditionSchema).default([]),
  xp: z.number().int().min(0).default(0),

  /** Damage types this character takes at half (5e resistance). */
  resistances: z.array(z.string()).default([]),
  /** Damage types this character takes at double (5e vulnerability). */
  vulnerabilities: z.array(z.string()).default([]),
  /** Damage types this character ignores entirely (5e immunity). */
  immunities: z.array(z.string()).default([]),
  /** Active concentration on a spell. Cleared when broken or replaced. */
  concentration: ConcentrationSchema.nullable().default(null),
  /** Conditions with rounds-remaining tracking (5e durations RAW). */
  conditionTimers: z.array(ConditionTimerSchema).default([]),
  /** Per-rest usage counters for class features (ki, action surge, etc.). */
  usageCounters: z.array(UsageCounterSchema).default([]),
  /** True while Barbarian Rage is up — modifies damage + resistances. */
  raging: z.boolean().default(false),

  hitDice: z.array(HitDieEntrySchema).default([]),
  deathSaves: DeathSavesSchema.default({ successes: 0, failures: 0 }),
  inspiration: z.boolean().default(false),
  languages: z.array(z.string()).default([]),
  senses: SensesSchema.default({
    darkvision: null,
    blindsight: null,
    truesight: null,
    tremorsense: null,
  }),
  personality: PersonalitySchema.default({
    traits: [],
    ideals: [],
    bonds: [],
    flaws: [],
  }),
  featuresAcquired: z.array(AcquiredFeatureSchema).default([]),
  feats: z.array(AcquiredFeatSchema).default([]),

  /** Travel rations on hand. 1 ration = 1 day. */
  rations: z.number().int().min(0).default(0),
  /** Days the player has gone without food (exhaustion-trigger counter). */
  daysWithoutFood: z.number().int().min(0).default(0),

  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Character = z.infer<typeof CharacterSchema>;

export function totalLevel(character: Pick<Character, "classes">): number {
  return character.classes.reduce((sum, c) => sum + c.level, 0);
}

export function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1; // 1-4: +2, 5-8: +3, …
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
