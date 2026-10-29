import { describe, expect, it } from "vitest";
import { assemblePrompt, type AssembledPrompt } from "./promptAssembly";
import { FR_FACTIONS } from "./frPrimer";
import { getWorld } from "@/data/settings";
import { finalizeCharacter } from "@/state/finalizeCharacter";
import { armorClass } from "@/state/sheetDerived";
import type { Campaign, ChatMessage } from "@/schemas/campaign";
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

function build(
  history: ChatMessage[],
  pendingPlayerInput?: string,
  charOver: Partial<Character> = {},
  campOver: Partial<Campaign> = {},
): AssembledPrompt {
  const character = { ...makeCharacter(), ...charOver };
  return assemblePrompt({
    setting: getWorld(),
    character,
    campaign: makeCampaign(character, campOver),
    history,
    ...(pendingPlayerInput !== undefined ? { pendingPlayerInput } : {}),
  });
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
  });

  it("puts a cache breakpoint on the last-but-one message only", () => {
    const { messages } = build(
      [msg("player", "a"), msg("dm", "b"), msg("player", "c")],
      "",
    );
    expect(messages.map((m) => m.cache === true)).toEqual([false, true, false]);
  });

  it("slides the window in steps so the prefix is stable between turns", () => {
    const history: ChatMessage[] = [];
    const starts: string[] = [];
    for (let i = 0; i < 50; i++) {
      history.push(msg(i % 2 === 0 ? "player" : "dm", `turn ${i}`));
      // A summary that always keeps up with the window.
      const { messages } = build(history, "", {}, { summaryThroughTurn: 1000 });
      starts.push(messages[0]!.content);
    }
    // The first message changes only a handful of times, not every turn.
    expect(new Set(starts).size).toBeLessThanOrEqual(6);
  });
});

describe("assemblePrompt system parts", () => {
  const character = { ...makeCharacter(), hp: { current: 7, max: 31, temp: 0 }, ac: 99 };
  const campaign = makeCampaign(character, {
    currentLocation: { name: "Zzyzx Hollow", description: "" },
    rollingSummary: "UNIQUE-SUMMARY-TEXT",
    inWorldDay: 1,
  });
  const out = assemblePrompt({
    setting: getWorld(),
    character,
    campaign,
    history: [],
  });
  const [staticPart, statePart] = out.system;

  it("returns a cacheable static part followed by an uncached state part", () => {
    expect(out.system).toHaveLength(2);
    expect(staticPart!.cache).toBe(true);
    expect(statePart!.cache).toBeFalsy();
  });

  it("keeps volatile values out of the static part", () => {
    for (const volatile of ["HP 7/31", "Zzyzx Hollow", "UNIQUE-SUMMARY-TEXT", "seed-abc", "Aria"]) {
      expect(staticPart!.text).not.toContain(volatile);
      expect(statePart!.text).toContain(volatile.startsWith("HP") ? "HP 7/31" : volatile);
    }
  });

  it("shows the in-world date in the state part", () => {
    expect(statePart!.text).toContain("1 Ches 1492 DR (tenday 1)");
  });

  it("builds the [INITIATIVE] player entry from the derived AC, not the stored one", () => {
    const derived = armorClass(character).value;
    expect(statePart!.text).toContain(`"ac":${derived}`);
    if (derived !== 99) expect(statePart!.text).not.toContain('"ac":99');
  });

  it("documents the whole markup vocabulary the parser accepts, minus level-ups", () => {
    for (const tag of [
      "CHECK", "SAVE", "XP", "FACTION", "REP", "COMPANION", "SHOP", "TRAVEL", "ATTACK",
      "DAMAGE", "HEAL", "INITIATIVE", "REACTION", "ENDCOMBAT", "COND", "DISPOSITION",
      "ROUND", "INSPIRE", "PLACE", "NPC", "QUEST",
    ]) {
      expect(staticPart!.text).toContain(`[${tag}`);
    }
    expect(staticPart!.text).not.toContain("[LEVELUP");
  });

  it("names every canonical faction exactly", () => {
    for (const faction of FR_FACTIONS) expect(staticPart!.text).toContain(faction);
  });

  it("states the no-menus rule and drops leaked or contradictory phrasing", () => {
    expect(staticPart!.text).toMatch(/Never give the player a menu/);
    for (const banned of [
      /Ashfall/i, /Halric/, /Vellor/, /Greyhollow/, /Whispering Vault/, /Captain Vela/,
      /What else\?/, /invites their action/, /NON-NEGOTIABLE/i, /REQUIRED/,
      /generic high-fantasy/,
    ]) {
      expect(staticPart!.text).not.toMatch(banned);
    }
  });
});
