import { describe, expect, it } from "vitest";
import type { Campaign, ChatMessage, DiceRollRecord, NpcEntry } from "@/schemas/campaign";
import {
  dispositionTier,
  formatTenday,
  formatWorldDate,
  fraction,
  healthTone,
  parseOpenState,
  parseRollPurpose,
  presentNpcs,
  recentRolls,
  reputationTier,
  rollVerdict,
  type Translate,
} from "./worldRail";

function npc(name: string, kind: NpcEntry["kind"] = "neutral", description = ""): NpcEntry {
  return { id: name, name, description, kind, disposition: 0, key: name.toLowerCase(), addedAt: 1 };
}

function campaignWith(npcs: NpcEntry[]): Campaign {
  return {
    id: "c",
    title: "T",
    characterId: "ch",
    worldSeed: "",
    settingId: "fr",
    currentLocation: { name: "Phandalin", description: "" },
    inWorldDay: 1,
    quests: [],
    factions: [],
    companions: [],
    pinnedFacts: [],
    placesVisited: [],
    npcsMet: npcs,
    rollingSummary: "",
    chapters: [],
    arcs: [],
    summaryThroughTurn: 0,
    journal: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

function msg(role: ChatMessage["role"], content: string, ts: number): ChatMessage {
  return { id: `${ts}`, campaignId: "c", role, content, toolCallIds: [], diceRollIds: [], ts };
}

function roll(over: Partial<DiceRollRecord>): DiceRollRecord {
  return {
    id: "r",
    expression: "1d20+3",
    mode: null,
    rolls: [],
    kept: [],
    modifier: 3,
    total: 10,
    isCritical: false,
    isFumble: false,
    dc: null,
    ts: 1,
    ...over,
  };
}

describe("presentNpcs", () => {
  const camp = campaignWith([
    npc("Sildar Hallwinter", "ally"),
    npc("Gundren Rockseeker"),
    npc("Klarg", "foe"),
  ]);

  it("lists NPCs the recent scene names, and only those", () => {
    const out = presentNpcs(camp, [msg("dm", "Sildar nods at you while Klarg growls.", 1)]);
    expect(out.map((n) => n.name).sort()).toEqual(["Klarg", "Sildar Hallwinter"]);
  });

  it("is empty with no narrative messages", () => {
    expect(presentNpcs(camp, [])).toEqual([]);
  });

  it("ignores NPCs named only by another entry's description", () => {
    const withLink = campaignWith([
      npc("Mirna", "neutral", "Sister of Gundren Rockseeker."),
      npc("Gundren Rockseeker"),
    ]);
    const out = presentNpcs(withLink, [msg("dm", "Mirna waves.", 1)]);
    expect(out.map((n) => n.name)).toEqual(["Mirna"]);
  });
});

describe("parseRollPurpose", () => {
  it("splits machine tags", () => {
    expect(parseRollPurpose("check:perception")).toMatchObject({ kind: "check", detail: "perception" });
    expect(parseRollPurpose("attack:Longsword:abc")).toMatchObject({ kind: "attack", detail: "Longsword" });
    expect(parseRollPurpose("death-save").kind).toBe("deathSave");
    expect(parseRollPurpose("second-wind").kind).toBe("secondWind");
    expect(parseRollPurpose("manual").kind).toBe("manual");
  });
  it("keeps unknown purposes raw", () => {
    expect(parseRollPurpose("2d6+1")).toMatchObject({ kind: "other", raw: "2d6+1" });
    expect(parseRollPurpose(undefined)).toMatchObject({ kind: "other", raw: "" });
  });
});

describe("rollVerdict", () => {
  it("decides checks by the DC alone", () => {
    expect(rollVerdict(roll({ purpose: "check:stealth", dc: 12, total: 15 }))).toBe("success");
    expect(rollVerdict(roll({ purpose: "check:stealth", dc: 12, total: 9, isCritical: true }))).toBe("failure");
  });
  it("reads crits on attacks", () => {
    expect(rollVerdict(roll({ purpose: "attack", isCritical: true }))).toBe("critical");
    expect(rollVerdict(roll({ purpose: "attack", isFumble: true }))).toBe("fumble");
  });
  it("has no verdict for a bare roll", () => {
    expect(rollVerdict(roll({ purpose: "manual" }))).toBeNull();
  });
});

describe("recentRolls", () => {
  it("returns the newest first, capped", () => {
    const rolls = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((ts) => [`r${ts}`, roll({ id: `r${ts}`, ts })]),
    );
    expect(recentRolls(rolls).map((r) => r.ts)).toEqual([7, 6, 5, 4, 3]);
  });
});

describe("tiers and bars", () => {
  it("maps reputation to tiers", () => {
    expect(reputationTier(100)).toBe("revered");
    expect(reputationTier(40)).toBe("allied");
    expect(reputationTier(10)).toBe("friendly");
    expect(reputationTier(0)).toBe("neutral");
    expect(reputationTier(-10)).toBe("wary");
    expect(reputationTier(-40)).toBe("hostile");
    expect(reputationTier(-100)).toBe("hated");
  });
  it("maps disposition to tiers and clamps", () => {
    expect(dispositionTier(-5)).toBe("hostile");
    expect(dispositionTier(0)).toBe("neutral");
    expect(dispositionTier(2)).toBe("devoted");
  });
  it("derives health tone and fraction safely", () => {
    expect(healthTone(10, 10)).toBe("healthy");
    expect(healthTone(4, 10)).toBe("hurt");
    expect(healthTone(1, 10)).toBe("critical");
    expect(fraction(15, 10)).toBe(1);
    expect(fraction(-3, 10)).toBe(0);
    expect(fraction(1, 0)).toBe(0);
  });
});

describe("world date", () => {
  const t: Translate = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;
  it("formats day 1 as 1 Ches 1492", () => {
    const text = formatWorldDate(1, t);
    expect(text).toContain('"day":1');
    expect(text).toContain('"month":"Ches"');
    expect(text).toContain('"year":1492');
    expect(formatTenday(1, t)).toContain('"n":1');
  });
  it("names festival days", () => {
    // Greengrass follows Tarsakh: 1 Ches is day 1, Ches + Tarsakh fill 60 days, so Greengrass is day 61.
    expect(formatWorldDate(61, t)).toContain("dateFestival");
    expect(formatTenday(61, t)).toBeNull();
  });
});

describe("parseOpenState", () => {
  it("reads a valid map", () => {
    expect(parseOpenState('{"quests":false,"rolls":true}')).toEqual({ quests: false, rolls: true });
  });
  it("shrugs off garbage", () => {
    expect(parseOpenState(null)).toEqual({});
    expect(parseOpenState("not json")).toEqual({});
    expect(parseOpenState('{"quests":"yes"}')).toEqual({});
    expect(parseOpenState("[1,2]")).toEqual({});
  });
});
