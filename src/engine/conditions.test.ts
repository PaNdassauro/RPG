import { describe, expect, it } from "vitest";
import {
  addConditionTimer,
  applyConditionsToRoll,
  decrementConditionTimers,
  effectiveHpMax,
  exhaustionLevel,
  settleTimersAtCombatEnd,
  speedMultiplier,
  withExhaustionLevel,
} from "./conditions";
import type { Condition, ConditionTimer } from "@/schemas/character";

describe("applyConditionsToRoll advantage/disadvantage", () => {
  it("any disadvantage source gives disadvantage", () => {
    const r = applyConditionsToRoll({ conditions: ["poisoned"], kind: "attack" });
    expect(r.mode).toBe("dis");
    expect(r.sources).toEqual(["poisoned"]);
  });

  it("advantage + disadvantage cancel to a straight roll", () => {
    const r = applyConditionsToRoll({ conditions: ["poisoned"], kind: "attack", base: "adv" });
    expect(r.mode).toBeNull();
  });

  it("RAW: several disadvantages still cancel a single advantage", () => {
    const r = applyConditionsToRoll({
      conditions: ["poisoned", "prone", "blinded"],
      kind: "attack",
      base: "adv",
    });
    expect(r.mode).toBeNull();
  });

  it("stacked disadvantages alone stay plain disadvantage", () => {
    const r = applyConditionsToRoll({ conditions: ["poisoned", "prone"], kind: "attack" });
    expect(r.mode).toBe("dis");
  });

  it("a base disadvantage is kept when conditions add none", () => {
    const r = applyConditionsToRoll({ conditions: [], kind: "check", base: "dis" });
    expect(r.mode).toBe("dis");
  });

  it("paralysis auto-fails STR/DEX saves only", () => {
    expect(applyConditionsToRoll({ conditions: ["paralyzed"], kind: "save", ability: "dex" }).autoFail).toBe(true);
    expect(applyConditionsToRoll({ conditions: ["paralyzed"], kind: "save", ability: "wis" }).autoFail).toBe(false);
  });
});

describe("exhaustion is cumulative", () => {
  const roll = (level: number, kind: "attack" | "check" | "save") =>
    applyConditionsToRoll({ conditions: withExhaustionLevel([], level), kind }).mode;

  it("level 1 hurts checks only", () => {
    expect(roll(1, "check")).toBe("dis");
    expect(roll(1, "attack")).toBeNull();
    expect(roll(1, "save")).toBeNull();
  });

  it("level 2 keeps the check penalty from level 1", () => {
    expect(roll(2, "check")).toBe("dis");
    expect(roll(2, "attack")).toBeNull();
  });

  it("levels 3-5 add attacks and saves on top of checks", () => {
    for (const level of [3, 4, 5]) {
      expect(roll(level, "check")).toBe("dis");
      expect(roll(level, "attack")).toBe("dis");
      expect(roll(level, "save")).toBe("dis");
    }
  });

  it("tracks the highest level and replaces rather than stacks flags", () => {
    expect(exhaustionLevel(["exhaustion2", "exhaustion4"])).toBe(4);
    const c = withExhaustionLevel(["poisoned", "exhaustion2"], 3);
    expect(c).toEqual(["poisoned", "exhaustion3"]);
    expect(withExhaustionLevel(c, 0)).toEqual(["poisoned"]);
  });

  it("speed halves from 2, zero from 5; HP max halves from 4", () => {
    expect(speedMultiplier(["exhaustion1"])).toBe(1);
    expect(speedMultiplier(["exhaustion2"])).toBe(0.5);
    expect(speedMultiplier(["exhaustion5"])).toBe(0);
    expect(effectiveHpMax(31, ["exhaustion3"])).toBe(31);
    expect(effectiveHpMax(31, ["exhaustion4"])).toBe(15);
  });
});

describe("condition timers", () => {
  const base = { conditions: [] as Condition[], conditionTimers: [] as ConditionTimer[] };

  it("addConditionTimer flags the condition and replaces a prior timer", () => {
    const a = addConditionTimer(base, { index: "stunned", rounds: 3 });
    expect(a.conditions).toEqual(["stunned"]);
    const b = addConditionTimer(a, { index: "stunned", rounds: 5, source: "Hold Person" });
    expect(b.conditionTimers).toEqual([{ index: "stunned", rounds: 5, source: "Hold Person" }]);
  });

  it("decrement ticks every timer and expires those hitting 0", () => {
    const state = {
      conditions: ["stunned", "poisoned"] as Condition[],
      conditionTimers: [
        { index: "stunned", rounds: 1 },
        { index: "poisoned", rounds: 3 },
      ] as ConditionTimer[],
    };
    const r = decrementConditionTimers(state);
    expect(r.expired).toEqual(["stunned"]);
    expect(r.conditions).toEqual(["poisoned"]);
    expect(r.conditionTimers).toEqual([{ index: "poisoned", rounds: 2 }]);
  });

  it("untimed condition flags are never touched by a round tick", () => {
    const r = decrementConditionTimers({ conditions: ["prone"], conditionTimers: [] });
    expect(r.conditions).toEqual(["prone"]);
    expect(r.expired).toEqual([]);
  });

  it("a timer added after the tick keeps its full duration (ROUND before COND)", () => {
    const afterRound = decrementConditionTimers(base);
    const withCond = addConditionTimer(afterRound, { index: "blinded", rounds: 2 });
    expect(withCond.conditionTimers[0]!.rounds).toBe(2);
  });

  it("combat end expires short timers and keeps long effects as untimed flags", () => {
    const r = settleTimersAtCombatEnd({
      conditions: ["stunned", "poisoned", "prone"],
      conditionTimers: [
        { index: "stunned", rounds: 3 },
        { index: "poisoned", rounds: 100 },
      ],
    });
    expect(r.expired).toEqual(["stunned"]);
    expect(r.conditions).toEqual(["poisoned", "prone"]);
    expect(r.conditionTimers).toEqual([]);
  });
});
