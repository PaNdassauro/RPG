import { describe, expect, it } from "vitest";
import { assemblePrompt, type AssembledPrompt } from "./promptAssembly";
import { FR_FACTIONS } from "./frPrimer";
import { getWorld } from "@/data/settings";
import { finalizeCharacter } from "@/state/finalizeCharacter";
import { armorClass } from "@/state/sheetDerived";
import {
  CLOUD_PROFILE,
  LOCAL_PROFILE,
  narrativeCosts,
  windowStart,
  type ContextProfile,
} from "./context";
import type { Campaign, Chapter, ChatMessage, EncounterState, NpcEntry } from "@/schemas/campaign";
import type { Character } from "@/schemas/character";

function makeCharacter(): Character {
  return finalizeCharacter({
    identity: { name: "Aria", bio: "", portraitId: "p-01" },
    race: { raceId: "human", subraceId: null, abilityChoiceBonuses: {} },
    classChoice: { classId: "fighter", level: 1 },
    background: { backgroundId: "acolyte" },
    abilities: {
      mode: "manual",
      scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      arrayAssignments: {},
      manualRolls: [],
    },
    skills: { selected: [] },
    equipment: { choices: [] },
  });
}

function makeCampaign(character: Character, over: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    title: "Test",
    characterId: character.id,
    worldSeed: "seed-abc",
    settingId: "forgotten-realms",
    currentLocation: { name: "Zzyzx Hollow", description: "" },
    inWorldDay: 1,
    quests: [],
    factions: [],
    companions: [],
    pinnedFacts: [],
    placesVisited: [],
    npcsMet: [],
    rollingSummary: "",
    chapters: [],
    arcs: [],
    summaryThroughTurn: 0,
    journal: "",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

let tick = 0;
function msg(role: ChatMessage["role"], content: string): ChatMessage {
  tick += 1;
  return {
    id: `m${tick}`,
    campaignId: "camp-1",
    role,
    content,
    toolCallIds: [],
    diceRollIds: [],
    ts: tick,
  };
}

const STATE_PREFIX = /^<state>\n[\s\S]*?\n<\/state>\n\n/;

function buildRaw(
  history: ChatMessage[],
  pendingPlayerInput?: string,
  charOver: Partial<Character> = {},
  campOver: Partial<Campaign> = {},
  encounter?: EncounterState,
  profile?: ContextProfile,
): AssembledPrompt {
  const character = { ...makeCharacter(), ...charOver };
  return assemblePrompt({
    setting: getWorld(),
    character,
    campaign: makeCampaign(character, campOver),
    history,
    ...(profile ? { profile } : {}),
    ...(encounter ? { encounter } : {}),
    ...(pendingPlayerInput !== undefined ? { pendingPlayerInput } : {}),
  });
}

/** Like buildRaw, but with the final message's <state> block removed. */
function build(
  history: ChatMessage[],
  pendingPlayerInput?: string,
  charOver: Partial<Character> = {},
  campOver: Partial<Campaign> = {},
  profile?: ContextProfile,
): AssembledPrompt {
  const out = buildRaw(history, pendingPlayerInput, charOver, campOver, undefined, profile);
  return {
    ...out,
    messages: out.messages.map((m) => ({ ...m, content: m.content.replace(STATE_PREFIX, "") })),
  };
}

describe("assemblePrompt messages", () => {
  it("does not duplicate a player input already at the end of the history", () => {
    const out = build([msg("player", "I knock on the door.")], "I knock on the door.");
    expect(out.messages).toEqual([{ role: "user", content: "I knock on the door." }]);
  });

  it("appends the pending input when the history does not end with it", () => {
    const out = build(
      [msg("player", "Hello"), msg("dm", "The door opens.")],
      "I step inside.",
    );
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.messages[2]!.content).toBe("I step inside.");
  });

  it("repeats a legitimately identical input after a DM reply", () => {
    const out = build(
      [msg("player", "Attack."), msg("dm", "You miss.")],
      "Attack.",
    );
    expect(out.messages.map((m) => m.content)).toEqual(["Attack.", "You miss.", "Attack."]);
  });

  it("folds engine results into the adjacent user turn once", () => {
    const result = "Stealth: 17 vs DC 12 — Success";
    const out = build(
      [
        msg("player", "I sneak past."),
        msg("dm", "[CHECK skill=stealth dc=12]Slip past.[/CHECK]"),
        msg("system", result),
      ],
      result,
    );
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.messages[2]!.content).toBe(`(Engine: ${result})`);
    const all = out.messages.map((m) => m.content).join("\n");
    expect(all.split(result).length - 1).toBe(1);
  });

  it("keeps engine results between the player's action and the DM's reply", () => {
    const out = build([
      msg("player", "I swing my sword."),
      msg("system", "Longsword: 19 hit, 7 slashing"),
      msg("dm", "The goblin reels."),
      msg("player", "Again."),
    ]);
    expect(out.messages[0]!.content).toBe(
      "I swing my sword.\n(Engine: Longsword: 19 hit, 7 slashing)",
    );
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("always alternates roles, starts and ends with a user turn", () => {
    const history = [
      msg("dm", "Opening."),
      msg("dm", "More opening."),
      msg("system", "d20: 4"),
      msg("system", "d6: 2"),
      msg("player", "a"),
      msg("player", "b"),
      msg("dm", "c"),
      msg("tool", "ignored"),
      msg("system", "d20: 9"),
    ];
    const { messages } = build(history, "");
    expect(messages[0]!.role).toBe("user");
    expect(messages[messages.length - 1]!.role).toBe("user");
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i]!.role).not.toBe(messages[i - 1]!.role);
    }
    expect(messages.some((m) => m.content.includes("ignored"))).toBe(false);
  });

  it("closes a history that ends on a DM turn with a user turn", () => {
    const { messages } = build([msg("player", "Hi"), msg("dm", "Hello.")]);
    expect(messages[messages.length - 1]!.role).toBe("user");
  });

  it("bootstraps an empty history", () => {
    const { messages } = build([], "");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toContain("Open the scene");
    // The raw message still carries the state block in front of the bootstrap.
    const raw = buildRaw([], "").messages;
    expect(raw).toHaveLength(1);
    expect(raw[0]!.content).toMatch(/^<state>\n/);
    expect(raw[0]!.content).toContain("Open the scene");
  });

  it("puts a cache breakpoint on the last-but-one message only", () => {
    const { messages } = build(
      [msg("player", "a"), msg("dm", "b"), msg("player", "c")],
      "",
    );
    expect(messages.map((m) => m.cache === true)).toEqual([false, true, false]);
  });

  it("slides the window with hysteresis so the prefix is stable between turns", () => {
    // ~280 tokens per message against a 1000/600 window: a slide every few turns.
    const small: ContextProfile = { ...CLOUD_PROFILE, windowHigh: 1_000, windowLow: 600 };
    const history: ChatMessage[] = [];
    const starts: string[] = [];
    for (let i = 0; i < 60; i++) {
      history.push(msg(i % 2 === 0 ? "player" : "dm", `${String(i).padStart(3, "0")}`.padEnd(1_000, ".")));
      // A summary that always keeps up with the window.
      const { messages } = build(history, "", {}, { summaryThroughTurn: 1000 }, small);
      starts.push(messages[0]!.content);
    }
    const changes = starts.filter((s, i) => i > 0 && s !== starts[i - 1]).length;
    expect(changes).toBeGreaterThan(0);
    expect(changes).toBeLessThanOrEqual(60 / 2);
  });
});

