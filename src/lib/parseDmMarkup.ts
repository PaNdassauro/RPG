import { ABILITIES, SKILLS, type Ability, type SkillName } from "@/schemas/character";
import { parseExpression } from "@/engine/dice";

/**
 * The DM uses a small markup vocabulary embedded in its prose so the engine
 * can intercept structured actions (check requests, damage, healing, combat)
 * without each provider needing to support native tool calling.
 *
 *   [CHECK skill=stealth dc=12 mode=adv]Slip past the dozing guard.[/CHECK]
 *   [DAMAGE target=player dice=2d6+1 type=slashing]The wolf bites down.[/DAMAGE]
 *   [HEAL target=player dice=1d4+2]The poultice burns warm.[/HEAL]
 *   [INITIATIVE]{"combatants":[…]}[/INITIATIVE]
 *   [ENDCOMBAT]The last shape goes still.[/ENDCOMBAT]
 *
 * Malformed blocks are dropped — the player still sees the surrounding prose,
 * just without the structured side-effect. Better than crashing.
 */

const CHECK_RE = /\[CHECK([^\]]*)\]([\s\S]*?)\[\/CHECK\]/gi;
const SAVE_RE = /\[SAVE([^\]]*)\]([\s\S]*?)\[\/SAVE\]/gi;
const XP_RE = /\[XP([^\]]*)\]([\s\S]*?)\[\/XP\]/gi;
const FACTION_RE = /\[FACTION([^\]]*)\]([\s\S]*?)\[\/FACTION\]/gi;
const REP_RE = /\[REP([^\]]*)\]([\s\S]*?)\[\/REP\]/gi;
const SHOP_RE = /\[SHOP([^\]]*)\]([\s\S]*?)\[\/SHOP\]/gi;
const COMPANION_RE = /\[COMPANION([^\]]*)\]([\s\S]*?)\[\/COMPANION\]/gi;
const TRAVEL_RE = /\[TRAVEL([^\]]*)\]([\s\S]*?)\[\/TRAVEL\]/gi;
const LOCATION_RE = /\[LOCATION([^\]]*)\]([\s\S]*?)\[\/LOCATION\]/gi;
const ATTACK_RE = /\[ATTACK([^\]]*)\]([\s\S]*?)\[\/ATTACK\]/gi;
const DAMAGE_RE = /\[DAMAGE([^\]]*)\]([\s\S]*?)\[\/DAMAGE\]/gi;
const HEAL_RE = /\[HEAL([^\]]*)\]([\s\S]*?)\[\/HEAL\]/gi;
const INITIATIVE_RE = /\[INITIATIVE\]([\s\S]*?)\[\/INITIATIVE\]/gi;
const ENDCOMBAT_RE = /\[ENDCOMBAT\]([\s\S]*?)\[\/ENDCOMBAT\]/gi;
const REACTION_RE = /\[REACTION([^\]]*)\]([\s\S]*?)\[\/REACTION\]/gi;
const PLACE_RE = /\[PLACE([^\]]*)\]([\s\S]*?)\[\/PLACE\]/gi;
const NPC_RE = /\[NPC([^\]]*)\]([\s\S]*?)\[\/NPC\]/gi;
const QUEST_RE = /\[QUEST([^\]]*)\]([\s\S]*?)\[\/QUEST\]/gi;
const LEVELUP_RE = /\[LEVELUP([^\]]*)\]([\s\S]*?)\[\/LEVELUP\]/gi;
const DISPOSITION_RE = /\[DISPOSITION([^\]]*)\]([\s\S]*?)\[\/DISPOSITION\]/gi;
const COND_RE = /\[COND([^\]]*)\]([\s\S]*?)\[\/COND\]/gi;
const ROUND_RE = /\[ROUND\s*\/?\]/gi;
const INSPIRE_RE = /\[INSPIRE([^\]]*)\]([\s\S]*?)\[\/INSPIRE\]/gi;

/** Caps on a [LOCATION] block so a runaway reply can't bloat the saved campaign. */
const MAX_LOCATION_NAME = 80;
const MAX_LOCATION_DESCRIPTION = 300;

