/**
 * Spell engine: slot bookkeeping and resolution helpers. Slot capacities are
 * derived from the SRD class tables (see `sheetDerived.ts > spellcasting()`);
 * the character only persists `used` counts.
 */
import type { Character, SpellSlots } from "@/schemas/character";

export type SlotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function slotKey(level: SlotLevel): keyof SpellSlots {
  return (`l${level}` as keyof SpellSlots);
}

export function remainingSlot(char: Character, level: SlotLevel): number {
  const slots = char.spellSlots;
  if (!slots) return 0;
  const entry = slots[slotKey(level)];
  return Math.max(0, entry.max - entry.used);
}

export function spendSlot(
  char: Character,
  level: SlotLevel,
): Character | null {
  const slots = char.spellSlots;
  if (!slots) return null;
  const key = slotKey(level);
  const entry = slots[key];
  if (entry.used >= entry.max) return null;
  const nextSlots: SpellSlots = {
    ...slots,
    [key]: { max: entry.max, used: entry.used + 1 },
  };
  return { ...char, spellSlots: nextSlots, updatedAt: Date.now() };
}

export function refundSlot(char: Character, level: SlotLevel): Character {
  const slots = char.spellSlots;
  if (!slots) return char;
  const key = slotKey(level);
  const entry = slots[key];
  const nextSlots: SpellSlots = {
    ...slots,
    [key]: { max: entry.max, used: Math.max(0, entry.used - 1) },
  };
  return { ...char, spellSlots: nextSlots, updatedAt: Date.now() };
}

/** Reset all spell slot usage (long rest). */
export function resetAllSlots(char: Character): Character {
  const slots = char.spellSlots;
  if (!slots) return char;
  const nextSlots = Object.fromEntries(
    Object.entries(slots).map(([k, v]) => [k, { max: v.max, used: 0 }]),
  ) as SpellSlots;
  return { ...char, spellSlots: nextSlots, updatedAt: Date.now() };
}

/** Pact Magic slot count by warlock level (SRD): 1, 2, 3 from L11, 4 from L17. */
export function pactSlotCount(warlockLevel: number): number {
  if (warlockLevel >= 17) return 4;
  if (warlockLevel >= 11) return 3;
  return warlockLevel >= 2 ? 2 : 1;
}

/** Warlock-only: short rest refunds all Pact Magic slots (level = pact level). */
export function resetWarlockSlots(char: Character): Character {
  const warlock = char.classes.find((c) => c.classId === "warlock");
  if (!warlock) return char;
  // Pact slot level = ceil(warlock_level / 2), capped at 5.
  const pactLevel = Math.min(5, Math.ceil(warlock.level / 2)) as SlotLevel;
  const slots = char.spellSlots;
  if (!slots) return char;
  const key = slotKey(pactLevel);
  // The sheet keeps one pool per level; refund only the pact slots' share so
  // a multiclass warlock doesn't also recover table slots of the same level.
  const used = Math.max(0, slots[key].used - pactSlotCount(warlock.level));
  return {
    ...char,
    spellSlots: { ...slots, [key]: { max: slots[key].max, used } },
    updatedAt: Date.now(),
  };
}

/**
 * Set or replace concentration on this character. 5e: a character can only
 * concentrate on one spell at a time — starting a new one ends the previous.
 */
export function startConcentration(
  char: Character,
  input: { spellName: string; srdRef?: string; round?: number },
): Character {
  return {
    ...char,
    concentration: {
      spellName: input.spellName,
      ...(input.srdRef ? { srdRef: input.srdRef } : {}),
      ...(input.round != null ? { startedAtRound: input.round } : {}),
      startedAtTs: Date.now(),
    },
    updatedAt: Date.now(),
  };
}

/** End concentration cleanly (the spell ran its course or was dismissed). */
export function endConcentration(char: Character): Character {
  if (!char.concentration) return char;
  return { ...char, concentration: null, updatedAt: Date.now() };
}

