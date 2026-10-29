import { afterEach, describe, expect, it, vi } from "vitest";
import { parseExpression, rollAttack, rollDamage, rollWithMode } from "./dice";
import { stubDice } from "@/test/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("parseExpression", () => {
  it("parses count, sides and signed modifier", () => {
    expect(parseExpression("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
    expect(parseExpression(" 1d20 - 1 ")).toEqual({ count: 1, sides: 20, modifier: -1 });
    expect(parseExpression("3d8")).toEqual({ count: 3, sides: 8, modifier: 0 });
  });

  it("rejects malformed or out-of-range expressions", () => {
    expect(() => parseExpression("d20")).toThrow();
    expect(() => parseExpression("0d6")).toThrow();
    expect(() => parseExpression("101d6")).toThrow();
    expect(() => parseExpression("1d1")).toThrow();
    expect(() => parseExpression("1d6+x")).toThrow();
  });
});

describe("rollAttack (scripted dice)", () => {
  it("hits when the total meets the AC", () => {
    stubDice([12]);
    const r = rollAttack({ bonus: 5, targetAC: 17 });
    expect(r.attack.total).toBe(17);
    expect(r).toMatchObject({ hit: true, crit: false });
  });

  it("misses one short of the AC", () => {
    stubDice([11]);
    expect(rollAttack({ bonus: 5, targetAC: 17 }).hit).toBe(false);
  });

  it("a natural 20 always hits and crits, a natural 1 always misses", () => {
    stubDice([20]);
    expect(rollAttack({ bonus: -5, targetAC: 30 })).toMatchObject({ hit: true, crit: true });
    vi.restoreAllMocks();
    stubDice([1]);
    expect(rollAttack({ bonus: 20, targetAC: 5 })).toMatchObject({ hit: false, crit: false });
  });

  it("advantage keeps the higher of two d20s, disadvantage the lower", () => {
    stubDice([4, 15]);
    expect(rollAttack({ bonus: 0, targetAC: 10, mode: "adv" }).attack.kept[0]!.value).toBe(15);
    vi.restoreAllMocks();
    stubDice([4, 15]);
    expect(rollAttack({ bonus: 0, targetAC: 10, mode: "dis" }).attack.kept[0]!.value).toBe(4);
  });
});

describe("rollDamage / rollWithMode", () => {
  it("doubles the dice (not the modifier) on a crit", () => {
    stubDice([3, 4, 5, 6]);
    const r = rollDamage("2d6+2", { crit: true });
    expect(r.rolls).toHaveLength(4);
    expect(r.total).toBe(3 + 4 + 5 + 6 + 2);
  });

  it("refuses advantage on non-d20 rolls", () => {
    expect(() => rollWithMode("1d8", "adv")).toThrow();
  });
});
