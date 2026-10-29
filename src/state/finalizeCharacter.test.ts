import { describe, expect, it } from "vitest";
import { finalizeCharacter, type WizardSnapshot } from "./finalizeCharacter";
import { buildStartingInventory } from "./startingEquipment";
import { armorClass, attacks } from "./sheetDerived";
import { getEquipment } from "@/data/srd";
import type { Character } from "@/schemas/character";

function snapshot(
  classId: string,
  choices: number[],
  scores: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>> = {},
): WizardSnapshot {
  return {
    identity: { name: "Aria", bio: "", portraitId: "p-01" },
    race: { raceId: "human", subraceId: null, abilityChoiceBonuses: {} },
    classChoice: { classId, level: 1 },
    background: { backgroundId: "acolyte" },
    abilities: {
      mode: "manual",
      scores: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10, ...scores },
      arrayAssignments: {},
      manualRolls: [],
    },
    skills: { selected: [] },
    equipment: { choices },
  };
}

function owned(c: Character): string[] {
  return c.inventory.map((i) => i.srdRef ?? i.name);
}

function equipped(c: Character): string[] {
  return c.inventory.filter((i) => i.equipped).map((i) => i.srdRef ?? i.name);
}

describe("finalizeCharacter starting equipment", () => {
  it("fighter: chosen chain mail + shield + weapons land in the inventory and set AC", () => {
    // option 0 of every group: chain mail / martial weapon + shield / light crossbow + bolts / dungeoneer's pack
    const c = finalizeCharacter(snapshot("fighter", [0, 0, 0, 0]));
    expect(owned(c)).toEqual(
      expect.arrayContaining(["chain-mail", "shield", "crossbow-light", "crossbow-bolt", "dungeoneers-pack"]),
    );
    expect(c.inventory.find((i) => i.srdRef === "crossbow-bolt")?.qty).toBe(20);
    expect(equipped(c)).toEqual(expect.arrayContaining(["chain-mail", "shield"]));
    // Heavy armor ignores DEX: 16 + shield 2.
    expect(armorClass(c).value).toBe(18);
    expect(c.ac).toBe(18);
  });

  it("fighter: the other option (leather + longbow) changes the gear and AC", () => {
    const c = finalizeCharacter(snapshot("fighter", [1, 1, 1, 1], { dex: 14 }));
    expect(owned(c)).toEqual(expect.arrayContaining(["leather-armor", "longbow", "handaxe"]));
    expect(owned(c)).not.toContain("chain-mail");
    expect(c.inventory.find((i) => i.srdRef === "arrow")?.qty).toBe(20);
    // Leather 11 + DEX 2; two martial weapons chosen, no shield.
    expect(armorClass(c).value).toBe(13);
    expect(c.ac).toBe(13);
  });

  it("equips a melee and a ranged weapon so the attack list is populated", () => {
    const c = finalizeCharacter(snapshot("fighter", [0, 0, 0, 0]));
    const weapons = attacks(c).filter((a) => a.source === "weapon");
    expect(weapons.map((w) => w.range.kind).sort()).toEqual(["melee", "ranged"]);
  });

  it("always-granted class items are included (rogue: leather armor, daggers, thieves' tools)", () => {
    const c = finalizeCharacter(snapshot("rogue", [0, 0, 0]));
    expect(owned(c)).toEqual(expect.arrayContaining(["leather-armor", "dagger", "thieves-tools", "rapier"]));
    expect(c.inventory.find((i) => i.srdRef === "dagger")?.qty).toBe(2);
    expect(armorClass(c).value).toBe(11 + 2);
  });

  it("merges duplicate grants into one stack", () => {
    // Wizard option 1 of group 1 is a dagger — no dupes — but sorcerer has 2 daggers
    // always-granted plus a simple weapon choice; ensure stacks never repeat an srdRef.
    const c = finalizeCharacter(snapshot("sorcerer", [1, 0, 0]));
    const refs = c.inventory.map((i) => i.srdRef ?? i.name);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("background starting gear is added (acolyte: clothes, pouch, a holy symbol)", () => {
    const c = finalizeCharacter(snapshot("wizard", [0, 0, 0]));
    expect(owned(c)).toEqual(expect.arrayContaining(["clothes-common", "pouch", "amulet"]));
  });

  it("an unarmored barbarian keeps Unarmored Defense, not a stale 10 + DEX", () => {
    const c = finalizeCharacter(snapshot("barbarian", [0, 0], { dex: 14, con: 16 }));
    expect(equipped(c)).not.toEqual(expect.arrayContaining(["chain-mail"]));
    const ac = armorClass(c);
    expect(ac.source).toBe("unarmoredDefense");
    expect(c.ac).toBe(ac.value); // 10 + 2 DEX + 3 CON
    expect(c.ac).toBe(15);
  });

  it("every granted item with an srdRef exists in the SRD data", () => {
    for (const classId of ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]) {
      const inv = buildStartingInventory({ classId, backgroundId: "acolyte", classChoices: [], dexScore: 14 });
      expect(inv.length).toBeGreaterThan(0);
      for (const item of inv) {
        if (item.srdRef) expect(getEquipment(item.srdRef)).toBeDefined();
        expect(item.qty).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
