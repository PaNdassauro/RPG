import { describe, expect, it } from "vitest";
import { parseDmMarkup, stripUnclosedMarkup } from "./parseDmMarkup";

describe("INITIATIVE payload", () => {
  const wolves = `[{"id":"wolf","name":"Wolf","hpMax":11,"ac":13,"initiative":14},{"id":"wolf","name":"Wolf","hpMax":11,"ac":13,"initiative":9}]`;

  it("parses a plain JSON array", () => {
    const p = parseDmMarkup(`The pack circles. [INITIATIVE]${wolves}[/INITIATIVE]`);
    expect(p.initiative?.entries).toHaveLength(2);
  });

  it("strips ```json fences inside the block", () => {
    const p = parseDmMarkup("[INITIATIVE]\n```json\n" + wolves + "\n```\n[/INITIATIVE]");
    expect(p.initiative?.entries.map((e) => e.name)).toEqual(["Wolf", "Wolf"]);
  });

  it("strips bare ``` fences and prose around the JSON", () => {
    const p = parseDmMarkup("[INITIATIVE]Here you go:\n```\n" + wolves + "\n```\n[/INITIATIVE]");
    expect(p.initiative?.entries).toHaveLength(2);
  });

  it("de-duplicates combatant ids with -2, -3 suffixes", () => {
    const three = `{"combatants":[
      {"id":"orc","name":"Orc A","hpMax":15,"ac":13,"initiative":10},
      {"id":"orc","name":"Orc B","hpMax":15,"ac":13,"initiative":8},
      {"id":"orc","name":"Orc C","hpMax":15,"ac":13,"initiative":6}]}`;
    const ids = parseDmMarkup(`[INITIATIVE]${three}[/INITIATIVE]`).initiative!.entries.map((e) => e.id);
    expect(ids).toEqual(["orc", "orc-2", "orc-3"]);
  });

  it("never lets a monster take the reserved id 'player'", () => {
    const json = `[{"id":"player","kind":"pc","name":"Hero","initiative":12},{"id":"player","name":"Rat","hpMax":1,"ac":10,"initiative":3}]`;
    const ids = parseDmMarkup(`[INITIATIVE]${json}[/INITIATIVE]`).initiative!.entries.map((e) => e.id);
    expect(ids).toEqual(["player", "player-2"]);
  });

  it("keeps the DM's HP/AC when an srdRef is given too (engine decides if the ref resolves)", () => {
    const json = `[{"id":"g1","name":"Goblin","srdRef":"Goblin","hpMax":7,"ac":15,"initiative":12}]`;
    const [e] = parseDmMarkup(`[INITIATIVE]${json}[/INITIATIVE]`).initiative!.entries;
    expect(e).toMatchObject({ srdRef: "goblin", hpMax: 7, ac: 15 });
  });

  it("an srdRef with no stats yields null (not a fake 1 HP / AC 10)", () => {
    const json = `[{"id":"g1","name":"Goblin","srdRef":"goblin","initiative":12}]`;
    const [e] = parseDmMarkup(`[INITIATIVE]${json}[/INITIATIVE]`).initiative!.entries;
    expect(e).toMatchObject({ hpMax: null, ac: null });
  });

  it("drops monsters with no stats and no srdRef, and non-numeric junk", () => {
    const json = `[{"name":"Ghost","initiative":5},{"name":"Bat","hpMax":"lots","ac":12,"initiative":5},{"name":"Imp","hpMax":9,"ac":13,"initiative":"fast"}]`;
    expect(parseDmMarkup(`[INITIATIVE]${json}[/INITIATIVE]`).initiative).toBeNull();
  });

  it("clamps absurd values", () => {
    const json = `[{"id":"d","name":"Dragon","hpMax":999999,"ac":99,"initiative":500}]`;
    expect(parseDmMarkup(`[INITIATIVE]${json}[/INITIATIVE]`).initiative!.entries[0]).toMatchObject({
      hpMax: 9999,
      ac: 40,
      initiative: 50,
    });
  });
});

describe("SHOP payload", () => {
  it("accepts fenced JSON and sanitizes price/qty", () => {
    const body = '```json\n[{"name":"Rope","priceGp":1,"qty":"two"},{"name":"Sword","price":-5}]\n```';
    const p = parseDmMarkup(`[SHOP vendor="Mira" location="Docks"]${body}[/SHOP]`);
    expect(p.shop?.offers).toHaveLength(1);
    expect(p.shop?.offers[0]).toMatchObject({ name: "Rope", priceGp: 1, qty: 1 });
  });
});

