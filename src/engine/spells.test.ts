import { describe, expect, it } from "vitest";
import {
  initializeSlotsFromClasses,
  multiclassCasterLevel,
  multiclassSlotsForLevel,
  pactSlotCount,
  resetWarlockSlots,
} from "./spells";
import { getClassLevel } from "@/data/srd";
import { makeCharacter } from "@/test/fixtures";
import type { Character } from "@/schemas/character";

const resolve = (classId: string, level: number) =>
  getClassLevel(classId, level)?.spellcasting ?? null;

function slotsOf(c: Character): number[] {
  const s = c.spellSlots!;
  return [s.l1, s.l2, s.l3, s.l4, s.l5, s.l6, s.l7, s.l8, s.l9].map((e) => e.max);
}

function withClasses(classes: Character["classes"], extra: Partial<Character> = {}): Character {
  return makeCharacter({ classes, ...extra });
}

describe("multiclass caster level", () => {
  it("full casters count fully, half casters /2 and third casters /3, rounding down", () => {
    expect(multiclassCasterLevel([{ classId: "wizard", level: 5 }])).toBe(5);
    expect(multiclassCasterLevel([{ classId: "paladin", level: 5 }])).toBe(2);
    expect(multiclassCasterLevel([{ classId: "ranger", level: 3 }])).toBe(1);
    expect(multiclassCasterLevel([{ classId: "fighter", level: 9, subclassId: "eldritch-knight" }])).toBe(3);
    expect(
      multiclassCasterLevel([
        { classId: "cleric", level: 4 },
        { classId: "paladin", level: 5 },
      ]),
    ).toBe(6);
  });

  it("warlock pact magic never counts, non-casters add nothing", () => {
    expect(
      multiclassCasterLevel([
        { classId: "warlock", level: 10 },
        { classId: "fighter", level: 5 },
      ]),
    ).toBe(0);
  });

  it("table rows match the SRD", () => {
    expect(multiclassSlotsForLevel(1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(multiclassSlotsForLevel(5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(multiclassSlotsForLevel(11)).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(multiclassSlotsForLevel(20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    expect(multiclassSlotsForLevel(0)).toEqual(new Array(9).fill(0));
  });
});

describe("initializeSlotsFromClasses", () => {
  it("a single caster keeps its own class table", () => {
    const c = initializeSlotsFromClasses(withClasses([{ classId: "paladin", level: 5 }]), resolve);
    expect(slotsOf(c).slice(0, 3)).toEqual([4, 2, 0]); // PHB paladin 5, not the multiclass row
  });

  it("two casters use the multiclass table instead of summing both class tables", () => {
    const c = initializeSlotsFromClasses(
      withClasses([
        { classId: "wizard", level: 3 },
        { classId: "cleric", level: 3 },
      ]),
      resolve,
    );
    // caster level 6 -> 4/3/3. Summing the class tables would give 8/4.
    expect(slotsOf(c)).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0]);
  });

  it("half + full casters: cleric 4 / paladin 5 is caster level 6", () => {
    const c = initializeSlotsFromClasses(
      withClasses([
        { classId: "cleric", level: 4 },
        { classId: "paladin", level: 5 },
      ]),
      resolve,
    );
    expect(slotsOf(c)).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0]);
  });

  it("warlock pact slots sit on top of the multiclass table", () => {
    const c = initializeSlotsFromClasses(
      withClasses([
        { classId: "wizard", level: 3 },
        { classId: "cleric", level: 3 },
        { classId: "warlock", level: 3 },
      ]),
      resolve,
    );
    // table 4/3/3 + warlock 3 = two 2nd-level pact slots
    expect(slotsOf(c)).toEqual([4, 5, 3, 0, 0, 0, 0, 0, 0]);
  });

  it("preserves spent slots up to the new max", () => {
    const first = initializeSlotsFromClasses(withClasses([{ classId: "wizard", level: 3 }]), resolve);
    const spent: Character = {
      ...first,
      spellSlots: { ...first.spellSlots!, l1: { max: first.spellSlots!.l1.max, used: 3 } },
    };
    const leveled = initializeSlotsFromClasses(
      { ...spent, classes: [{ classId: "wizard", level: 4 }] },
      resolve,
    );
    expect(leveled.spellSlots!.l1).toEqual({ max: 4, used: 3 });
  });

  it("non-casters get no slots block", () => {
    const c = withClasses([{ classId: "fighter", level: 5 }]);
    expect(initializeSlotsFromClasses(c, resolve).spellSlots).toBeUndefined();
  });
});

describe("warlock short rest", () => {
  it("refunds only the pact slots' share of a shared pool", () => {
    expect(pactSlotCount(1)).toBe(1);
    expect(pactSlotCount(3)).toBe(2);
    expect(pactSlotCount(11)).toBe(3);
    expect(pactSlotCount(17)).toBe(4);
    const base = initializeSlotsFromClasses(
      withClasses([
        { classId: "wizard", level: 3 },
        { classId: "cleric", level: 3 },
        { classId: "warlock", level: 3 },
      ]),
      resolve,
    );
    const spent: Character = {
      ...base,
      spellSlots: { ...base.spellSlots!, l2: { max: 5, used: 5 } },
    };
    expect(resetWarlockSlots(spent).spellSlots!.l2).toEqual({ max: 5, used: 3 });
  });
});