describe("assemblePrompt memory", () => {
  const chapters: Chapter[] = [
    { id: "c1", fromTurn: 0, toTurn: 12, text: "CHAPTER-ONE-TEXT", createdAt: 1 },
    { id: "c2", fromTurn: 12, toTurn: 24, text: "CHAPTER-TWO-TEXT", createdAt: 2 },
  ];
  const memCamp: Partial<Campaign> = { chapters, summaryThroughTurn: 24 };

  /** Enough history that the window starts after the chaptered turns. */
  function longHistory(n: number): ChatMessage[] {
    return Array.from({ length: n }, (_, i) =>
      msg(i % 2 === 0 ? "player" : "dm", `${String(i).padStart(3, "0")}`.padEnd(1_000, ".")),
    );
  }
  const small: ContextProfile = { ...CLOUD_PROFILE, windowHigh: 3_000, windowLow: 2_000 };

  it("opens the history with the <memory> block, merged into the first user turn", () => {
    const history = longHistory(41);
    const out = buildRaw(history, "", {}, memCamp, undefined, small);
    const first = out.messages[0]!;
    expect(first.role).toBe("user");
    expect(first.content.startsWith("<memory>\n")).toBe(true);
    expect(first.content).toContain("CHAPTER-ONE-TEXT");
    expect(first.content).toContain("[turns 13-24] CHAPTER-TWO-TEXT");
    const all = out.messages.map((m) => m.content).join("\n");
    expect(all.split("<memory>").length - 1).toBe(1);
    for (let i = 1; i < out.messages.length; i++) {
      expect(out.messages[i]!.role).not.toBe(out.messages[i - 1]!.role);
    }
  });

  it("gets its own user turn when the window opens on a DM message", () => {
    const out = buildRaw([msg("dm", "Opening."), msg("player", "Hi")], "", {}, memCamp);
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.messages[0]!.content).toContain("<memory>");
    expect(out.messages[1]).toMatchObject({ role: "assistant", content: "Opening." });
  });

  it("is byte-identical across two consecutive turns that do not slide the window", () => {
    const camp: Partial<Campaign> = { chapters, summaryThroughTurn: 1000 };
    const h = longHistory(60);
    const start = (n: number) => windowStart(narrativeCosts(h.slice(0, n)), small);
    let n = 30;
    while (start(n + 2) !== start(n)) n++;
    const a = buildRaw(h.slice(0, n), "", {}, camp, undefined, small).messages;
    const b = buildRaw(h.slice(0, n + 2), "", {}, camp, undefined, small).messages;
    expect(a[0]!.content.startsWith("<memory>\n")).toBe(true);
    expect(b[0]!.content).toBe(a[0]!.content);
    const plain = (ms: typeof a) => ms.map((m) => ({ role: m.role, content: m.content }));
    expect(plain(b).slice(0, a.length - 1)).toEqual(plain(a).slice(0, a.length - 1));
  });

  it("changes only when chapters change", () => {
    const history = longHistory(41);
    const a = buildRaw(history, "", {}, memCamp, undefined, small).messages[0]!.content;
    const more: Chapter = { id: "c3", fromTurn: 24, toTurn: 30, text: "CHAPTER-THREE-TEXT", createdAt: 3 };
    const b = buildRaw(history, "", { }, { chapters: [...chapters, more], summaryThroughTurn: 30 }, undefined, small).messages[0]!.content;
    expect(b).not.toBe(a);
    expect(b).toContain("CHAPTER-THREE-TEXT");
  });

  it("shows a legacy rollingSummary as the first arc", () => {
    const legacy: Partial<Campaign> = {
      rollingSummary: "LEGACY-SUMMARY-TEXT",
      chapters: [{ id: "c1", fromTurn: 24, toTurn: 36, text: "CHAPTER-ONE-TEXT", createdAt: 1 }],
      summaryThroughTurn: 36,
    };
    const first = buildRaw(longHistory(41), "", {}, legacy, undefined, small).messages[0]!.content;
    expect(first).toContain("## Arcs\n[turns 1-24] LEGACY-SUMMARY-TEXT");
    expect(first.indexOf("LEGACY-SUMMARY-TEXT")).toBeLessThan(first.indexOf("CHAPTER-ONE-TEXT"));
  });

  it("keeps the summary out of the state tail", () => {
    const out = buildRaw(longHistory(41), "", {}, { ...memCamp, rollingSummary: "LEGACY-SUMMARY-TEXT" }, undefined, small);
    const last = out.messages[out.messages.length - 1]!.content;
    expect(last).not.toContain("LEGACY-SUMMARY-TEXT");
    expect(last).not.toContain("CHAPTER-TWO-TEXT");
    expect(last).not.toContain("What has happened so far");
  });

  it("explains <memory> to the DM in the static prompt", () => {
    const out = buildRaw([msg("player", "hi")]);
    expect(out.system[0]!.text).toMatch(/<memory>/);
    expect(out.system[0]!.text).toMatch(/authoritative record of earlier events, oldest first/);
  });

  it("applies the local profile's memory caps", () => {
    const many: Chapter[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      fromTurn: i * 12,
      toTurn: i * 12 + 12,
      text: `CH-${i}-TEXT`,
      createdAt: i,
    }));
    const out = buildRaw(longHistory(110), "", {}, { chapters: many, summaryThroughTurn: 96 }, undefined, LOCAL_PROFILE);
    const first = out.messages[0]!.content;
    expect(first).not.toContain("CH-3-TEXT");
    expect(first).toContain("CH-4-TEXT");
    expect(first).toContain("CH-7-TEXT");
  });
});

