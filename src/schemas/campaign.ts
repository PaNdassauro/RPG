import { z } from "zod";

export const ChatMessageRoleSchema = z.enum(["dm", "player", "system", "tool"]);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

export const DiceRollRecordSchema = z.object({
  id: z.string(),
  expression: z.string(),
  mode: z.enum(["adv", "dis"]).nullable().default(null),
  rolls: z.array(z.object({ sides: z.number().int(), value: z.number().int() })),
  kept: z.array(z.object({ sides: z.number().int(), value: z.number().int() })),
  modifier: z.number().int(),
  total: z.number().int(),
  isCritical: z.boolean(),
  isFumble: z.boolean(),
  purpose: z.string().optional(),
  dc: z.number().int().nullable().default(null),
  ts: z.number().int(),
});
export type DiceRollRecord = z.infer<typeof DiceRollRecordSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  role: ChatMessageRoleSchema,
  content: z.string(),
  toolCallIds: z.array(z.string()).default([]),
  diceRollIds: z.array(z.string()).default([]),
  ts: z.number().int(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const PinnedFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  pinnedAt: z.number().int(),
});
export type PinnedFact = z.infer<typeof PinnedFactSchema>;

/** A location the player has been to or that matters to the campaign. */
export const PlaceEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Lower-cased trimmed name — used for dedupe. */
  key: z.string(),
  addedAt: z.number().int(),
});
export type PlaceEntry = z.infer<typeof PlaceEntrySchema>;

/** A non-player character the player has met. */
export const NpcEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["ally", "foe", "neutral"]).default("neutral"),
  /**
   * Per-NPC disposition toward the player, integer in -2..+2. -2 hostile,
   * -1 wary, 0 neutral, +1 friendly, +2 devoted. Distinct from `kind` — kind
   * is the NPC's current side; disposition tracks the personal warmth.
   */
  disposition: z.number().int().min(-2).max(2).default(0),
  key: z.string(),
  addedAt: z.number().int(),
});
export type NpcEntry = z.infer<typeof NpcEntrySchema>;

export const QuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  status: z.enum(["active", "completed", "failed", "abandoned"]).default("active"),
  updatedAt: z.number().int(),
});
export type Quest = z.infer<typeof QuestSchema>;

/** Faction reputation: -100 hostile, 0 neutral, +100 revered. */
export const FactionEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  reputation: z.number().int().min(-100).max(100).default(0),
  key: z.string(),
  updatedAt: z.number().int(),
});
export type FactionEntry = z.infer<typeof FactionEntrySchema>;

/** Companion: an NPC that travels with the player (familiar, hireling, summon). */
export const CompanionEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["familiar", "summon", "hireling", "mount"]).default("hireling"),
  description: z.string().default(""),
  hpMax: z.number().int().min(1),
  hpCurrent: z.number().int().min(0),
  ac: z.number().int().min(1),
  initiativeBonus: z.number().int().default(0),
  /** Damage expression if this companion can attack ("1d6+2"). */
  attack: z.object({
    name: z.string(),
    toHit: z.number().int(),
    damage: z.string(),
    damageType: z.string().default("bludgeoning"),
  }).optional(),
  /** Active = currently in initiative when combat starts. */
  active: z.boolean().default(true),
  addedAt: z.number().int(),
});
export type CompanionEntry = z.infer<typeof CompanionEntrySchema>;

/** A snapshot of what a shop sells. Posted by the DM via [SHOP] markup. */
export const ShopOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  /** Price in gp (we normalize everything to gp for simplicity). */
  priceGp: z.number().int().min(0),
  qty: z.number().int().min(1).default(1),
});
export type ShopOffer = z.infer<typeof ShopOfferSchema>;

export const ShopStateSchema = z.object({
  vendorName: z.string(),
  location: z.string().default(""),
  offers: z.array(ShopOfferSchema).default([]),
  openedAt: z.number().int(),
});
export type ShopState = z.infer<typeof ShopStateSchema>;

