import { z } from "zod";
import { ABILITIES, SKILLS, ConditionSchema } from "./character";

/**
 * The DM tool surface. The AI calls these to *request* engine work — it never
 * computes results itself. Engine resolves and replies with structured outcomes.
 */

export const RequestCheckSchema = z.object({
  type: z.literal("request_check"),
  skill: z.enum(SKILLS),
  dc: z.number().int().min(1).max(40),
  reason: z.string().max(280),
  mode: z.enum(["adv", "dis"]).optional(),
});

export const RequestSaveSchema = z.object({
  type: z.literal("request_save"),
  ability: z.enum(ABILITIES),
  dc: z.number().int().min(1).max(40),
  reason: z.string().max(280),
  mode: z.enum(["adv", "dis"]).optional(),
});

export const ApplyDamageSchema = z.object({
  type: z.literal("apply_damage"),
  targetId: z.string(),
  expression: z.string().regex(/^\d+d\d+([+-]\d+)?$/),
  damageType: z.string(),
  reason: z.string().max(280).optional(),
});

export const ApplyHealingSchema = z.object({
  type: z.literal("apply_healing"),
  targetId: z.string(),
  expression: z.string().regex(/^\d+d\d+([+-]\d+)?$/).or(z.string().regex(/^\d+$/)),
  reason: z.string().max(280).optional(),
});

export const ApplyConditionSchema = z.object({
  type: z.literal("apply_condition"),
  targetId: z.string(),
  condition: ConditionSchema,
  durationRounds: z.number().int().min(0).max(1000).optional(),
});

export const RemoveConditionSchema = z.object({
  type: z.literal("remove_condition"),
  targetId: z.string(),
  condition: ConditionSchema,
});

export const StartCombatSchema = z.object({
  type: z.literal("start_combat"),
  reason: z.string().max(280),
});

export const SetInitiativeSchema = z.object({
  type: z.literal("set_initiative"),
  entries: z.array(
    z.object({
      kind: z.enum(["pc", "monster"]),
      name: z.string(),
      srdRef: z.string().optional(),
      hpMax: z.number().int().min(1),
      ac: z.number().int().min(1).max(40),
      initiative: z.number().int(),
    }),
  ).min(1),
});

export const EndCombatSchema = z.object({
  type: z.literal("end_combat"),
  reason: z.string().max(280),
});

export const SpawnMonsterSchema = z.object({
  type: z.literal("spawn_monster"),
  srdRef: z.string(),
  count: z.number().int().min(1).max(20).default(1),
  reason: z.string().max(280).optional(),
});

export const MoveToLocationSchema = z.object({
  type: z.literal("move_to_location"),
  name: z.string(),
  description: z.string().max(800),
});

export const UpdateQuestSchema = z.object({
  type: z.literal("update_quest"),
  questId: z.string().optional(),
  title: z.string().optional(),
  objective: z.string().optional(),
  status: z.enum(["active", "completed", "failed", "abandoned"]).optional(),
});

export const GiveItemSchema = z.object({
  type: z.literal("give_item"),
  srdRef: z.string().optional(),
  name: z.string(),
  qty: z.number().int().min(1).max(1000).default(1),
  notes: z.string().max(280).optional(),
});

export const RollLootSchema = z.object({
  type: z.literal("roll_loot"),
  table: z.string(),
  modifier: z.number().int().default(0),
});

export const PinFactSchema = z.object({
  type: z.literal("pin_fact"),
  fact: z.string().max(400),
});

export const NarrateSchema = z.object({
  type: z.literal("narrate"),
  text: z.string().max(4000),
});

export const DMActionSchema = z.discriminatedUnion("type", [
  RequestCheckSchema,
  RequestSaveSchema,
  ApplyDamageSchema,
  ApplyHealingSchema,
  ApplyConditionSchema,
  RemoveConditionSchema,
  StartCombatSchema,
  SetInitiativeSchema,
  EndCombatSchema,
  SpawnMonsterSchema,
  MoveToLocationSchema,
  UpdateQuestSchema,
  GiveItemSchema,
  RollLootSchema,
  PinFactSchema,
  NarrateSchema,
]);
export type DMAction = z.infer<typeof DMActionSchema>;
