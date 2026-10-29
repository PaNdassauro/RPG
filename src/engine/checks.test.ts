import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSkillCheck } from "./checks";
import { resolveSavingThrow } from "./saves";
import { makeCharacter, stubDice } from "@/test/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("ability checks and saves have no auto-success / auto-fail", () => {
  const hero = makeCharacter({ abilities: { str: 10, dex: 10 } }); // +0 everywhere

  it("a natural 20 does not beat an unreachable DC (check)", () => {
    stubDice([20]);
    const r = resolveSkillCheck(hero, "athletics", 25);
    expect(r.total).toBe(20);
    expect(r.success).toBe(false);
    expect(r.isCritical).toBe(true); // visual flag survives
  });

  it("a natural 1 does not fail a trivial DC (check)", () => {
    stubDice([1]);
    const r = resolveSkillCheck(makeCharacter({ abilities: { str: 20 } }), "athletics", 3);
    expect(r.total).toBe(6);
    expect(r.success).toBe(true);
    expect(r.isFumble).toBe(true);
  });

  it("the same holds for saves", () => {
    stubDice([20]);
    expect(resolveSavingThrow(hero, "dex", 25)).toMatchObject({ success: false, isCritical: true });
    vi.restoreAllMocks();
    stubDice([1]);
    expect(resolveSavingThrow(makeCharacter({ abilities: { dex: 20 } }), "dex", 3)).toMatchObject({
      success: true,
      isFumble: true,
    });
  });

  it("meeting the DC exactly succeeds", () => {
    stubDice([12]);
    expect(resolveSkillCheck(hero, "athletics", 12).success).toBe(true);
  });
});
