import { describe, expect, it } from "vitest";
import { hungerThreshold, resolveTravelHunger } from "./hunger";

const base = { rationsBefore: 0, days: 1, daysWithoutFood: 0, conMod: 0, exhaustionLevel: 0 };

describe("hungerThreshold", () => {
  it("is 3 + CON mod, at least 1", () => {
    expect(hungerThreshold(2)).toBe(5);
    expect(hungerThreshold(0)).toBe(3);
    expect(hungerThreshold(-5)).toBe(1);
  });
});

describe("resolveTravelHunger", () => {
  it("eats a ration per day and adds no exhaustion", () => {
    const r = resolveTravelHunger({ ...base, rationsBefore: 5, days: 3 });
    expect(r).toMatchObject({ rationsConsumed: 3, rationsAfter: 2, daysHungry: 0, daysWithoutFood: 0, levelsAdded: 0 });
  });

  it("days within the limit only advance the hunger counter", () => {
    const r = resolveTravelHunger({ ...base, days: 3 });
    expect(r.daysWithoutFood).toBe(3);
    expect(r.exhaustionLevel).toBe(0);
  });

  it("the first day past the limit costs one level", () => {
    const r = resolveTravelHunger({ ...base, days: 4 });
    expect(r.levelsAdded).toBe(1);
    expect(r.exhaustionLevel).toBe(1);
  });

  it("4 hungry days then 1 more adds exactly 1 more level, not the whole overshoot again", () => {
    const first = resolveTravelHunger({ ...base, days: 4 });
    expect(first.exhaustionLevel).toBe(1);
    const second = resolveTravelHunger({
      ...base,
      days: 1,
      daysWithoutFood: first.daysWithoutFood,
      exhaustionLevel: first.exhaustionLevel,
    });
    expect(second.levelsAdded).toBe(1);
    expect(second.exhaustionLevel).toBe(2);
  });

  it("a long trip pays each day past the limit once", () => {
    expect(resolveTravelHunger({ ...base, days: 7 }).exhaustionLevel).toBe(4);
  });

  it("caps at level 6", () => {
    expect(resolveTravelHunger({ ...base, days: 30 }).exhaustionLevel).toBe(6);
  });

  it("eating part of the trip restarts the streak", () => {
    const r = resolveTravelHunger({ ...base, rationsBefore: 3, days: 5, daysWithoutFood: 2 });
    expect(r.daysHungry).toBe(2);
    expect(r.daysWithoutFood).toBe(2);
    expect(r.levelsAdded).toBe(0);
  });

  it("a fully fed trip resets the counter", () => {
    const r = resolveTravelHunger({ ...base, rationsBefore: 2, days: 2, daysWithoutFood: 3 });
    expect(r.daysWithoutFood).toBe(0);
  });

  it("ignores non-positive days", () => {
    expect(resolveTravelHunger({ ...base, rationsBefore: 2, days: 0 })).toMatchObject({
      rationsConsumed: 0,
      rationsAfter: 2,
    });
  });
});
