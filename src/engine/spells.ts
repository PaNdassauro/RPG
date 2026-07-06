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

/** Warlock-only: short rest refunds all Pact Magic slots (level = pact level). */
export function resetWarlockSlots(char: Character): Character {
  const warlock = char.classes.find((c) => c.classId === "warlock");
  if (!warlock) return char;
  // Pact slot level = ceil(warlock_level / 2), capped at 5.
  const pactLevel = Math.min(5, Math.ceil(warlock.level / 2)) as SlotLevel;
  const slots = char.spellSlots;
  if (!slots) return char;
  const key = slotKey(pactLevel);
  return {
    ...char,
    spellSlots: { ...slots, [key]: { max: slots[key].max, used: 0 } },
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

/**
 * Compute spell-slot capacities from the class progression and populate the
 * character's `spellSlots`. Re-runnable: existing `used` is preserved up to
 * the new max (a level-down or schema change can't leave an overspend).
 *
 * For multiclassed casters we sum the slot caps per level — that's not
 * strictly the 5e RAW multiclass spellcaster table, but it's a sane single-
 * caster approximation and survives the common cases.
 */
export function initializeSlotsFromClasses(
  char: Character,
  resolveClassSlots: (
    classId: string,
    level: number,
  ) => {
    spell_slots_level_1?: number;
    spell_slots_level_2?: number;
    spell_slots_level_3?: number;
    spell_slots_level_4?: number;
    spell_slots_level_5?: number;
    spell_slots_level_6?: number;
    spell_slots_level_7?: number;
    spell_slots_level_8?: number;
    spell_slots_level_9?: number;
  } | null,
): Character {
  const out = emptySpellSlots();
  let anyCaster = false;
  for (const c of char.classes) {
    const sc = resolveClassSlots(c.classId, c.level);
    if (!sc) continue;
    anyCaster = true;
    for (let lvl = 1; lvl <= 9; lvl++) {
      const key = `spell_slots_level_${lvl}` as keyof typeof sc;
      const v = sc[key] ?? 0;
      if (v > 0) {
        const slotKeyName = `l${lvl}` as keyof SpellSlots;
        out[slotKeyName] = { max: out[slotKeyName].max + v, used: 0 };
      }
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
