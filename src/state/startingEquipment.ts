/**
 * Turn a class's starting equipment (always-granted items + the wizard's
 * chosen option per group) and the background's starting equipment into
 * inventory items, then equip the best armor, shield and weapons so the
 * derived AC and attack list reflect the character's gear from turn one.
 */
import { z } from "zod";
import { getBackground, getClass, getEquipment } from "@/data/srd";
import type { SrdEquipment } from "@/data/srd/types";
import equipmentCategoriesJson from "@/data/srd/equipment-categories.json";
import { newId } from "@/lib/id";
import { abilityModifier, type InventoryItem } from "@/schemas/character";
import { parseExpression } from "@/engine/dice";

const RefSchema = z.object({ index: z.string(), name: z.string() });
type Ref = z.infer<typeof RefSchema>;

const CategoryChoiceSchema = z.object({
  choose: z.number().int().min(1),
  from: z.object({ equipment_category: RefSchema.optional() }),
});
type CategoryChoice = z.infer<typeof CategoryChoiceSchema>;

type StartingOption =
  | { option_type: "counted_reference"; count: number; of: Ref }
  | { option_type: "reference"; of: Ref }
  | { option_type: "multiple"; items: StartingOption[] }
  | { option_type: "choice"; choice: CategoryChoice };

const OptionSchema: z.ZodType<StartingOption> = z.lazy(() =>
  z.union([
    z.object({
      option_type: z.literal("counted_reference"),
      count: z.number().int().min(1),
      of: RefSchema,
    }),
    z.object({ option_type: z.literal("reference"), of: RefSchema }),
    z.object({ option_type: z.literal("multiple"), items: z.array(OptionSchema) }),
    z.object({ option_type: z.literal("choice"), choice: CategoryChoiceSchema }),
  ]),
);

/** One `starting_equipment_options` group: a pick of N options, or from a category. */
const GroupSchema = z.object({
  choose: z.number().int().min(1),
  from: z.object({
    options: z.array(z.unknown()).optional(),
    equipment_category: RefSchema.optional(),
  }),
});

const CATEGORIES = equipmentCategoriesJson as unknown as {
  index: string;
  equipment?: Ref[];
}[];

interface Grant {
  index: string;
  name: string;
  qty: number;
}

/**
 * "Any simple weapon" and friends: the wizard has no sub-picker for these, so
 * take the first entries of the SRD category (deterministic, always valid).
 */
function grantsFromCategory(categoryIndex: string, count: number): Grant[] {
  const cat = CATEGORIES.find((c) => c.index === categoryIndex);
  return (cat?.equipment ?? []).slice(0, count).map((r) => ({ index: r.index, name: r.name, qty: 1 }));
}

function grantsFromOption(option: unknown): Grant[] {
  const parsed = OptionSchema.safeParse(option);
  if (!parsed.success) return [];
  const o = parsed.data;
  switch (o.option_type) {
    case "counted_reference":
      return [{ index: o.of.index, name: o.of.name, qty: o.count }];
    case "reference":
      return [{ index: o.of.index, name: o.of.name, qty: 1 }];
    case "multiple":
      return o.items.flatMap((item) => grantsFromOption(item));
    case "choice": {
      const cat = o.choice.from.equipment_category;
      return cat ? grantsFromCategory(cat.index, o.choice.choose) : [];
    }
  }
}

function grantsFromGroups(groups: unknown[], choices: number[]): Grant[] {
  const out: Grant[] = [];
  groups.forEach((raw, i) => {
    const g = GroupSchema.safeParse(raw);
    if (!g.success) return;
    const { options, equipment_category } = g.data.from;
    if (options) {
      // An unanswered group (quick start) takes the first option.
      const pick = options[choices[i] ?? 0] ?? options[0];
      out.push(...grantsFromOption(pick));
    } else if (equipment_category) {
      out.push(...grantsFromCategory(equipment_category.index, g.data.choose));
    }
  });
  return out;
}