describe("assemblePrompt codex", () => {
  const npcs: NpcEntry[] = [
    { id: "n1", name: "Marta Quill", description: "MARTA-DETAIL baker of the quay.", kind: "ally", disposition: 1, key: "marta quill", addedAt: 1 },
    { id: "n2", name: "Orsik Vane", description: "ORSIK-DETAIL a smuggler.", kind: "foe", disposition: -2, key: "orsik vane", addedAt: 2 },
  ];

  it("details triggered NPCs, and lists the others by name only in the index", () => {
    const history = [msg("player", "I go and find Marta."), msg("dm", "Marta waves from her stall.")];
    const out = buildRaw(history, "I ask Marta about bread.", {}, { npcsMet: npcs });
    const state = out.messages[out.messages.length - 1]!.content;
    expect(state).toContain("MARTA-DETAIL");
    expect(state).not.toContain("ORSIK-DETAIL");
    expect(state).toContain("## Index");
    expect(state).toContain("- npc: Orsik Vane (foe)");
    expect(state).not.toContain("- npc: Marta Quill");
  });

  it("keeps the codex out of earlier messages and the system prompt", () => {
    const out = buildRaw([msg("player", "hi")], "", {}, { npcsMet: npcs });
    expect(out.system[0]!.text).not.toContain("Orsik");
    expect(out.system[0]!.text).toMatch(/Never re-emit \[PLACE\] or \[NPC\] for a name in the Index/);
  });
});

