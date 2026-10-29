import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletionArgs, LLMProvider, StreamEvent } from "@/ai/provider";
import type { Campaign } from "@/schemas/campaign";
import type { Character } from "@/schemas/character";
import { makeCharacter, stubDice } from "@/test/fixtures";

vi.mock("@/db/schema", async () => await import("@/test/fakeDb"));

// The provider the loop picks is whatever `script.stream` says for this test.
const script = vi.hoisted(() => ({
  stream: null as null | ((args: CompletionArgs) => AsyncIterable<StreamEvent>),
}));
vi.mock("@/ai/providers/anthropic", () => ({
  createAnthropicProvider: (): LLMProvider => ({
    id: "claude",
    displayName: "test",
    supportsTools: false,
    supportsPromptCaching: false,
    streamCompletion: (args) => script.stream!(args),
  }),
}));

import { clearTables, tables } from "@/test/fakeDb";
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { runDmTurn } from "./loop";

const CAMPAIGN_ID = "camp-1";
const state = () => useSessionStore.getState();

function campaign(): Campaign {
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
  } as Campaign;
}

function load(character: Character): void {
  const camp = campaign();
  tables.campaigns.push(camp as never);
  tables.characters.push(character as never);
  useSessionStore.setState({ campaignId: camp.id, campaign: camp, character });
}

async function* emit(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) yield e;
}

const text = (delta: string): StreamEvent => ({ kind: "text", delta });
const done = (reason: Extract<StreamEvent, { kind: "done" }>["reason"]): StreamEvent => ({
  kind: "done",
  reason,
});

const dmMessages = () => tables.messages.filter((m) => m.role === "dm");
const systemMessages = () => tables.messages.filter((m) => m.role === "system");
const turn = (playerInput = "I look around") => runDmTurn({ playerInput, isFirstTurn: false });