function mergeGrants(grants: Grant[]): InventoryItem[] {
  const byIndex = new Map<string, Grant>();
  for (const g of grants) {
    const prev = byIndex.get(g.index);
    byIndex.set(g.index, prev ? { ...prev, qty: prev.qty + g.qty } : g);
  }
  return [...byIndex.values()].map((g) => {
    const eq = getEquipment(g.index);
    return {
      id: newId(),
      ...(eq ? { srdRef: eq.index } : {}),
      name: eq?.name ?? g.name,
      qty: g.qty,
      equipped: false,
      attuned: false,
    };
  });
}

function averageDamage(eq: SrdEquipment): number {
  if (!eq.damage) return 0;
  try {
    const { count, sides, modifier } = parseExpression(eq.damage.damage_dice);
    return count * (sides + 1) / 2 + modifier;
  } catch {
    return 0;
  }
}

function armorValue(eq: SrdEquipment, dexMod: number): number {
  if (!eq.armor_class) return 0;
  const { base, dex_bonus, max_bonus } = eq.armor_class;
  const dex = dex_bonus === false ? 0 : typeof max_bonus === "number" ? Math.min(dexMod, max_bonus) : dexMod;
  return base + dex;
}

/** Equip the best body armor, a shield, and the best melee + ranged weapon. */
export function autoEquip(items: InventoryItem[], dexScore: number): InventoryItem[] {
  const dexMod = abilityModifier(dexScore);
  let bestArmor: { id: string; value: number } | null = null;
  let shieldId: string | null = null;
  let bestMelee: { id: string; dmg: number } | null = null;
  let bestRanged: { id: string; dmg: number } | null = null;
  for (const item of items) {
    const eq = item.srdRef ? getEquipment(item.srdRef) : undefined;
    if (!eq) continue;
    if (eq.armor_category === "Shield") {
      shieldId ??= item.id;
    } else if (eq.armor_category) {
      const value = armorValue(eq, dexMod);
      if (!bestArmor || value > bestArmor.value) bestArmor = { id: item.id, value };
    } else if (eq.damage) {
      const dmg = averageDamage(eq);
      if (eq.weapon_range === "Ranged") {
        if (!bestRanged || dmg > bestRanged.dmg) bestRanged = { id: item.id, dmg };
      } else if (!bestMelee || dmg > bestMelee.dmg) {
        bestMelee = { id: item.id, dmg };
      }
    }
  }
  const equip = new Set(
    [bestArmor?.id, shieldId, bestMelee?.id, bestRanged?.id].filter((id): id is string => !!id),
  );
  return items.map((i) => (equip.has(i.id) ? { ...i, equipped: true } : i));
}

/**
 * Starting inventory for a class + background. `classChoices[i]` is the
 * option index picked for the class's i-th equipment group (the wizard's
 * `equipment.choices`).
 */
export function buildStartingInventory(args: {
  classId: string;
  backgroundId: string | null;
  classChoices: number[];
  dexScore: number;
}): InventoryItem[] {
  const klass = getClass(args.classId);
  const background = args.backgroundId ? getBackground(args.backgroundId) : undefined;
  const grants: Grant[] = [];
  if (klass) {
    for (const e of klass.starting_equipment) {
      grants.push({ index: e.equipment.index, name: e.equipment.name, qty: e.quantity });
    }
    grants.push(...grantsFromGroups(klass.starting_equipment_options, args.classChoices));
  }
  if (background) {
    for (const e of background.starting_equipment) {
      grants.push({ index: e.equipment.index, name: e.equipment.name, qty: e.quantity });
    }
    // Background groups (e.g. "a holy symbol") have no wizard step: first option.
    grants.push(...grantsFromGroups(background.starting_equipment_options ?? [], []));
  }
  return autoEquip(mergeGrants(grants), args.dexScore);
}
