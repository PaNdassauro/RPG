/**
 * Death save resolver. 5e RAW:
 *  - At 0 HP and on the start of your turn, roll d20 (no modifier).
 *  - 1: counts as 2 failures. 2-9: failure. 10-19: success. 20: regain 1 HP.
 *  - 3 successes → stable (no longer dying). 3 failures → dead.
 *  - Taking damage while at 0 HP: 1 automatic failure (2 on crit).
 */
import { rollExpression } from "./dice";
import type { DiceRollResult } from "./types";

export interface DeathSaveOutcome {
  result: DiceRollResult;
  /** "success" or "failure" — abstracted from the d20 value. */
  kind: "success" | "failure" | "crit" | "fumble";
  /** How many success pips to add (0, 1). */
  successesDelta: number;
  /** How many failure pips to add (0, 1, 2). */
  failuresDelta: number;
  /** True if the player wakes with 1 HP (nat 20). */
  recovered: boolean;
}

export function rollDeathSave(): DeathSaveOutcome {
  const result = rollExpression("1d20");
  const v = result.kept[0]!.value;
  if (v === 20) {
    return { result, kind: "crit", successesDelta: 0, failuresDelta: 0, recovered: true };
  }
  if (v === 1) {
    return { result, kind: "fumble", successesDelta: 0, failuresDelta: 2, recovered: false };
  }
  if (v >= 10) {
    return { result, kind: "success", successesDelta: 1, failuresDelta: 0, recovered: false };
  }
  return { result, kind: "failure", successesDelta: 0, failuresDelta: 1, recovered: false };
}

export interface DeathPipsState {
  successes: number;
  failures: number;
}

export function applyDeathSaveOutcome(
  pips: DeathPipsState,
  outcome: Pick<DeathSaveOutcome, "successesDelta" | "failuresDelta">,
): DeathPipsState {
  return {
    successes: Math.min(3, pips.successes + outcome.successesDelta),
    failures: Math.min(3, pips.failures + outcome.failuresDelta),
  };
}

/** Damage taken at 0 HP imposes 1 failure (2 on a crit). */
export function damageAtZero(pips: DeathPipsState, crit: boolean): DeathPipsState {
  return {
    successes: pips.successes,
    failures: Math.min(3, pips.failures + (crit ? 2 : 1)),
  };
}

export type DyingResolution =
  | { kind: "still-dying"; pips: DeathPipsState }
  | { kind: "stabilized"; pips: DeathPipsState }
  | { kind: "dead"; pips: DeathPipsState }
  | { kind: "recovered"; pips: DeathPipsState };

export function evaluateDying(pips: DeathPipsState): DyingResolution["kind"] {
  if (pips.failures >= 3) return "dead";
  if (pips.successes >= 3) return "stabilized";
  return "still-dying";
}

/** Persisted death-save pips; `stable` marks 0 HP without the dying loop. */
export interface DeathSavesState extends DeathPipsState {
  stable?: boolean;
}

export const CLEAR_DEATH_SAVES: DeathSavesState = { successes: 0, failures: 0 };

export type DyingStatus = "dying" | "stable" | "dead" | "recovered";

/**
 * Fold one death-save roll's deltas into the persisted state. Three
 * failures = dead, three successes = stable (pips reset, so a later fall
 * starts fresh), a natural 20 wakes the character with 1 HP.
 */
export function resolveDeathSaveDelta(
  saves: DeathSavesState,
  delta: { successes: number; failures: number; recovered: boolean },
): { deathSaves: DeathSavesState; status: DyingStatus } {
  if (delta.recovered) return { deathSaves: { ...CLEAR_DEATH_SAVES }, status: "recovered" };
  const pips = applyDeathSaveOutcome(saves, {
    successesDelta: delta.successes,
    failuresDelta: delta.failures,
  });
  const verdict = evaluateDying(pips);
  if (verdict === "dead") return { deathSaves: pips, status: "dead" };
  if (verdict === "stabilized") {
    return { deathSaves: { ...CLEAR_DEATH_SAVES, stable: true }, status: "stable" };
  }
  return { deathSaves: pips, status: "dying" };
}

/**
 * Damage taken while already at 0 HP: one automatic failure (two on a crit).
 * Also ends stability — a stabilized character starts dying again.
 */
export function damageWhileAtZero(
  saves: DeathSavesState,
  crit: boolean,
): { deathSaves: DeathSavesState; status: "dying" | "dead" } {
  const pips = damageAtZero(saves, crit);
  return {
    deathSaves: { successes: pips.successes, failures: pips.failures },
    status: pips.failures >= 3 ? "dead" : "dying",
  };
}
