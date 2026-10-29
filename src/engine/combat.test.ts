import { afterEach, describe, expect, it, vi } from "vitest";
import {
  concentrationSaveDc,
  resolveDamage,
  resolveHealing,
  scaleDamageByType,
} from "./combat";
import { stubDice } from "@/test/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("scaleDamageByType", () => {
  it("immunity zeroes damage", () => {
    expect(scaleDamageByType(9, "fire", { immunities: ["fire"] })).toEqual({ amount: 0, scale: "immune" });
  });

  it("resistance halves rounding down, vulnerability doubles", () => {
    expect(scaleDamageByType(9, "fire", { resistances: ["fire"] })).toEqual({ amount: 4, scale: "resisted" });
    expect(scaleDamageByType(9, "fire", { vulnerabilities: ["fire"] })).toEqual({ amount: 18, scale: "vulnerable" });
  });

  it("resistance + vulnerability cancel (RAW)", () => {
    expect(
      scaleDamageByType(9, "fire", { resistances: ["fire"], vulnerabilities: ["fire"] }),
    ).toEqual({ amount: 9, scale: "normal" });
  });

  it("is case-insensitive and ignores untyped or other-type damage", () => {
    expect(scaleDamageByType(8, "FIRE", { resistances: ["fire"] }).amount).toBe(4);
    expect(scaleDamageByType(8, undefined, { immunities: ["fire"] }).amount).toBe(8);
    expect(scaleDamageByType(8, "cold", { immunities: ["fire"] }).amount).toBe(8);
  });
});

describe("resolveDamage", () => {
  it("temp HP absorbs first, the rest hits current HP", () => {
    stubDice([6, 6]); // 2d6 = 12
    const r = resolveDamage({ hp: { max: 20, current: 15, temp: 5 } }, "2d6");
    expect(r.absorbedByTemp).toBe(5);
    expect(r.appliedToHp).toBe(7);
    expect(r.newHp).toEqual({ max: 20, current: 8, temp: 0 });
    expect(r.dropsToZero).toBe(false);
  });

  it("stops at 0 and reports dropsToZero", () => {
    stubDice([6, 6]);
    const r = resolveDamage({ hp: { max: 20, current: 4, temp: 0 } }, "2d6");
    expect(r.newHp.current).toBe(0);
    expect(r.appliedToHp).toBe(4);
    expect(r.dropsToZero).toBe(true);
  });

  it("already at 0 HP: nothing applied and no new drop", () => {
    stubDice([3]);
    const r = resolveDamage({ hp: { max: 20, current: 0, temp: 0 } }, "1d6");
    expect(r.appliedToHp).toBe(0);
    expect(r.amount).toBe(3);
    expect(r.dropsToZero).toBe(false);
  });

  it("immunity does no damage and resistance+vulnerability is a wash", () => {
    stubDice([5]);
    const immune = resolveDamage(
      { hp: { max: 10, current: 10, temp: 0 }, immunities: ["fire"] },
      "1d6",
      "fire",
    );
    expect(immune.amount).toBe(0);
    expect(immune.newHp.current).toBe(10);
    vi.restoreAllMocks();
    stubDice([5]);
    const wash = resolveDamage(
      { hp: { max: 10, current: 10, temp: 0 }, resistances: ["fire"], vulnerabilities: ["fire"] },
      "1d6",
      "fire",
    );
    expect(wash.amount).toBe(5);
  });

  it("applies resistance before temp HP", () => {
    stubDice([6, 6]); // 12 fire, resisted -> 6
    const r = resolveDamage(
      { hp: { max: 20, current: 20, temp: 4 }, resistances: ["fire"] },
      "2d6",
      "fire",
    );
    expect(r.rawAmount).toBe(12);
    expect(r.amount).toBe(6);
    expect(r.absorbedByTemp).toBe(4);
    expect(r.newHp).toEqual({ max: 20, current: 18, temp: 0 });
  });
});

describe("resolveHealing", () => {
  it("caps at max HP", () => {
    stubDice([4]);
    const r = resolveHealing({ hp: { max: 10, current: 8, temp: 0 } }, "1d8");
    expect(r.newHp.current).toBe(10);
    expect(r.applied).toBe(2);
  });

  it("honors a lower effective cap (exhaustion 4) without touching hp.max", () => {
    stubDice([8]);
    const r = resolveHealing({ hp: { max: 20, current: 2, temp: 0 } }, "1d8", 10);
    expect(r.newHp).toEqual({ max: 20, current: 10, temp: 0 });
  });

  it("revives from 0", () => {
    stubDice([3]);
    expect(resolveHealing({ hp: { max: 10, current: 0, temp: 0 } }, "1d4").newHp.current).toBe(3);
  });
});

describe("concentrationSaveDc", () => {
  it("is 10 or half the damage, whichever is higher", () => {
    expect(concentrationSaveDc(7)).toBe(10);
    expect(concentrationSaveDc(21)).toBe(10);
    expect(concentrationSaveDc(30)).toBe(15);
  });
});