beforeEach(() => {
  clearTables();
  useSessionStore.getState().reset();
  useKeysStore.setState({
    activeProvider: "claude",
    records: { claude: { providerId: "claude", key: "k", updatedAt: 0 } },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  useSessionStore.getState().reset();
  useKeysStore.setState({ activeProvider: null, records: {} });
  vi.restoreAllMocks();
});

describe("runDmTurn stream outcomes", () => {
  it("persists a normal reply and releases the busy flag only at the very end", async () => {
    load(makeCharacter());
    script.stream = () => emit(text("The door creaks open."), done("stop"));
    const running = turn();
    expect(state().busy).toBe(true);
    await running;
    expect(dmMessages().map((m) => m.content)).toEqual(["The door creaks open."]);
    expect(state().busy).toBe(false);
    expect(state().thinking).toBe(false);
  });

  it("stays busy while markup side effects (SRD lazy-load) are still resolving", async () => {
    load(makeCharacter());
    script.stream = () =>
      emit(
        text(
          'Steel rings out. [INITIATIVE][{"id":"g1","name":"Goblin","srdRef":"goblin","initiative":12}][/INITIATIVE]',
        ),
        done("stop"),
      );
    let busyDuringSideEffects = false;
    const unsubscribe = useSessionStore.subscribe((s, prev) => {
      // finalizeDraft flips streaming off before the markup is applied.
      if (prev.streaming && !s.streaming) busyDuringSideEffects = s.busy;
    });
    await turn();
    unsubscribe();
    expect(busyDuringSideEffects).toBe(true);
    expect(state().busy).toBe(false);
    expect(state().encounter?.initiative.find((e) => e.id === "g1")).toBeDefined();
  });

  it("aborted: nothing is persisted and no markup acts", async () => {
    load(makeCharacter());
    script.stream = () => emit(text("Half a sent [XP amount=500]x[/XP]"), done("aborted"));
    await turn();
    expect(dmMessages()).toHaveLength(0);
    expect(state().draftDm).toBe("");
    expect(state().character!.xp).toBe(0);
    expect(state().busy).toBe(false);
  });

  it("error: the partial draft is discarded, not saved", async () => {
    load(makeCharacter());
    script.stream = () => emit(text("Mid-sentence"), { kind: "error", message: "boom" }, done("error"));
    await turn();
    expect(dmMessages()).toHaveLength(0);
    expect(state().draftDm).toBe("");
    expect(state().error).toBe("boom");
  });

  it("refusal: a system notice instead of a DM message", async () => {
    load(makeCharacter());
    script.stream = () => emit(text("I can't help with that"), done("refusal"));
    await turn();
    expect(dmMessages()).toHaveLength(0);
    expect(systemMessages()).toHaveLength(1);
    expect(String(systemMessages()[0]!.content)).toMatch(/declined/i);
  });

  it("length: keeps the prose, strips the unfinished block, adds a notice, still applies finished blocks", async () => {
    load(makeCharacter());
    script.stream = () =>
      emit(
        text('The ogre roars. [XP amount=50]Well fought[/XP] Then [ATTACK target=player tohit=5 damage=2d'),
        done("length"),
      );
    await turn();
    const [msg] = dmMessages();
    expect(msg!.content).toBe("The ogre roars. [XP amount=50]Well fought[/XP] Then");
    expect(String(systemMessages()[0]!.content)).toMatch(/cut off/i);
    expect(state().character!.xp).toBe(50);
  });
});

describe("turn ownership", () => {
  it("a second turn aborts the first; the first's late events are dropped", async () => {
    load(makeCharacter());
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const signals: AbortSignal[] = [];
    let call = 0;
    script.stream = (args) => {
      signals.push(args.signal!);
      const mine = ++call;
      if (mine === 1) {
        return (async function* () {
          yield text("first-start ");
          await gate;
          yield text("first-late");
          yield done("stop");
        })();
      }
      return emit(text("second reply"), done("stop"));
    };
    const first = turn("one");
    await vi.waitFor(() => expect(state().draftDm).toBe("first-start "));
    await turn("two");
    expect(signals[0]!.aborted).toBe(true);
    releaseFirst();
    await first;
    expect(dmMessages().map((m) => m.content)).toEqual(["second reply"]);
    expect(state().busy).toBe(false);
  });

  it("leaving the campaign mid-stream drops the reply: no persistence, no side effects", async () => {
    load(makeCharacter());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    script.stream = () =>
      (async function* () {
        yield text("Narration [XP amount=900]x[/XP]");
        await gate;
        yield done("stop");
      })();
    const running = turn();
    await vi.waitFor(() => expect(state().draftDm).not.toBe(""));
    state().reset(); // navigate away
    release();
    await running;
    expect(dmMessages()).toHaveLength(0);
    expect(tables.characters[0]!.xp).toBe(0);
  });

  it("switching to another loaded campaign never writes the old reply into it", async () => {
    load(makeCharacter());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    script.stream = () =>
      (async function* () {
        yield text("old-campaign narration");
        await gate;
        yield done("stop");
      })();
    const running = turn();
    await vi.waitFor(() => expect(state().draftDm).not.toBe(""));
    // Player jumps straight to another campaign without unmounting.
    useSessionStore.setState({ campaignId: "camp-2" });
    release();
    await running;
    expect(dmMessages()).toHaveLength(0);
    expect(state().messages).toHaveLength(0);
  });
});

describe("armor class from gear", () => {
  it("enemy attacks use the derived AC, not the stale stored ac", async () => {
    // Stored ac 10 (creation-time), but chain mail + shield is equipped: AC 18.
    load(
      makeCharacter({
        ac: 10,
        inventory: [
          { id: "i1", srdRef: "chain-mail", name: "Chain Mail", qty: 1, equipped: true, attuned: false },
          { id: "i2", srdRef: "shield", name: "Shield", qty: 1, equipped: true, attuned: false },
        ],
      }),
    );
    stubDice([12, 1]); // d20 12 + 5 = 17: misses AC 18 (would have hit stored AC 10)
    script.stream = () =>
      emit(text("[ATTACK target=player tohit=5 damage=1d6 type=slashing]The orc swings[/ATTACK]"), done("stop"));
    await turn();
    const attackLine = String(systemMessages()[0]!.content);
    expect(attackLine).toContain("AC 18");
    expect(attackLine).toMatch(/misses/);
    expect(state().character!.hp.current).toBe(10);
  });

  it("the player's initiative entry carries the derived AC", async () => {
    load(
      makeCharacter({
        ac: 10,
        inventory: [{ id: "i1", srdRef: "chain-mail", name: "Chain Mail", qty: 1, equipped: true, attuned: false }],
      }),
    );
    script.stream = () =>
      emit(
        text(
          '[INITIATIVE][{"id":"player","kind":"pc","name":"Tester","initiative":14},{"id":"w1","name":"Wolf","hpMax":11,"ac":13,"initiative":10}][/INITIATIVE]',
        ),
        done("stop"),
      );
    await turn();
    expect(state().encounter!.initiative.find((e) => e.kind === "pc")!.ac).toBe(16);
  });
});

describe("initiative stats", () => {
  it("an unknown srdRef keeps the DM's HP/AC instead of 1 HP / AC 10", async () => {
    load(makeCharacter());
    script.stream = () =>
      emit(
        text('[INITIATIVE][{"id":"x","name":"Mystery","srdRef":"not-a-real-monster","hpMax":42,"ac":17,"initiative":9}][/INITIATIVE]'),
        done("stop"),
      );
    await turn();
    expect(state().encounter!.initiative.find((e) => e.id === "x")).toMatchObject({
      hp: { max: 42, current: 42 },
      ac: 17,
    });
    expect(systemMessages()).toHaveLength(0);
  });

  it("warns when there is neither DM stats nor an SRD match", async () => {
    load(makeCharacter());
    script.stream = () =>
      emit(text('[INITIATIVE][{"id":"x","name":"Mystery","srdRef":"nope-nope","initiative":9}][/INITIATIVE]'), done("stop"));
    await turn();
    expect(String(systemMessages()[0]!.content)).toContain("Mystery");
  });

  it("a new [INITIATIVE] replaces the finished fight instead of leaving it active in the DB", async () => {
    load(makeCharacter());
    const fight = (id: string) =>
      emit(text(`[INITIATIVE][{"id":"${id}","name":"${id}","hpMax":5,"ac":10,"initiative":9}][/INITIATIVE]`), done("stop"));
    script.stream = () => fight("first");
    await turn();
    script.stream = () => fight("second");
    await turn();
    expect(tables.encounters.filter((e) => e.mode === "combat")).toHaveLength(1);
    expect(state().encounter!.initiative.map((e) => e.id)).toEqual(["second"]);
  });
});

describe("prompts while dying", () => {
  const checkMarkup = "[CHECK skill=stealth dc=12]Sneak away[/CHECK]";

  it("raises a check card for a healthy player", async () => {
    load(makeCharacter());
    script.stream = () => emit(text(`Quiet now. ${checkMarkup}`), done("stop"));
    await turn();
    expect(state().pendingCheck).not.toBeNull();
  });

  it("does not stack check/save/reaction cards on a dying player", async () => {
    load(makeCharacter({ hp: { max: 10, current: 0, temp: 0 } }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    script.stream = () =>
      emit(
        text(
          `${checkMarkup} [SAVE ability=dex dc=13]Dodge[/SAVE] [REACTION ability=dex trigger="falling rock"]Brace[/REACTION]`,
        ),
        done("stop"),
      );
    await turn();
    expect(state().pendingCheck).toBeNull();
    expect(state().pendingSave).toBeNull();
    expect(state().pendingReaction).toBeNull();
  });

  it("an attack that drops the player to 0 suppresses the cards from the same message", async () => {
    load(makeCharacter({ hp: { max: 4, current: 4, temp: 0 } }));
    stubDice([20, 6, 6, 6, 6]); // nat 20 crit, damage dice
    script.stream = () =>
      emit(
        text(`[ATTACK target=player tohit=5 damage=1d6+4 type=slashing]Cleave[/ATTACK] ${checkMarkup}`),
        done("stop"),
      );
    await turn();
    expect(state().pendingDying).not.toBeNull();
    expect(state().pendingCheck).toBeNull();
  });

  it("an attack on a downed player costs a death save (crit = two)", async () => {
    load(makeCharacter({ hp: { max: 10, current: 0, temp: 0 } }));
    useSessionStore.setState({ pendingDying: { id: "d" } });
    stubDice([20, 3, 3]); // crit: 2d6 damage
    script.stream = () =>
      emit(text("[ATTACK target=player tohit=5 damage=1d6 type=slashing]Stab[/ATTACK]"), done("stop"));
    await turn();
    expect(state().character!.deathSaves.failures).toBe(2);
  });
});

describe("[ROUND] and [COND] in one message", () => {
  it("the round tick runs first, so the fresh condition keeps its full duration", async () => {
    load(makeCharacter());
    await state().startEncounter([
      {
        id: "w1",
        kind: "monster",
        name: "Wolf",
        initiative: 10,
        hp: { max: 5, current: 5 },
        ac: 10,
        conditions: [],
        range: "near",
        hidden: false,
        resistances: [],
        vulnerabilities: [],
        immunities: [],
      },
    ]);
    script.stream = () =>
      emit(text("The round ends. [COND target=player apply=blinded rounds=2]Dust[/COND] [ROUND]"), done("stop"));
    await turn();
    expect(state().character!.conditionTimers).toEqual([{ index: "blinded", rounds: 2 }]);
    expect(state().encounter!.round).toBe(2);
  });
});
