import { describe, expect, it } from "vitest";
import { aliasesFor, capDescription, DESCRIPTION_CAP, normalizeText, selectCodex } from "./codexSelect";
import { CLOUD_PROFILE, LOCAL_PROFILE, type ContextProfile } from "./context";
import type { Campaign, NpcEntry, PlaceEntry, Quest } from "@/schemas/campaign";

let at = 0;
function place(name: string, description = "A place."): PlaceEntry {
  at += 1;
  return { id: `p${at}`, name, description, key: name.toLowerCase(), addedAt: at };
}
function npc(name: string, over: Partial<NpcEntry> = {}): NpcEntry {
  at += 1;
  return {
    id: `n${at}`,
    name,
    description: "A person.",
    kind: "neutral",
    disposition: 0,
    key: name.toLowerCase(),
    addedAt: at,
    ...over,
  };
}
function quest(id: string, status: Quest["status"]): Quest {
  at += 1;
  return { id, title: `Quest ${id}`, objective: "Do it.", status, updatedAt: at };
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c",
    title: "T",
    characterId: "ch",
    worldSeed: "s",
    settingId: "forgotten-realms",
    currentLocation: { name: "Nowhere", description: "" },
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const names = (xs: Array<{ name: string }>) => xs.map((x) => x.name);

describe("aliases and normalization", () => {
  it("strips accents and case, and reduces punctuation to spaces", () => {
    expect(normalizeText("  Élodie  d'Àvila!! ")).toBe("elodie d avila");
  });

  it("uses the full name plus each distinctive word of 4+ letters", () => {
    expect(aliasesFor("Yagra Stonefist")).toEqual(["yagra stonefist", "yagra", "stonefist"]);
    // Titles and particles never stand alone; short words are dropped.
    expect(aliasesFor("Lord of the Old Mill")).toEqual(["lord of the old mill", "mill"]);
    expect(aliasesFor("Maria da Silva")).toEqual(["maria da silva", "maria", "silva"]);
    expect(aliasesFor("Lady Evo")).toEqual(["lady evo"]);
    expect(aliasesFor("")).toEqual([]);
  });
});

describe("triggered codex", () => {
  const profile = CLOUD_PROFILE;

  it("matches whole words, ignoring case and accents", () => {
    const c = campaign({
      npcsMet: [npc("Zoë Brightwater"), npc("Marta"), npc("Ann")],
    });
    // "marta" inside "smarta" is not a hit; "BRIGHTWATER" is, via a word alias.
    const sel = selectCodex(c, ["smarta shouted", "BRIGHTWATER! Zoe, wait"], profile);
    expect(names(sel.triggeredNpcs)).toEqual(["Zoë Brightwater"]);
    const none = selectCodex(c, ["The Martas and the Annas"], profile);
    expect(none.triggeredNpcs).toEqual([]);
  });

  it("gives core detail to the current place and keeps it out of the triggered list", () => {
    const here = place("The Yawning Portal", "A tavern around a well.");
    const c = campaign({
      currentLocation: { name: "the yawning portal", description: "" },
      placesVisited: [here, place("Dock Ward")],
    });
    const sel = selectCodex(c, ["We leave the Yawning Portal for the Dock Ward."], profile);
    expect(sel.currentPlace?.name).toBe("The Yawning Portal");
    expect(names(sel.triggeredPlaces)).toEqual(["Dock Ward"]);
    expect(sel.index.map((i) => i.label)).not.toContain("The Yawning Portal");
  });

  it("recurses one level through descriptions", () => {
    const c = campaign({
      npcsMet: [
        npc("Marta", { description: "Sister of the harbormaster Orsik." }),
        npc("Orsik Vane", { description: "Mentions Kellan once." }),
        npc("Kellan"),
      ],
    });
    const sel = selectCodex(c, ["Marta waves."], profile);
    // Orsik is named in Marta's description; Kellan only in Orsik's: one level only.
    expect(names(sel.triggeredNpcs)).toEqual(["Marta", "Orsik Vane"]);
    expect(sel.index.map((i) => i.label)).toContain("Kellan (neutral)");
  });

  it("ranks by recency of the latest mention, then foes and devoted NPCs first", () => {
    const c = campaign({
      npcsMet: [
        npc("Alpha"),
        npc("Bravo"),
        npc("Charlie", { kind: "foe" }),
        npc("Delta", { disposition: 2 }),
        npc("Echo"),
      ],
    });
    const sel = selectCodex(c, ["Alpha was here.", "Bravo, Charlie, Delta and Echo arrive."], profile);
    // Alpha is older; among the newest, Charlie (foe) and Delta (devoted) lead.
    expect(names(sel.triggeredNpcs)).toEqual(["Charlie", "Delta", "Bravo", "Echo", "Alpha"]);
  });

  it("fills only up to the token budget, most recent first, the rest go to the index", () => {
    const long = "x".repeat(DESCRIPTION_CAP * 2);
    const c = campaign({
      npcsMet: ["Aaaa", "Bbbb", "Cccc", "Dddd", "Eeee"].map((n) => npc(n, { description: long })),
    });
    const tight: ContextProfile = { ...profile, triggeredBudget: 220 };
    const sel = selectCodex(c, ["Aaaa", "Bbbb", "Cccc", "Dddd", "Eeee"], tight);
    // Each entry costs ~93 tokens, so two fit; the newest mentions win.
    expect(names(sel.triggeredNpcs)).toEqual(["Eeee", "Dddd"]);
    expect(sel.index.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Aaaa (neutral)", "Bbbb (neutral)", "Cccc (neutral)"]),
    );
  });

  it("caps descriptions", () => {
    const capped = capDescription("y".repeat(1000));
    expect(capped.length).toBeLessThanOrEqual(DESCRIPTION_CAP);
    expect(capped.endsWith("…")).toBe(true);
    expect(capDescription("short")).toBe("short");
  });
});

describe("index and core", () => {
  it("lists untriggered entries by name only, plus resolved quests, newest first, capped", () => {
    const places = Array.from({ length: 60 }, (_, i) => place(`Place ${i}`));
    const c = campaign({
      npcsMet: [npc("Old Friend", { description: "SECRET-DETAIL", kind: "ally" })],
      placesVisited: places,
      quests: [quest("done-1", "completed"), quest("open-1", "active")],
    });
    const sel = selectCodex(c, [], LOCAL_PROFILE);
    expect(sel.triggeredNpcs).toEqual([]);
    expect(sel.index).toHaveLength(LOCAL_PROFILE.indexMax);
    // The newest item (the resolved quest) comes first; active quests are core, not index.
    expect(sel.index[0]!.kind).toBe("quest");
    expect(sel.index.some((i) => i.label.includes("open-1"))).toBe(false);
    expect(sel.index.map((i) => i.label)).toContain("Old Friend (ally)");
    expect(sel.index.some((i) => i.label.includes("SECRET-DETAIL"))).toBe(false);
    expect(sel.activeQuests.map((q) => q.id)).toEqual(["open-1"]);
  });

  it("carries the 150 most recent entries on the cloud profile", () => {
    const c = campaign({ placesVisited: Array.from({ length: 200 }, (_, i) => place(`P${i}`)) });
    expect(selectCodex(c, [], CLOUD_PROFILE).index).toHaveLength(150);
  });
});