const DICE_EXPR_RE = /^\d+d\d+([+-]\d+)?$/;

/** Every block-style tag the DM may open; used to spot truncated blocks. */
const BLOCK_TAGS = [
  "CHECK",
  "SAVE",
  "XP",
  "FACTION",
  "REP",
  "SHOP",
  "COMPANION",
  "TRAVEL",
  "LOCATION",
  "ATTACK",
  "DAMAGE",
  "HEAL",
  "INITIATIVE",
  "ENDCOMBAT",
  "REACTION",
  "PLACE",
  "NPC",
  "QUEST",
  "LEVELUP",
  "DISPOSITION",
  "COND",
  "INSPIRE",
] as const;
const ALL_TAGS: readonly string[] = [...BLOCK_TAGS, "ROUND"];

/** An opener (possibly cut off mid-attribute) that never found its closer. */
const UNCLOSED_OPENER_RE = new RegExp(`\\[(?:${BLOCK_TAGS.join("|")})(?=[\\s\\]]|$)[^\\]]*(?:\\]|$)`, "i");
const STRAY_CLOSER_RE = new RegExp(`\\[\\/(?:${ALL_TAGS.join("|")})\\]`, "gi");

/** True for a dice expression the engine can actually roll (`2d6+3`). */
function isValidDice(expr: string): boolean {
  if (!DICE_EXPR_RE.test(expr)) return false;
  try {
    parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

/** Parse an integer attribute, rejecting NaN; clamps into [min, max]. */
function intIn(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Drop everything from the first block that was opened but never closed —
 * what a max-token cut-off leaves behind — plus a dangling partial tag at the
 * very end (`[CHE`). Complete blocks are untouched.
 */
export function stripUnclosedMarkup(text: string): string {
  // Closed blocks are blanked first (same length) so a `[CHECK…]` that did
  // close is never mistaken for an opener, and offsets still map to `text`.
  const masked = text.replace(
    new RegExp(`\\[(${BLOCK_TAGS.join("|")})[^\\]]*\\][\\s\\S]*?\\[\\/\\1\\]`, "gi"),
    (m) => " ".repeat(m.length),
  );
  const open = UNCLOSED_OPENER_RE.exec(masked);
  let out = open ? text.slice(0, open.index) : text;
  // A bare `[` + a prefix of a known tag at the very end (`[CHE`).
  const tail = /\[\/?([A-Za-z]*)$/.exec(out);
  let partial = false;
  if (tail && ALL_TAGS.some((tag) => tag.startsWith(tail[1]!.toUpperCase()))) {
    out = out.slice(0, tail.index);
    partial = true;
  }
  return open || partial ? out.trimEnd() : out;
}

/** Tolerate ```json fences and prose around a JSON payload. */
function parseJsonPayload(raw: string): unknown {
  const unfenced = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const first = unfenced.search(/[[{]/);
    const last = Math.max(unfenced.lastIndexOf("]"), unfenced.lastIndexOf("}"));
    if (first < 0 || last <= first) throw new Error("no JSON payload");
    return JSON.parse(unfenced.slice(first, last + 1));
  }
}

type CombatTarget = "player" | string;

export interface ParsedCheck {
  skill: SkillName;
  dc: number;
  mode: "adv" | "dis" | null;
  reason: string;
  start: number;
  end: number;
}

export interface ParsedSave {
  ability: Ability;
  dc: number;
  mode: "adv" | "dis" | null;
  reason: string;
}

export interface ParsedXp {
  amount: number;
  reason: string;
}

export interface ParsedFaction {
  name: string;
  description: string;
}

export interface ParsedRep {
  faction: string;
  delta: number;
  reason: string;
}

export interface ParsedShopOffer {
  id: string;
  name: string;
  description: string;
  priceGp: number;
  qty: number;
}

export interface ParsedShop {
  vendorName: string;
  location: string;
  offers: ParsedShopOffer[];
}

export interface ParsedCompanion {
  name: string;
  kind: "familiar" | "summon" | "hireling" | "mount";
  description: string;
  hpMax: number;
  ac: number;
  initiativeBonus: number;
  attack?: { name: string; toHit: number; damage: string; damageType: string };
}

export interface ParsedTravel {
  /** Travel days; engine consumes 1 ration per day. */
  days: number;
  /** Optional destination for narrative use. */
  destination: string;
  reason: string;
}

export interface ParsedLocation {
  /** Where the player is now (the top-bar / <state> place name). */
  name: string;
  /** One-line description of the spot; may be empty. */
  description: string;
}

export interface ParsedAttack {
  /** "player" or a combatant id from the active initiative. */
  target: CombatTarget;
  /** d20 attack bonus (may be negative). */
  toHit: number;
  mode: "adv" | "dis" | null;
  /** Damage dice rolled only on a hit; crit doubles the dice. */
  damage: string;
  damageType: string;
  reason: string;
}

export interface ParsedDamage {
  target: CombatTarget;
  expression: string;
  damageType: string;
  reason: string;
}

export interface ParsedHeal {
  target: CombatTarget;
  expression: string;
  reason: string;
}

export interface ParsedInitiativeEntry {
  id: string;
  kind: "pc" | "monster";
  name: string;
  /** null when the DM gave none (only allowed with an `srdRef` to ground it). */
  hpMax: number | null;
  ac: number | null;
  initiative: number;
  /** SRD monster index (e.g. "goblin") — engine grounds HP/AC/resistances. */
  srdRef?: string;
}

export interface ParsedInitiative {
  entries: ParsedInitiativeEntry[];
}

export interface ParsedEndCombat {
  reason: string;
}

export interface ParsedReaction {
  ability: string;
  trigger: string;
  reason: string;
}

export interface ParsedPlace {
  name: string;
  description: string;
}

export interface ParsedNpc {
  name: string;
  description: string;
  kind: "ally" | "foe" | "neutral";
}

export type QuestStatus = "active" | "completed" | "failed" | "abandoned";

/**
 * QUEST is upsert-by-id: omitted fields leave the existing quest unchanged.
 * On a fresh id, `title` and `objective` are required (a quest with neither
 * is meaningless), but on a status update they're optional.
 */
export interface ParsedQuest {
  id: string;
  title: string | null;
  objective: string | null;
  status: QuestStatus | null;
}

export interface ParsedLevelUp {
  classId: string;
  narration: string;
}

export interface ParsedDisposition {
  npc: string;
  delta: number;
  reason: string;
}

const CONDITION_NAMES = new Set([
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);

export interface ParsedCondition {
  target: CombatTarget;
  index: string;
  rounds: number;
  saveEnd?: { ability: Ability; dc: number };
  source?: string;
  reason: string;
}

export interface ParsedInspire {
  reason: string;
}

export interface DmMarkupParseResult {
  /** Original text with all markup removed (collapsed whitespace). */
  cleaned: string;
  checks: ParsedCheck[];
  saves: ParsedSave[];
  attacks: ParsedAttack[];
  damages: ParsedDamage[];
  heals: ParsedHeal[];
  initiative: ParsedInitiative | null;
  endCombat: ParsedEndCombat | null;
  reactions: ParsedReaction[];
  places: ParsedPlace[];
  npcs: ParsedNpc[];
  quests: ParsedQuest[];
  levelUp: ParsedLevelUp | null;
  xpAwards: ParsedXp[];
  factions: ParsedFaction[];
  reps: ParsedRep[];
  shop: ParsedShop | null;
  companions: ParsedCompanion[];
  travels: ParsedTravel[];
  /** The scene's current place; the last valid [LOCATION] block wins. */
  location: ParsedLocation | null;
  dispositions: ParsedDisposition[];
  conditions: ParsedCondition[];
  /** True if the DM emitted [ROUND] / [ROUND/] — advances combat by one round. */
  roundAdvance: boolean;
  inspires: ParsedInspire[];
}

export function parseDmMarkup(text: string): DmMarkupParseResult {
  const checks: ParsedCheck[] = [];
  const saves: ParsedSave[] = [];
  const attacks: ParsedAttack[] = [];
  const damages: ParsedDamage[] = [];
  const heals: ParsedHeal[] = [];
  const reactions: ParsedReaction[] = [];
  const places: ParsedPlace[] = [];
  const npcs: ParsedNpc[] = [];
  const quests: ParsedQuest[] = [];
  const xpAwards: ParsedXp[] = [];
  const factions: ParsedFaction[] = [];
  const reps: ParsedRep[] = [];
  const companions: ParsedCompanion[] = [];
  const travels: ParsedTravel[] = [];
  const dispositions: ParsedDisposition[] = [];
  const conditions: ParsedCondition[] = [];
  const inspires: ParsedInspire[] = [];
  let roundAdvance = false;
  let initiative: ParsedInitiative | null = null;
  let endCombat: ParsedEndCombat | null = null;
  let shop: ParsedShop | null = null;
  let location: ParsedLocation | null = null;

  CHECK_RE.lastIndex = 0;
  for (const match of text.matchAll(CHECK_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const skill = normaliseSkill(attrs.skill);
    const dc = attrs.dc != null ? Number.parseInt(attrs.dc, 10) : NaN;
    const modeRaw = (attrs.mode ?? "none").toLowerCase();
    const mode = modeRaw === "adv" ? "adv" : modeRaw === "dis" ? "dis" : null;
    if (!skill || !Number.isFinite(dc) || dc < 1 || dc > 40) continue;

    checks.push({
      skill,
      dc,
      mode,
      reason,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  SAVE_RE.lastIndex = 0;
  for (const match of text.matchAll(SAVE_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const abilityRaw = (attrs.ability ?? "").toLowerCase() as Ability;
    const ability = (ABILITIES as readonly string[]).includes(abilityRaw)
      ? (abilityRaw as Ability)
      : null;
    const dc = attrs.dc != null ? Number.parseInt(attrs.dc, 10) : NaN;
    const modeRaw = (attrs.mode ?? "none").toLowerCase();
    const mode = modeRaw === "adv" ? "adv" : modeRaw === "dis" ? "dis" : null;
    if (!ability || !Number.isFinite(dc) || dc < 1 || dc > 40) continue;
    saves.push({ ability, dc, mode, reason });
  }

  XP_RE.lastIndex = 0;
  for (const match of text.matchAll(XP_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const amount = intIn(attrs.amount, 0, 355_000);
    if (amount === null) continue;
    xpAwards.push({ amount, reason });
  }

  FACTION_RE.lastIndex = 0;
  for (const match of text.matchAll(FACTION_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const description = (match[2] ?? "").trim();
    const name = (attrs.name ?? "").trim();
    if (!name || !description) continue;
    factions.push({ name, description });
  }

  REP_RE.lastIndex = 0;
  for (const match of text.matchAll(REP_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const faction = (attrs.faction ?? "").trim();
    const delta = intIn(attrs.delta, -100, 100);
    if (!faction || delta === null) continue;
    reps.push({ faction, delta, reason });
  }

  SHOP_RE.lastIndex = 0;
  const shopMatch = SHOP_RE.exec(text);
  if (shopMatch) {
    const attrs = parseAttributes(shopMatch[1] ?? "");
    const vendorName = (attrs.vendor ?? attrs.name ?? "").trim();
    const location = (attrs.location ?? "").trim();
    const payload = (shopMatch[2] ?? "").trim();
    if (vendorName && payload) {
      try {
        const json = parseJsonPayload(payload);
        const list = Array.isArray(json)
          ? json
          : Array.isArray((json as Record<string, unknown>)?.offers)
            ? ((json as Record<string, unknown>).offers as unknown[])
            : null;
        if (list) {
          const offers: ParsedShopOffer[] = [];
          let auto = 0;
          for (const item of list) {
            if (typeof item !== "object" || item === null) continue;
            const o = item as Record<string, unknown>;
            const n = typeof o.name === "string" ? o.name.trim() : "";
            if (!n) continue;
            const price = intIn(o.priceGp ?? o.price ?? 0, Number.MIN_SAFE_INTEGER, 1_000_000);
            if (price === null || price < 0) continue; // a negative price would pay the player
            const qty = intIn(o.qty ?? 1, 1, 999) ?? 1;
            offers.push({
              id: typeof o.id === "string" && o.id.trim()
                ? o.id.trim()
                : `off_${++auto}_${n.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
              name: n,
              description: typeof o.description === "string" ? o.description : "",
              priceGp: price,
              qty,
            });
          }
          if (offers.length > 0) shop = { vendorName, location, offers };
        }
      } catch {
        // bad JSON — silently drop
      }
    }
  }

  COMPANION_RE.lastIndex = 0;
  for (const match of text.matchAll(COMPANION_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const description = (match[2] ?? "").trim();
    const name = (attrs.name ?? "").trim();
    if (!name) continue;
    const kindRaw = (attrs.kind ?? "hireling").toLowerCase();
    const kind: ParsedCompanion["kind"] =
      kindRaw === "familiar" || kindRaw === "summon" || kindRaw === "mount"
        ? kindRaw
        : "hireling";
    const hpMax = intIn(attrs.hp ?? attrs.hpmax, 1, 9999);
    if (hpMax === null) continue;
    const entry: ParsedCompanion = {
      name,
      kind,
      description,
      hpMax,
      ac: intIn(attrs.ac, 1, 30) ?? 10,
      initiativeBonus: intIn(attrs.init, -10, 20) ?? 0,
    };
    if (attrs.damage && attrs.tohit != null && isValidDice(attrs.damage.trim())) {
      entry.attack = {
        name: attrs.attack ?? `${name} attack`,
        toHit: intIn(attrs.tohit, -10, 30) ?? 0,
        damage: attrs.damage.trim(),
        damageType: (attrs.type ?? "bludgeoning").toLowerCase(),
      };
    }
    companions.push(entry);
  }

  TRAVEL_RE.lastIndex = 0;
  for (const match of text.matchAll(TRAVEL_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const days = intIn(attrs.days ?? 1, 1, 365) ?? 1;
    const destination = (attrs.to ?? attrs.destination ?? "").trim();
    travels.push({ days, destination, reason });
  }

  LOCATION_RE.lastIndex = 0;
  for (const match of text.matchAll(LOCATION_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const name = (attrs.name ?? "").trim().slice(0, MAX_LOCATION_NAME);
    if (!name) continue;
    const description = (match[2] ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_LOCATION_DESCRIPTION);
    location = { name, description };
  }

  ATTACK_RE.lastIndex = 0;
  for (const match of text.matchAll(ATTACK_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const toHit = intIn(attrs.tohit ?? attrs.bonus, -10, 30);
    const damage = (attrs.damage ?? attrs.dice ?? "").trim();
    const damageType = (attrs.type ?? "untyped").trim().toLowerCase() || "untyped";
    const modeRaw = (attrs.mode ?? "none").toLowerCase();
    const mode = modeRaw === "adv" ? "adv" : modeRaw === "dis" ? "dis" : null;
    if (toHit === null) continue;
    if (!isValidDice(damage)) continue;
    attacks.push({ target, toHit, mode, damage, damageType, reason });
  }

  DAMAGE_RE.lastIndex = 0;
  for (const match of text.matchAll(DAMAGE_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const expression = (attrs.dice ?? "").trim();
    const damageType = (attrs.type ?? "untyped").trim().toLowerCase() || "untyped";
    if (!isValidDice(expression)) continue;
    damages.push({ target, expression, damageType, reason });
  }

  HEAL_RE.lastIndex = 0;
  for (const match of text.matchAll(HEAL_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const expression = (attrs.dice ?? "").trim();
    if (!isValidDice(expression)) continue;
    heals.push({ target, expression, reason });
  }

  INITIATIVE_RE.lastIndex = 0;
  const initMatch = INITIATIVE_RE.exec(text);
  if (initMatch) {
    const parsed = parseInitiativePayload(initMatch[1] ?? "");
    if (parsed) initiative = parsed;
  }

  ENDCOMBAT_RE.lastIndex = 0;
  const endMatch = ENDCOMBAT_RE.exec(text);
  if (endMatch) {
    endCombat = { reason: (endMatch[1] ?? "").trim() };
  }

  REACTION_RE.lastIndex = 0;
  for (const match of text.matchAll(REACTION_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const ability = (attrs.ability ?? "").trim();
    const trigger = (attrs.trigger ?? "").trim();
    if (!ability || !trigger) continue;
    reactions.push({ ability, trigger, reason });
  }

  PLACE_RE.lastIndex = 0;
  for (const match of text.matchAll(PLACE_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const description = (match[2] ?? "").trim();
    const name = (attrs.name ?? "").trim();
    if (!name || !description) continue;
    places.push({ name, description });
  }

  NPC_RE.lastIndex = 0;
  for (const match of text.matchAll(NPC_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const description = (match[2] ?? "").trim();
    const name = (attrs.name ?? "").trim();
    if (!name || !description) continue;
    const kindRaw = (attrs.kind ?? "neutral").toLowerCase();
    const kind: "ally" | "foe" | "neutral" =
      kindRaw === "ally" ? "ally" : kindRaw === "foe" ? "foe" : "neutral";
    npcs.push({ name, description, kind });
  }

  QUEST_RE.lastIndex = 0;
  for (const match of text.matchAll(QUEST_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const id = (attrs.id ?? "").trim();
    if (!id) continue;
    const title = (attrs.title ?? "").trim() || null;
    const objective = (attrs.objective ?? "").trim() || null;
    const statusRaw = (attrs.status ?? "").toLowerCase();
    const status: QuestStatus | null =
      statusRaw === "active" ||
      statusRaw === "completed" ||
      statusRaw === "failed" ||
      statusRaw === "abandoned"
        ? statusRaw
        : null;
    quests.push({ id, title, objective, status });
  }

  LEVELUP_RE.lastIndex = 0;
  let levelUp: ParsedLevelUp | null = null;
  const luMatch = LEVELUP_RE.exec(text);
  if (luMatch) {
    const attrs = parseAttributes(luMatch[1] ?? "");
    const classId = (attrs.class ?? "").trim().toLowerCase();
    const narration = (luMatch[2] ?? "").trim();
    if (classId) {
      levelUp = { classId, narration };
    }
  }

  DISPOSITION_RE.lastIndex = 0;
  for (const match of text.matchAll(DISPOSITION_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const npc = (attrs.npc ?? attrs.name ?? "").trim();
    const delta = intIn(attrs.delta, -2, 2);
    if (!npc || delta === null || delta === 0) continue;
    dispositions.push({ npc, delta, reason });
  }

  COND_RE.lastIndex = 0;
  for (const match of text.matchAll(COND_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const index = (attrs.apply ?? attrs.condition ?? "").trim().toLowerCase();
    const rawRounds = intIn(attrs.rounds, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    if (!CONDITION_NAMES.has(index)) continue;
    if (rawRounds === null || rawRounds < 1) continue;
    // Clamp instead of drop: "1 hour" = ~600 rounds becomes 100.
    const rounds = Math.min(100, rawRounds);
    const cond: ParsedCondition = {
      target,
      index,
      rounds,
      reason,
    };
    if (attrs.saveend ?? attrs["save-end"]) {
      const raw = (attrs.saveend ?? attrs["save-end"])!.toLowerCase();
      const m = raw.match(/^(str|dex|con|int|wis|cha):(\d+)$/);
      const saveDc = m ? intIn(m[2], 1, 40) : null;
      if (m && saveDc !== null) {
        cond.saveEnd = { ability: m[1] as Ability, dc: saveDc };
      }
    }
    if (attrs.source) cond.source = attrs.source;
    conditions.push(cond);
  }

  ROUND_RE.lastIndex = 0;
  if (ROUND_RE.test(text)) {
    roundAdvance = true;
  }

  INSPIRE_RE.lastIndex = 0;
  for (const match of text.matchAll(INSPIRE_RE)) {
    const reason = (match[2] ?? "").trim();
    if (!reason) continue;
    inspires.push({ reason });
  }

  const cleaned = stripUnclosedMarkup(
    text
      .replace(CHECK_RE, "")
      .replace(SAVE_RE, "")
      .replace(XP_RE, "")
      .replace(ATTACK_RE, "")
      .replace(DAMAGE_RE, "")
      .replace(HEAL_RE, "")
      .replace(INITIATIVE_RE, "")
      .replace(REACTION_RE, "")
      .replace(PLACE_RE, "")
      .replace(NPC_RE, "")
      .replace(QUEST_RE, "")
      .replace(FACTION_RE, "")
      .replace(REP_RE, "")
      .replace(SHOP_RE, "")
      .replace(COMPANION_RE, "")
      .replace(TRAVEL_RE, "$2")
      .replace(LOCATION_RE, "")
      .replace(LEVELUP_RE, "$2")
      .replace(DISPOSITION_RE, "")
      .replace(COND_RE, "")
      .replace(ROUND_RE, "")
      .replace(INSPIRE_RE, "")
      .replace(ENDCOMBAT_RE, "$1")
      .replace(STRAY_CLOSER_RE, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleaned,
    checks,
    saves,
    attacks,
    damages,
    heals,
    initiative,
    endCombat,
    reactions,
    places,
    npcs,
    quests,
    levelUp,
    xpAwards,
    factions,
    reps,
    shop,
    companions,
    travels,
    location,
    dispositions,
    conditions,
    roundAdvance,
    inspires,
  };
}

function parseAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Hyphenated keys (`save-end=`) are valid attribute names.
  const re = /([\w-]+)=(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const key = m[1]!.toLowerCase();
    out[key] = (m[2] ?? m[3] ?? "").trim();
  }
  return out;
}

function normaliseSkill(raw: string | undefined): SkillName | null {
  if (!raw) return null;
  const camel = raw.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).toLowerCase();
  for (const s of SKILLS) {
    if (s.toLowerCase() === camel.toLowerCase()) return s;
  }
  return null;
}

function parseInitiativePayload(raw: string): ParsedInitiative | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let json: unknown;
  try {
    json = parseJsonPayload(trimmed);
  } catch {
    return null;
  }
  const list =
    Array.isArray(json)
      ? json
      : typeof json === "object" && json !== null && Array.isArray((json as Record<string, unknown>).combatants)
        ? ((json as Record<string, unknown>).combatants as unknown[])
        : null;
  if (!list || list.length === 0) return null;

  const entries: ParsedInitiativeEntry[] = [];
  const usedIds = new Set<string>();
  let auto = 0;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const kindRaw = typeof o.kind === "string" ? o.kind.toLowerCase() : "monster";
    const kind: "pc" | "monster" = kindRaw === "pc" ? "pc" : "monster";
    const srdRefRaw =
      typeof o.srdRef === "string"
        ? o.srdRef
        : typeof o.srd === "string"
          ? o.srd
          : "";
    const srdRef = srdRefRaw.trim().toLowerCase() || undefined;
    const hpMax = intIn(o.hpMax ?? o.hp, 1, 9999);
    const ac = intIn(o.ac, 1, 40);
    const initiative = intIn(o.initiative ?? 0, -10, 50);
    // Stats the DM supplied are kept even when an `srdRef` is also given: the
    // engine prefers the SRD record, but if the ref doesn't resolve these are
    // all that's left. Without a ref both are required (the player entry's
    // are overwritten from the sheet, so it may omit them).
    const grounded = kind === "monster" && !!srdRef;
    if (!grounded && kind === "monster" && (hpMax === null || ac === null)) continue;
    if (initiative === null) continue;
    const baseId =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : `c_${++auto}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
    // Ids address combatants in [ATTACK]/[DAMAGE]; "player" is reserved and
    // duplicates would make both rows take the same hit.
    let id = baseId;
    for (let n = 2; usedIds.has(id) || (kind === "monster" && id.toLowerCase() === "player"); n++) {
      id = `${baseId}-${n}`;
    }
    usedIds.add(id);
    entries.push({
      id,
      kind,
      name,
      hpMax,
      ac,
      initiative,
      ...(srdRef ? { srdRef } : {}),
    });
  }
  if (entries.length === 0) return null;
  return { entries };
}