describe("numeric attribute validation", () => {
  it("rejects DCs outside 1-40 and non-numeric DCs", () => {
    expect(parseDmMarkup("[CHECK skill=stealth dc=41]x[/CHECK]").checks).toEqual([]);
    expect(parseDmMarkup("[CHECK skill=stealth dc=0]x[/CHECK]").checks).toEqual([]);
    expect(parseDmMarkup("[CHECK skill=stealth dc=high]x[/CHECK]").checks).toEqual([]);
    expect(parseDmMarkup("[SAVE ability=dex dc=NaN]x[/SAVE]").saves).toEqual([]);
    expect(parseDmMarkup("[CHECK skill=stealth dc=40]x[/CHECK]").checks).toHaveLength(1);
  });

  it("rejects unrollable dice expressions", () => {
    expect(parseDmMarkup("[DAMAGE target=player dice=1000d6 type=fire]x[/DAMAGE]").damages).toEqual([]);
    expect(parseDmMarkup("[DAMAGE target=player dice=1d1 type=fire]x[/DAMAGE]").damages).toEqual([]);
    expect(parseDmMarkup("[HEAL target=player dice=lots]x[/HEAL]").heals).toEqual([]);
    expect(parseDmMarkup("[ATTACK target=g tohit=5 damage=2d6+x type=slashing]x[/ATTACK]").attacks).toEqual([]);
    expect(parseDmMarkup("[DAMAGE target=player dice=2d6+1 type=fire]x[/DAMAGE]").damages).toHaveLength(1);
  });

  it("[ATTACK] needs a numeric to-hit, clamped to a sane range", () => {
    expect(parseDmMarkup("[ATTACK target=player tohit=abc damage=1d6]x[/ATTACK]").attacks).toEqual([]);
    expect(parseDmMarkup("[ATTACK target=player tohit=99 damage=1d6]x[/ATTACK]").attacks[0]!.toHit).toBe(30);
  });

  it("never lets NaN reach a companion", () => {
    const p = parseDmMarkup('[COMPANION name="Rex" hp=12 ac=abc init=xyz]A hound[/COMPANION]');
    expect(p.companions[0]).toMatchObject({ hpMax: 12, ac: 10, initiativeBonus: 0 });
    expect(parseDmMarkup('[COMPANION name="Ghost" hp=zero]x[/COMPANION]').companions).toEqual([]);
  });

  it("falls back to 1 day for a garbage [TRAVEL] and caps long trips", () => {
    expect(parseDmMarkup("[TRAVEL days=soon]x[/TRAVEL]").travels[0]!.days).toBe(1);
    expect(parseDmMarkup("[TRAVEL days=100000]x[/TRAVEL]").travels[0]!.days).toBe(365);
    expect(parseDmMarkup("[TRAVEL days=3 to=Waterdeep]x[/TRAVEL]").travels[0]).toMatchObject({
      days: 3,
      destination: "Waterdeep",
    });
  });

  it("clamps XP, reputation and disposition deltas", () => {
    expect(parseDmMarkup("[XP amount=99999999]x[/XP]").xpAwards[0]!.amount).toBe(355000);
    expect(parseDmMarkup("[XP amount=-5]x[/XP]").xpAwards[0]!.amount).toBe(0);
    expect(parseDmMarkup("[REP faction=Harpers delta=500]x[/REP]").reps[0]!.delta).toBe(100);
    expect(parseDmMarkup("[DISPOSITION npc=Mira delta=9]x[/DISPOSITION]").dispositions[0]!.delta).toBe(2);
  });
});

