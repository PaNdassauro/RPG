/**
 * Inventory rules: carrying capacity, attunement cap, basic potion lookup.
 */
import type { Character } from "@/schemas/character";
import { getEquipment } from "@/data/srd";

export const ATTUNEMENT_CAP = 3;

export function attunedCount(char: Character): number {
  return char.inventory.filter((i) => i.attuned).length;
}

export function canAttune(char: Character): boolean {
  return attunedCount(char) < ATTUNEMENT_CAP;
}

/** STR × 15 (lbs). */
export function carryCapacity(char: Character): number {
  return char.abilities.str * 15;
}

/** Sum of item weights × qty (lbs). Items without SRD weight are treated as 0. */
export function currentWeight(char: Character): number {
  let total = 0;
  for (const item of char.inventory) {
    if (!item.srdRef) continue;
    const eq = getEquipment(item.srdRef);
    if (!eq) continue;
    const w = eq.weight ?? 0;
    total += w * item.qty;
  }
  return total;
}

export type EncumbranceLevel = "ok" | "encumbered" | "heavy" | "over";

/** Variant rule: encumbered ≥ 5×STR, heavy ≥ 10×STR, over ≥ 15×STR. */
export function encumbranceLevel(char: Character): EncumbranceLevel {
  const str = char.abilities.str;
  const w = currentWeight(char);
  if (w > str * 15) return "over";
  if (w > str * 10) return "heavy";
  if (w > str * 5) return "encumbered";
  return "ok";
}

/** Known potion shapes. SRD's equipment data lists them with `name` but no roll. */
const POTION_TABLE: Record<string, { dice: string; label: string }> = {
  "potion-of-healing": { dice: "2d4+2", label: "Poção de Cura" },
};

export function potionHealing(itemRefOrName: string): { dice: string; label: string } | null {
  const key = itemRefOrName.toLowerCase().replace(/\s+/g, "-");
  return POTION_TABLE[key] ?? null;
}

export function isPotionItem(name: string, srdRef?: string): boolean {
  const lower = (srdRef ?? name).toLowerCase();
  return lower.includes("potion") || lower.includes("poção");
}