/**
 * Long-term memory. A chapter is a short chronicle of one span of narrative
 * turns, written from the raw text of that span and never rewritten. Once more
 * than a dozen chapters pile up, the oldest are folded into an arc (`arcId`).
 */
export const ChapterSchema = z.object({
  id: z.string(),
  /** First narrative turn covered (inclusive). */
  fromTurn: z.number().int(),
  /** End of the covered span (exclusive), in narrative turns. */
  toTurn: z.number().int(),
  text: z.string(),
  /** Set once the chapter has been folded into an arc. */
  arcId: z.string().optional(),
  createdAt: z.number().int(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const ArcSchema = z.object({
  id: z.string(),
  fromTurn: z.number().int(),
  toTurn: z.number().int(),
  text: z.string(),
  createdAt: z.number().int(),
});
export type Arc = z.infer<typeof ArcSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  title: z.string(),
  characterId: z.string(),
  worldSeed: z.string(),
  settingId: z.string(),
  /** Legacy: world text from the removed "custom" setting. Kept so old saves parse; unused. */
  customSettingDescription: z.string().optional(),
  currentLocation: z.object({
    name: z.string(),
    description: z.string().default(""),
  }),
  /** In-world day counter (starts at 1). Advances on long rests and travel. */
  inWorldDay: z.number().int().min(1).default(1),
  quests: z.array(QuestSchema).default([]),
  factions: z.array(FactionEntrySchema).default([]),
  companions: z.array(CompanionEntrySchema).default([]),
  pinnedFacts: z.array(PinnedFactSchema).default([]),
  placesVisited: z.array(PlaceEntrySchema).default([]),
  npcsMet: z.array(NpcEntrySchema).default([]),
  /** Legacy single summary paragraph. Read-only now: it is shown as the first arc. */
  rollingSummary: z.string().default(""),
  /** Append-only chronicle of the turns that left the verbatim window. */
  chapters: z.array(ChapterSchema).default([]),
  /** Folded groups of older chapters. */
  arcs: z.array(ArcSchema).default([]),
  /** Number of (DM+player) narrative turns covered by memory (newest chapter's `toTurn`). */
  summaryThroughTurn: z.number().int().default(0),
  /**
   * Player-authored journal in markdown. Not visible to the DM. Persists
   * across sessions so the player can pin suspicions, todos, or session notes
   * the way a real RPG player keeps a notebook.
   */
  journal: z.string().default(""),
  providerSnapshot: z.object({
    providerId: z.string(),
    model: z.string(),
  }).optional(),
  /** Set when the player chose "Let the story end" after death. Read-only after. */
  endedAt: z.number().int().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Abstract distance brackets for theater-of-mind combat. */
export const CombatRangeSchema = z.enum(["close", "near", "far", "veryFar"]);
export type CombatRange = z.infer<typeof CombatRangeSchema>;

export const InitiativeEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["pc", "monster", "companion"]),
  name: z.string(),
  initiative: z.number().int(),
  hp: z.object({ max: z.number().int(), current: z.number().int() }),
  ac: z.number().int(),
  conditions: z.array(z.string()).default([]),
  /** Distance from the player (theater-of-mind). */
  range: CombatRangeSchema.default("near"),
  /** Reference into the SRD monster catalog for monster entries. */
  srdRef: z.string().optional(),
  /** Hidden notes (HP visibility for the player will be a UI decision). */
  hidden: z.boolean().default(false),
  /** Damage types this combatant takes at half. */
  resistances: z.array(z.string()).default([]),
  /** Damage types this combatant takes at double. */
  vulnerabilities: z.array(z.string()).default([]),
  /** Damage types this combatant ignores entirely. */
  immunities: z.array(z.string()).default([]),
});
export type InitiativeEntry = z.infer<typeof InitiativeEntrySchema>;

export const EncounterStateSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  mode: z.enum(["exploration", "combat"]),
  round: z.number().int().default(0),
  turnIndex: z.number().int().default(0),
  initiative: z.array(InitiativeEntrySchema).default([]),
  updatedAt: z.number().int(),
});
export type EncounterState = z.infer<typeof EncounterStateSchema>;
