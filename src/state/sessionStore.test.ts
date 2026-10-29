import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "@/schemas/character";
import type { Campaign, EncounterState } from "@/schemas/campaign";
import { makeCharacter } from "@/test/fixtures";

vi.mock("@/db/schema", async () => await import("@/test/fakeDb"));

import { clearTables, tables } from "@/test/fakeDb";
import { useSessionStore } from "./sessionStore";

const CAMPAIGN_ID = "camp-1";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    title: "T",
    characterId: "char-1",
    worldSeed: "s",
    settingId: "forgotten-realms",
    currentLocation: { name: "Here", description: "" },
    inWorldDay: 1,
    quests: [],
    factions: [],
    companions: [],
    pinnedFacts: [],
    placesVisited: [],
    npcsMet: [],
    rollingSummary: "",
    summaryThroughTurn: 0,
    journal: "",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Campaign;
}

function load(character: Character, camp: Campaign = campaign()): void {
  tables.campaigns.push(camp as never);
  tables.characters.push(character as never);
  useSessionStore.setState({ campaignId: camp.id, campaign: camp, character });
}

const hp = (current: number, max = 10) => ({ max, current, temp: 0 });
const state = () => useSessionStore.getState();

beforeEach(() => {
  clearTables();
  state().reset();
});

afterEach(() => {
  state().reset();
  vi.restoreAllMocks();
});

describe("turn ownership", () => {
  it("has no turn without a campaign", () => {
    expect(state().beginTurn()).toBeNull();
    expect(state().busy).toBe(false);
  });

  it("starting a turn aborts the previous one and marks the store busy", () => {
    load(makeCharacter());
    const a = state().beginTurn()!;
    expect(state().busy).toBe(true);
    expect(state().isTurnCurrent(a.id)).toBe(true);
    const b = state().beginTurn()!;
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    expect(state().isTurnCurrent(a.id)).toBe(false);
    expect(state().isTurnCurrent(b.id)).toBe(true);
  });

  it("a superseded turn finishing cannot clear its successor's busy flag", () => {
    load(makeCharacter());
    const a = state().beginTurn()!;
    const b = state().beginTurn()!;
    state().endTurn(a.id);
    expect(state().busy).toBe(true);
    state().endTurn(b.id);
    expect(state().busy).toBe(false);
  });

  it("the busy flag stays up until endTurn even after streaming stops", () => {
    load(makeCharacter());
    const turn = state().beginTurn()!;
    state().beginDraft();
    state().appendDraft("hello");
    expect(state().streaming).toBe(true);
    useSessionStore.setState({ streaming: false }); // what finalizeDraft does
    expect(state().busy).toBe(true);
    state().endTurn(turn.id);
    expect(state().busy).toBe(false);
  });

  it("reset() (navigation away) aborts the turn", () => {
    load(makeCharacter());
    const turn = state().beginTurn()!;
    state().reset();
    expect(turn.signal.aborted).toBe(true);
    expect(state().busy).toBe(false);
    expect(state().isTurnCurrent(turn.id)).toBe(false);
  });

  it("loading another campaign aborts the turn and invalidates it", async () => {
    load(makeCharacter());
    const turn = state().beginTurn()!;
    await state().loadCampaign("some-other-campaign");
    expect(turn.signal.aborted).toBe(true);
    expect(state().isTurnCurrent(turn.id)).toBe(false);
  });

  it("a turn is no longer current once the loaded campaign differs", () => {
    load(makeCharacter());
    const turn = state().beginTurn()!;
    useSessionStore.setState({ campaignId: "elsewhere" });
    expect(state().isTurnCurrent(turn.id)).toBe(false);
  });
});

