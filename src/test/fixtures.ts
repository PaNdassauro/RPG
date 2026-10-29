/**
 * Test-only builders. Parsing through the real Zod schema keeps fixtures
 * honest: a field added to `CharacterSchema` shows up here as a type error
 * or a defaulted value instead of silently drifting.
 */
import { vi, type MockInstance } from "vitest";
import { CharacterSchema, type Ability, type Character } from "@/schemas/character";

export function makeCharacter(
  overrides: Partial<Omit<Character, "abilities">> & {
    abilities?: Partial<Record<Ability, number>>;
  } = {},
): Character {
  const { abilities, ...rest } = overrides;
  return CharacterSchema.parse({
    id: "char-1",
    dataVersion: "test",
    name: "Tester",
    raceId: "human",
    backgroundId: "acolyte",
    classes: [{ classId: "fighter", level: 1 }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...abilities },
    hp: { max: 10, current: 10, temp: 0 },
    ac: 10,
    speed: 30,
    createdAt: 0,
    updatedAt: 0,
    ...rest,
  });
}

/**
 * Pin `crypto.getRandomValues` to a scripted die sequence. `rollDie(sides)`
 * reads one uint32 per roll and maps it with `% sides + 1`, so feeding
 * `value - 1` yields that exact face for any die size (valid up to the
 * die's sides). Restore with `vi.restoreAllMocks()`.
 */
export function stubDice(values: number[]): MockInstance {
  const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let i = 0;
  const fake = <T extends ArrayBufferView | null>(buf: T): T => {
    // Only dice (`rollDie` reads one Uint32); ids etc. keep real randomness.
    if (!(buf instanceof Uint32Array) || buf.length !== 1) return original(buf);
    const v = values[i++];
    if (v === undefined) throw new Error("stubDice: ran out of scripted rolls");
    buf[0] = v - 1;
    return buf;
  };
  return vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(fake);
}
