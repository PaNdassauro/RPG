import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLEAR_DEATH_SAVES,
  damageWhileAtZero,
  resolveDeathSaveDelta,
  rollDeathSave,
} from "./deathSave";
import { stubDice } from "@/test/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("rollDeathSave", () => {
  it.each([
    [20, { kind: "crit", successesDelta: 0, failuresDelta: 0, recovered: true }],
    [1, { kind: "fumble", successesDelta: 0, failuresDelta: 2, recovered: false }],
    [10, { kind: "success", successesDelta: 1, failuresDelta: 0, recovered: false }],
    [9, { kind: "failure", successesDelta: 0, failuresDelta: 1, recovered: false }],
  ] as const)("a natural %i", (face, expected) => {
    stubDice([face]);
    expect(rollDeathSave()).toMatchObject(expected);
  });
});

describe("resolveDeathSaveDelta", () => {
  const fail = { successes: 0, failures: 1, recovered: false };
  const win = { successes: 1, failures: 0, recovered: false };

  it("keeps dying until three of either", () => {
    const r = resolveDeathSaveDelta({ successes: 1, failures: 1 }, win);
    expect(r).toEqual({ deathSaves: { successes: 2, failures: 1 }, status: "dying" });
  });

  it("three failures is death", () => {
    expect(resolveDeathSaveDelta({ successes: 0, failures: 2 }, fail).status).toBe("dead");
  });

  it("a fumble (2 failures) at 2 failures overflows into death, clamped to 3", () => {
    const r = resolveDeathSaveDelta({ successes: 0, failures: 2 }, { successes: 0, failures: 2, recovered: false });
    expect(r.status).toBe("dead");
    expect(r.deathSaves.failures).toBe(3);
  });

  it("three successes stabilize: pips reset, stable flag set", () => {
    const r = resolveDeathSaveDelta({ successes: 2, failures: 2 }, win);
    expect(r.status).toBe("stable");
    expect(r.deathSaves).toEqual({ successes: 0, failures: 0, stable: true });
  });

  it("a natural 20 recovers and clears the pips", () => {
    const r = resolveDeathSaveDelta({ successes: 1, failures: 2 }, { successes: 0, failures: 0, recovered: true });
    expect(r).toEqual({ deathSaves: CLEAR_DEATH_SAVES, status: "recovered" });
  });
});

describe("damageWhileAtZero", () => {
  it("adds one failure, two on a crit, never touching successes", () => {
    expect(damageWhileAtZero({ successes: 2, failures: 0 }, false)).toEqual({
      deathSaves: { successes: 2, failures: 1 },
      status: "dying",
    });
    expect(damageWhileAtZero({ successes: 2, failures: 0 }, true).deathSaves.failures).toBe(2);
  });

  it("kills at three failures", () => {
    expect(damageWhileAtZero({ successes: 0, failures: 2 }, false).status).toBe("dead");
    expect(damageWhileAtZero({ successes: 0, failures: 1 }, true).status).toBe("dead");
  });

  it("ends stability: a stable character is dying again", () => {
    const r = damageWhileAtZero({ successes: 0, failures: 0, stable: true }, false);
    expect(r.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(r.deathSaves.stable).toBeUndefined();
  });
});