type ClassSlotTable = {
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

/** How a class's levels count toward multiclass caster level. */
export type CasterKind = "full" | "half" | "third" | "pact";

const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTERS = new Set(["paladin", "ranger"]);
const THIRD_CASTER_SUBCLASSES = new Set(["eldritch-knight", "arcane-trickster"]);

export function casterKind(classId: string, subclassId?: string): CasterKind | null {
  if (FULL_CASTERS.has(classId)) return "full";
  if (HALF_CASTERS.has(classId)) return "half";
  if (classId === "warlock") return "pact";
  if (subclassId && THIRD_CASTER_SUBCLASSES.has(subclassId)) return "third";
  return null;
}

/**
 * SRD multiclass spellcaster table: slots by combined caster level (index 0 =
 * level 1), as [1st..9th].
 */
const MULTICLASS_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/**
 * Combined caster level: full casters count their level, half casters
 * (paladin, ranger) half rounded down, third casters a third rounded down.
 * Warlock pact magic is separate and never counts.
 */
export function multiclassCasterLevel(
  classes: { classId: string; level: number; subclassId?: string }[],
): number {
  let total = 0;
  for (const c of classes) {
    const kind = casterKind(c.classId, c.subclassId);
    if (kind === "full") total += c.level;
    else if (kind === "half") total += Math.floor(c.level / 2);
    else if (kind === "third") total += Math.floor(c.level / 3);
  }
  return Math.min(20, total);
}

/** Slots [1st..9th] for a combined caster level (zeros below level 1). */
export function multiclassSlotsForLevel(casterLevel: number): number[] {
  const row = MULTICLASS_SLOTS[Math.min(20, Math.floor(casterLevel)) - 1] ?? [];
  return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
}

/**
 * Compute spell-slot capacities from the class progression and populate the
 * character's `spellSlots`. Re-runnable: existing `used` is preserved up to
 * the new max (a level-down or schema change can't leave an overspend).
 *
 * A single spellcasting class uses its own SRD table. Two or more use the SRD
 * multiclass spellcaster table (see `multiclassCasterLevel`). Warlock Pact
 * Magic never enters that calculation; its slots are added on top, and since
 * the sheet stores one pool per level they share a row with the table slots.
 */
export function initializeSlotsFromClasses(
  char: Character,
  resolveClassSlots: (classId: string, level: number) => ClassSlotTable | null,
): Character {
  const out = emptySpellSlots();
  const add = (lvl: number, n: number): void => {
    if (n <= 0) return;
    const k = `l${lvl}` as keyof SpellSlots;
    out[k] = { max: out[k].max + n, used: 0 };
  };
  const tableCasters = char.classes.filter((c) => {
    const kind = casterKind(c.classId, c.subclassId);
    return kind !== null && kind !== "pact";
  });
  let anyCaster = false;
  const useTable =
    tableCasters.length >= 2 ||
    tableCasters.some((c) => casterKind(c.classId, c.subclassId) === "third");
  if (useTable) {
    const slots = multiclassSlotsForLevel(multiclassCasterLevel(tableCasters));
    slots.forEach((n, i) => add(i + 1, n));
    anyCaster = true;
  } else {
    for (const c of tableCasters) {
      const sc = resolveClassSlots(c.classId, c.level);
      if (!sc) continue;
      anyCaster = true;
      for (let lvl = 1; lvl <= 9; lvl++) {
        add(lvl, sc[`spell_slots_level_${lvl}` as keyof ClassSlotTable] ?? 0);
      }
    }
  }
  for (const c of char.classes) {
    if (casterKind(c.classId, c.subclassId) !== "pact") continue;
    const sc = resolveClassSlots(c.classId, c.level);
    if (!sc) continue;
    anyCaster = true;
    for (let lvl = 1; lvl <= 9; lvl++) {
      add(lvl, sc[`spell_slots_level_${lvl}` as keyof ClassSlotTable] ?? 0);
    }
  }
  if (!anyCaster) return char;
  // Preserve `used` from existing slots up to the new max.
  if (char.spellSlots) {
    for (let lvl = 1; lvl <= 9; lvl++) {
      const k = `l${lvl}` as keyof SpellSlots;
      const used = Math.min(char.spellSlots[k].used, out[k].max);
      out[k] = { max: out[k].max, used };
    }
  }
  return { ...char, spellSlots: out, updatedAt: Date.now() };
}

/** Initialize an empty spell-slots block (used when first making a caster). */
export function emptySpellSlots(): SpellSlots {
  return {
    l1: { max: 0, used: 0 },
    l2: { max: 0, used: 0 },
    l3: { max: 0, used: 0 },
    l4: { max: 0, used: 0 },
    l5: { max: 0, used: 0 },
    l6: { max: 0, used: 0 },
    l7: { max: 0, used: 0 },
    l8: { max: 0, used: 0 },
    l9: { max: 0, used: 0 },
  };
}

/**
 * Sync slot capacities from the class table. Existing `used` is preserved,
 * but clamped to the new max so a level-down or schema change can't leave a
 * dangling overspend.
 */
export function syncSlotCapacities(
  char: Character,
  capacitiesByLevel: { level: SlotLevel; max: number }[],
): Character {
  const base = char.spellSlots ?? emptySpellSlots();
  const next: SpellSlots = { ...base };
  for (const { level, max } of capacitiesByLevel) {
    const key = slotKey(level);
    const used = Math.min(base[key].used, max);
    next[key] = { max, used };
  }
  return { ...char, spellSlots: next, updatedAt: Date.now() };
}