describe("[COND] attributes", () => {
  it("reads the hyphenated save-end attribute", () => {
    const p = parseDmMarkup('[COND target=player apply=stunned rounds=3 save-end=con:14 source="Ghoul"]x[/COND]');
    expect(p.conditions[0]).toMatchObject({
      index: "stunned",
      rounds: 3,
      saveEnd: { ability: "con", dc: 14 },
      source: "Ghoul",
    });
  });

  it("still accepts the saveend spelling and clamps its DC", () => {
    const p = parseDmMarkup("[COND target=player apply=blinded rounds=2 saveend=wis:99]x[/COND]");
    expect(p.conditions[0]!.saveEnd).toEqual({ ability: "wis", dc: 40 });
  });

  it("drops a malformed save-end but keeps the condition", () => {
    const p = parseDmMarkup("[COND target=player apply=blinded rounds=2 save-end=luck:5]x[/COND]");
    expect(p.conditions[0]!.saveEnd).toBeUndefined();
  });

  it("clamps rounds to 100 and rejects non-positive rounds", () => {
    expect(parseDmMarkup("[COND target=player apply=poisoned rounds=600]x[/COND]").conditions[0]!.rounds).toBe(100);
    expect(parseDmMarkup("[COND target=player apply=poisoned rounds=0]x[/COND]").conditions).toEqual([]);
  });
});

describe("unclosed / truncated blocks", () => {
  it("strips a block cut off mid-attribute from the displayed text", () => {
    const p = parseDmMarkup('The troll swings. [ATTACK target=player tohit=7 damage=2d');
    expect(p.cleaned).toBe("The troll swings.");
    expect(p.attacks).toEqual([]);
  });

  it("strips an opened block that never closed, JSON payload included", () => {
    const p = parseDmMarkup('Blades out! [INITIATIVE]{"combatants":[{"name":"Orc","hpMax":15');
    expect(p.cleaned).toBe("Blades out!");
    expect(p.initiative).toBeNull();
  });

  it("keeps closed blocks working and prose around them", () => {
    const p = parseDmMarkup("Before. [CHECK skill=stealth dc=12]Sneak.[/CHECK] After. [ROUND]");
    expect(p.checks).toHaveLength(1);
    expect(p.cleaned).toBe("Before.  After.");
  });

  it("only cuts from the first unclosed block, not an earlier closed one", () => {
    const p = parseDmMarkup("A [XP amount=10]good fight[/XP] B [QUEST id=q1 title=\"X");
    expect(p.xpAwards).toHaveLength(1);
    expect(p.cleaned).toBe("A  B");
  });

  it("removes a dangling partial tag at the very end", () => {
    expect(stripUnclosedMarkup("The door opens. [CHE")).toBe("The door opens.");
    expect(stripUnclosedMarkup("The door opens. [/CHEC")).toBe("The door opens.");
    expect(stripUnclosedMarkup("An array [0] stays")).toBe("An array [0] stays");
    expect(stripUnclosedMarkup("She said [sic")).toBe("She said [sic");
  });

  it("leaves untouched text alone", () => {
    const t = "No markup here, just prose.  ";
    expect(stripUnclosedMarkup(t)).toBe(t);
  });
});

describe("[LOCATION] block", () => {
  it("parses the name and a one-line description and strips the block", () => {
    const p = parseDmMarkup(
      'You step into town.\n[LOCATION name="Daggerford"]A river town\nof timber and stone.[/LOCATION]\nRain falls.',
    );
    expect(p.location).toEqual({ name: "Daggerford", description: "A river town of timber and stone." });
    expect(p.cleaned).toBe("You step into town.\n\nRain falls.");
  });

  it("drops a block without a name but still strips it", () => {
    const p = parseDmMarkup("Hello [LOCATION]nowhere in particular[/LOCATION] there");
    expect(p.location).toBeNull();
    expect(p.cleaned).not.toContain("LOCATION");
  });

  it("accepts an empty description and caps absurd lengths", () => {
    expect(parseDmMarkup('[LOCATION name="The Yawning Portal"][/LOCATION]').location).toEqual({
      name: "The Yawning Portal",
      description: "",
    });
    const long = parseDmMarkup(`[LOCATION name="${"N".repeat(200)}"]${"d".repeat(900)}[/LOCATION]`).location!;
    expect(long.name).toHaveLength(80);
    expect(long.description).toHaveLength(300);
  });

  it("the last valid block wins", () => {
    const p = parseDmMarkup('[LOCATION name="A"]a[/LOCATION] then [LOCATION name="B"]b[/LOCATION]');
    expect(p.location?.name).toBe("B");
  });

  it("a truncated block is cut like any other unclosed block", () => {
    const p = parseDmMarkup('The road ends. [LOCATION name="Neverwi');
    expect(p.location).toBeNull();
    expect(p.cleaned).toBe("The road ends.");
  });
});
