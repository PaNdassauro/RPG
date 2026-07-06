/**
 * Lazy loaders for the heavy SRD datasets. Spells (~600 KB) and monsters
 * (~1.3 MB) are split out so they don't hit the initial bundle.
 *
 * Vite turns these dynamic JSON imports into separate chunks fetched on
 * demand the first time a caller awaits them.
 */
import type { SrdMonster, SrdSpell } from "./types";

let spellsPromise: Promise<SrdSpell[]> | null = null;
let monstersPromise: Promise<SrdMonster[]> | null = null;

export function loadSpells(): Promise<SrdSpell[]> {
  if (!spellsPromise) {
    spellsPromise = import("./spells.json").then(
      (m) => m.default as unknown as SrdSpell[],
    );
  }
  return spellsPromise;
}

export function loadMonsters(): Promise<SrdMonster[]> {
  if (!monstersPromise) {
    monstersPromise = import("./monsters.json").then(
      (m) => m.default as unknown as SrdMonster[],
    );
  }
  return monstersPromise;
}

export async function getSpell(index: string): Promise<SrdSpell | undefined> {
  return (await loadSpells()).find((s) => s.index === index);
}

export async function getMonster(index: string): Promise<SrdMonster | undefined> {
  return (await loadMonsters()).find((m) => m.index === index);
}

/**
 * Spells castable by a given class (case-insensitive match on classes[].index).
 * Sorted by level then name for display.
 */
export async function spellsForClass(classId: string): Promise<SrdSpell[]> {
  const all = await loadSpells();
  const id = classId.toLowerCase();
  return all
    .filter((s) => (s.classes ?? []).some((c) => c.index.toLowerCase() === id))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export async function getSpellsByIndices(indices: string[]): Promise<SrdSpell[]> {
  const all = await loadSpells();
  const set = new Set(indices);
  return all.filter((s) => set.has(s.index));
}