describe("assemblePrompt system and state", () => {
  const character = { ...makeCharacter(), hp: { current: 7, max: 31, temp: 0 }, ac: 99 };
  const campaign = makeCampaign(character, {
    currentLocation: { name: "Zzyzx Hollow", description: "" },
    inWorldDay: 1,
  });
  const history = [msg("player", "Hello"), msg("dm", "Hi there."), msg("player", "I look around.")];
  const out = assemblePrompt({ setting: getWorld(), character, campaign, history });
  const staticPart = out.system[0]!;
  const lastMessage = out.messages[out.messages.length - 1]!;
  const state = lastMessage.content;

  it("returns a single static, cacheable system part", () => {
    expect(out.system).toHaveLength(1);
    expect(staticPart.cache).toBe(true);
  });

  it("keeps every volatile value out of the system prompt, but keeps the world seed", () => {
    for (const volatile of ["HP 7/31", "Zzyzx Hollow", "Ches 1492", "Aria", "<state>\n"]) {
      expect(staticPart.text).not.toContain(volatile);
    }
    expect(staticPart.text).toContain("seed-abc");
  });

  it("explains the <state> block to the DM", () => {
    expect(staticPart.text).toMatch(/authoritative current game state/);
    expect(staticPart.text).toMatch(/never quote it/i);
  });

  it("puts the state block exactly once, in the final user message, before the player's input", () => {
    expect(lastMessage.role).toBe("user");
    expect(state).toMatch(STATE_PREFIX);
    expect(state.endsWith("\n\nI look around.")).toBe(true);
    const all = out.messages.map((m) => m.content).join("\n");
    expect(all.split("<state>").length - 1).toBe(1);
    expect(all.split("</state>").length - 1).toBe(1);
    for (const earlier of out.messages.slice(0, -1)) {
      expect(earlier.content).not.toContain("<state>");
    }
  });

  it("carries character, date and location in the state block", () => {
    expect(state).toContain("HP 7/31");
    expect(state).toContain("Zzyzx Hollow");
    expect(state).toContain("1 Ches 1492 DR (tenday 1)");
  });

  it("keeps earlier turns byte-identical when only the state changes", () => {
    const hurt = assemblePrompt({
      setting: getWorld(),
      character: { ...character, hp: { current: 2, max: 31, temp: 0 } },
      campaign: { ...campaign, inWorldDay: 9 },
      history,
    });
    expect(hurt.system).toEqual(out.system);
    expect(hurt.messages.slice(0, -1)).toEqual(out.messages.slice(0, -1));
    expect(hurt.messages[hurt.messages.length - 1]!.content).not.toBe(state);
  });

  it("includes combat status in the state block of the final message only", () => {
    const encounter = {
      id: "e1",
      campaignId: "camp-1",
      mode: "combat",
      round: 3,
      turnIndex: 1,
      initiative: [
        { id: "player", kind: "pc", name: "Aria", initiative: 15, hp: { current: 7, max: 31 }, ac: 15, conditions: [] },
        { id: "goblin-1", kind: "monster", name: "Goblin", initiative: 12, hp: { current: 4, max: 7 }, ac: 13, conditions: [] },
      ],
      updatedAt: 1,
    } as unknown as EncounterState;
    const raw = buildRaw(history, "", {}, {}, encounter).messages;
    const joined = raw.map((m) => m.content).join("\n");
    expect(joined.split("Combat is currently active").length - 1).toBe(1);
    expect(raw[raw.length - 1]!.content).toContain("Round 3");
    expect(raw[raw.length - 1]!.content).toContain("Goblin");
  });

  it("alternates roles with the state block in place", () => {
    for (let i = 1; i < out.messages.length; i++) {
      expect(out.messages[i]!.role).not.toBe(out.messages[i - 1]!.role);
    }
    expect(out.messages[0]!.role).toBe("user");
  });

  it("builds the [INITIATIVE] player entry from the derived AC, not the stored one", () => {
    const derived = armorClass(character).value;
    expect(state).toContain(`"ac":${derived}`);
    if (derived !== 99) expect(state).not.toContain('"ac":99');
  });

  it("documents the whole markup vocabulary the parser accepts, minus level-ups", () => {
    for (const tag of [
      "CHECK", "SAVE", "XP", "FACTION", "REP", "COMPANION", "SHOP", "TRAVEL", "ATTACK",
      "DAMAGE", "HEAL", "INITIATIVE", "REACTION", "ENDCOMBAT", "COND", "DISPOSITION",
      "ROUND", "INSPIRE", "PLACE", "NPC", "QUEST",
    ]) {
      expect(staticPart.text).toContain(`[${tag}`);
    }
    expect(staticPart.text).not.toContain("[LEVELUP");
  });

  it("names every canonical faction exactly", () => {
    for (const faction of FR_FACTIONS) expect(staticPart.text).toContain(faction);
  });

  it("states the no-menus rule and drops leaked or contradictory phrasing", () => {
    expect(staticPart.text).toMatch(/Never give the player a menu/);
    for (const banned of [
      /Ashfall/i, /Halric/, /Vellor/, /Greyhollow/, /Whispering Vault/, /Captain Vela/,
      /What else\?/, /invites their action/, /NON-NEGOTIABLE/i, /REQUIRED/,
      /generic high-fantasy/,
    ]) {
      expect(staticPart.text).not.toMatch(banned);
    }
  });
});