describe("finalizeDraft", () => {
  it("persists and appends while the campaign matches, applying sanitize", async () => {
    load(makeCharacter());
    state().beginTurn();
    state().beginDraft();
    state().appendDraft("Prose. [ATTACK target=x");
    const msg = await state().finalizeDraft({
      campaignId: CAMPAIGN_ID,
      sanitize: (d) => d.replace(/\[ATTACK.*$/, "").trim(),
    });
    expect(msg?.content).toBe("Prose.");
    expect(tables.messages).toHaveLength(1);
    expect(state().messages).toHaveLength(1);
    expect(state().draftDm).toBe("");
  });

  it("writes nothing when the loaded campaign is not the one that asked", async () => {
    load(makeCharacter());
    state().beginDraft();
    state().appendDraft("Narration for the old campaign");
    const msg = await state().finalizeDraft({ campaignId: "old-campaign" });
    expect(msg).toBeNull();
    expect(tables.messages).toHaveLength(0);
    expect(state().messages).toHaveLength(0);
  });

  it("discardDraft drops the text without persisting", () => {
    load(makeCharacter());
    state().beginDraft();
    state().appendDraft("half a sent");
    state().discardDraft();
    expect(state().draftDm).toBe("");
    expect(state().streaming).toBe(false);
    expect(tables.messages).toHaveLength(0);
  });
});

describe("dying loop", () => {
  const dmg = (amount: number) => ({ kind: "damage" as const, amount });

  it("dropping to 0 opens the death saves with fresh pips", async () => {
    load(makeCharacter({ deathSaves: { successes: 2, failures: 2 } }));
    await state().applyHpChange(hp(0), dmg(10));
    expect(state().pendingDying).not.toBeNull();
    expect(state().character!.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("damage at 0 HP is a failed death save, a crit is two", async () => {
    load(makeCharacter({ hp: hp(0) }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    await state().applyHpChange(hp(0), dmg(4));
    expect(state().character!.deathSaves.failures).toBe(1);
    await state().applyHpChange(hp(0), dmg(4), { crit: true });
    expect(state().character!.deathSaves.failures).toBe(3);
    expect(state().pendingDeath).not.toBeNull();
    expect(state().pendingDying).toBeNull();
  });

  it("damage fully absorbed (amount 0) costs nothing", async () => {
    load(makeCharacter({ hp: hp(0) }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    await state().applyHpChange(hp(0), dmg(0));
    expect(state().character!.deathSaves.failures).toBe(0);
  });

  it("healing from 0 ends the dying loop and clears the pips", async () => {
    load(makeCharacter({ hp: hp(0), deathSaves: { successes: 1, failures: 2 } }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    await state().applyHpChange(hp(5), { kind: "heal", amount: 5 });
    expect(state().pendingDying).toBeNull();
    expect(state().character!.hp.current).toBe(5);
    expect(state().character!.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("a stable character hit again is dying again", async () => {
    load(makeCharacter({ hp: hp(0), deathSaves: { successes: 0, failures: 0, stable: true } }));
    await state().applyHpChange(hp(0), dmg(3));
    expect(state().pendingDying).not.toBeNull();
    expect(state().character!.deathSaves).toEqual({ successes: 0, failures: 1 });
  });

  it("narrated healing does not raise the dead; only the twist does", async () => {
    load(makeCharacter({ hp: hp(0), deathSaves: { successes: 0, failures: 3 } }));
    useSessionStore.setState({ pendingDeath: { id: "x" } });
    await state().applyHpChange(hp(6), { kind: "heal", amount: 6 });
    expect(state().character!.hp.current).toBe(0);
    await state().reviveToHalf();
    expect(state().character!.hp.current).toBe(5);
    expect(state().character!.deathSaves.failures).toBe(0);
    expect(state().pendingDeath).toBeNull();
  });

  it("applyDeathSaveDelta: three successes stabilize at 0 HP and persist the flag", async () => {
    load(makeCharacter({ hp: hp(0), deathSaves: { successes: 2, failures: 1 } }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    await state().applyDeathSaveDelta({ successes: 1, failures: 0, recovered: false });
    expect(state().pendingDying).toBeNull();
    expect(state().character!.deathSaves.stable).toBe(true);
    expect(state().character!.hp.current).toBe(0);
  });

  it("loadCampaign resumes the dying loop for a 0 HP character", async () => {
    tables.campaigns.push(campaign() as never);
    tables.characters.push(makeCharacter({ hp: hp(0) }) as never);
    await state().loadCampaign(CAMPAIGN_ID);
    expect(state().pendingDying).not.toBeNull();
    expect(state().pendingDeath).toBeNull();
  });

  it("loadCampaign leaves a stabilized character alone and re-opens death for 3 failures", async () => {
    tables.campaigns.push(campaign() as never);
    tables.characters.push(
      makeCharacter({ hp: hp(0), deathSaves: { successes: 0, failures: 0, stable: true } }) as never,
    );
    await state().loadCampaign(CAMPAIGN_ID);
    expect(state().pendingDying).toBeNull();
    expect(state().pendingDeath).toBeNull();

    tables.characters.length = 0;
    tables.characters.push(
      makeCharacter({ hp: hp(0), deathSaves: { successes: 0, failures: 3 } }) as never,
    );
    await state().loadCampaign(CAMPAIGN_ID);
    expect(state().pendingDeath).not.toBeNull();
  });
});

describe("encounters", () => {
  const entry = (id: string) => ({
    id,
    kind: "monster" as const,
    name: id,
    initiative: 10,
    hp: { max: 5, current: 5 },
    ac: 10,
    conditions: [],
    range: "near" as const,
    hidden: false,
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  });

  it("startEncounter closes every persisted combat first so a finished fight doesn't reload", async () => {
    load(makeCharacter());
    const stale = {
      id: "old",
      campaignId: CAMPAIGN_ID,
      mode: "combat",
      round: 3,
      turnIndex: 0,
      initiative: [],
      updatedAt: 1,
    } satisfies EncounterState;
    tables.encounters.push(stale as never);
    await state().startEncounter([entry("wolf")]);
    const modes = Object.fromEntries(tables.encounters.map((e) => [e.id, e.mode]));
    expect(modes.old).toBe("exploration");
    expect(tables.encounters.filter((e) => e.mode === "combat")).toHaveLength(1);
    expect(state().encounter?.initiative[0]?.id).toBe("wolf");
  });

  it("endEncounter settles round-based condition timers", async () => {
    load(
      makeCharacter({
        conditions: ["stunned", "poisoned"],
        conditionTimers: [
          { index: "stunned", rounds: 2 },
          { index: "poisoned", rounds: 100 },
        ],
      }),
    );
    await state().startEncounter([entry("wolf")]);
    await state().endEncounter();
    expect(state().encounter).toBeNull();
    expect(state().character!.conditionTimers).toEqual([]);
    expect(state().character!.conditions).toEqual(["poisoned"]);
    expect(tables.encounters.every((e) => e.mode === "exploration")).toBe(true);
  });
});

describe("concentration saves", () => {
  const concentrating = () =>
    makeCharacter({
      concentration: { spellName: "Bless", startedAtTs: 1 },
    });

  it("a second hit queues instead of overwriting the open save", async () => {
    load(concentrating());
    await state().requestConcentrationSave(8);
    await state().requestConcentrationSave(30);
    expect(state().pendingConcentration).toMatchObject({ damageTaken: 8, dc: 10 });
    expect(state().concentrationQueue).toEqual([30]);
  });

  it("passing the first save opens the queued one with its own DC", async () => {
    load(concentrating());
    await state().requestConcentrationSave(8);
    await state().requestConcentrationSave(30);
    await state().resolveConcentrationSave(15);
    expect(state().pendingConcentration).toMatchObject({ damageTaken: 30, dc: 15 });
    expect(state().concentrationQueue).toEqual([]);
    await state().resolveConcentrationSave(15);
    expect(state().pendingConcentration).toBeNull();
    expect(state().character!.concentration).not.toBeNull();
  });

  it("failing a save ends concentration and drops the queue", async () => {
    load(concentrating());
    await state().requestConcentrationSave(8);
    await state().requestConcentrationSave(30);
    await state().resolveConcentrationSave(3);
    expect(state().character!.concentration).toBeNull();
    expect(state().pendingConcentration).toBeNull();
    expect(state().concentrationQueue).toEqual([]);
  });
});

describe("travel hunger and exhaustion", () => {
  it("applies only the newly accrued exhaustion across consecutive trips", async () => {
    load(makeCharacter({ rations: 0, abilities: { con: 10 } }));
    await state().travel({ days: 4 });
    expect(state().character!.conditions).toEqual(["exhaustion1"]);
    await state().travel({ days: 1 });
    expect(state().character!.conditions).toEqual(["exhaustion2"]);
  });

  it("exhaustion 4 halves the HP ceiling: current HP is clamped", async () => {
    load(makeCharacter({ rations: 0, hp: hp(20, 20), conditions: ["exhaustion3"], daysWithoutFood: 3 }));
    await state().travel({ days: 1 });
    expect(state().character!.conditions).toEqual(["exhaustion4"]);
    expect(state().character!.hp).toMatchObject({ max: 20, current: 10 });
  });

  it("exhaustion 6 is death", async () => {
    load(makeCharacter({ rations: 0, conditions: ["exhaustion5"], daysWithoutFood: 3 }));
    await state().travel({ days: 1 });
    expect(state().pendingDeath).not.toBeNull();
  });

  it("long rest lowers exhaustion by one and heals to the (halved) maximum", async () => {
    load(makeCharacter({ hp: hp(1, 20), conditions: ["exhaustion5"] }));
    await state().longRest();
    expect(state().character!.conditions).toEqual(["exhaustion4"]);
    expect(state().character!.hp.current).toBe(10);
  });
});

describe("level-up hit points", () => {
  it("a CON increase raises max HP retroactively for every earlier level", async () => {
    load(makeCharacter({ abilities: { con: 13 }, hp: hp(11, 11), classes: [{ classId: "fighter", level: 3 }] }));
    await state().applyLevelUp({ classId: "fighter", asi: [{ ability: "con", amount: 1 }] });
    // d10 avg 6 + new CON mod 2 = 8, plus +1 for each of the 3 earlier levels.
    expect(state().character!.hp.max).toBe(11 + 8 + 3);
    expect(state().character!.hp.current).toBe(11 + 8 + 3);
  });

  it("no CON modifier change, no retroactive HP", async () => {
    load(makeCharacter({ abilities: { con: 12 }, hp: hp(11, 11), classes: [{ classId: "fighter", level: 3 }] }));
    await state().applyLevelUp({ classId: "fighter", asi: [{ ability: "con", amount: 1 }] });
    expect(state().character!.hp.max).toBe(11 + 7);
  });

  it("Tough keeps granting +2 on later levels", async () => {
    load(
      makeCharacter({
        abilities: { con: 10 },
        hp: hp(20, 20),
        classes: [{ classId: "fighter", level: 4 }],
        feats: [{ featId: "tough", level: 4 }],
      }),
    );
    await state().applyLevelUp({ classId: "fighter", asi: null });
    expect(state().character!.hp.max).toBe(20 + 6 + 2);
  });
});
