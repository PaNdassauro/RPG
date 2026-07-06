import { ABILITIES, SKILLS, type Ability, type SkillName } from "@/schemas/character";

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

const DICE_EXPR_RE = /^\d+d\d+([+-]\d+)?$/;

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
  hpMax: number;
  ac: number;
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
    const amount = attrs.amount != null ? Number.parseInt(attrs.amount, 10) : NaN;
    if (!Number.isFinite(amount) || amount < 0) continue;
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
    const delta = attrs.delta != null ? Number.parseInt(attrs.delta, 10) : NaN;
    if (!faction || !Number.isFinite(delta)) continue;
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
        const json = JSON.parse(payload);
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
            const price = Number(o.priceGp ?? o.price ?? 0);
            if (!Number.isFinite(price) || price < 0) continue;
            const qty = Math.max(1, Math.floor(Number(o.qty ?? 1)));
            offers.push({
              id: typeof o.id === "string" && o.id.trim()
                ? o.id.trim()
                : `off_${++auto}_${n.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
              name: n,
              description: typeof o.description === "string" ? o.description : "",
              priceGp: Math.floor(price),
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
    const hpMax = Number(attrs.hp ?? attrs.hpmax ?? 0);
    const ac = Number(attrs.ac ?? 10);
    const initiativeBonus = Number(attrs.init ?? 0);
    if (!Number.isFinite(hpMax) || hpMax < 1) continue;
    const entry: ParsedCompanion = {
      name,
      kind,
      description,
      hpMax: Math.floor(hpMax),
      ac: Math.max(1, Math.floor(ac)),
      initiativeBonus: Math.floor(initiativeBonus),
    };
    if (attrs.damage && attrs.tohit != null) {
      entry.attack = {
        name: attrs.attack ?? `${name} attack`,
        toHit: Number.parseInt(attrs.tohit, 10) || 0,
        damage: attrs.damage,
        damageType: attrs.type ?? "bludgeoning",
      };
    }
    companions.push(entry);
  }

  TRAVEL_RE.lastIndex = 0;
  for (const match of text.matchAll(TRAVEL_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const days = Math.max(1, Math.floor(Number(attrs.days ?? 1)));
    const destination = (attrs.to ?? attrs.destination ?? "").trim();
    travels.push({ days, destination, reason });
  }

  ATTACK_RE.lastIndex = 0;
  for (const match of text.matchAll(ATTACK_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const toHitRaw = attrs.tohit ?? attrs.bonus;
    const toHit = toHitRaw != null ? Number.parseInt(toHitRaw, 10) : NaN;
    const damage = (attrs.damage ?? attrs.dice ?? "").trim();
    const damageType = (attrs.type ?? "untyped").trim().toLowerCase() || "untyped";
    const modeRaw = (attrs.mode ?? "none").toLowerCase();
    const mode = modeRaw === "adv" ? "adv" : modeRaw === "dis" ? "dis" : null;
    if (!Number.isFinite(toHit)) continue;
    if (!DICE_EXPR_RE.test(damage)) continue;
    attacks.push({ target, toHit, mode, damage, damageType, reason });
  }

  DAMAGE_RE.lastIndex = 0;
  for (const match of text.matchAll(DAMAGE_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const expression = (attrs.dice ?? "").trim();
    const damageType = (attrs.type ?? "untyped").trim().toLowerCase() || "untyped";
    if (!DICE_EXPR_RE.test(expression)) continue;
    damages.push({ target, expression, damageType, reason });
  }

  HEAL_RE.lastIndex = 0;
  for (const match of text.matchAll(HEAL_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const expression = (attrs.dice ?? "").trim();
    if (!DICE_EXPR_RE.test(expression)) continue;
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
    const delta = attrs.delta != null ? Number.parseInt(attrs.delta, 10) : NaN;
    if (!npc || !Number.isFinite(delta) || delta === 0) continue;
    dispositions.push({ npc, delta, reason });
  }

  COND_RE.lastIndex = 0;
  for (const match of text.matchAll(COND_RE)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reason = (match[2] ?? "").trim();
    const target = (attrs.target ?? "player").trim() || "player";
    const index = (attrs.apply ?? attrs.condition ?? "").trim().toLowerCase();
    const rawRounds = attrs.rounds != null ? Number.parseInt(attrs.rounds, 10) : NaN;
    if (!CONDITION_NAMES.has(index)) continue;
    if (!Number.isFinite(rawRounds) || rawRounds < 1) continue;
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
      if (m) {
        cond.saveEnd = {
          ability: m[1] as Ability,
          dc: Number.parseInt(m[2]!, 10),
        };
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

  const cleaned = text
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
    .replace(LEVELUP_RE, "$2")
    .replace(DISPOSITION_RE, "")
    .replace(COND_RE, "")
    .replace(ROUND_RE, "")
    .replace(INSPIRE_RE, "")
    .replace(ENDCOMBAT_RE, "$1")
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
    dispositions,
    conditions,
    roundAdvance,
    inspires,
  };
}

function parseAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|(\S+))/g;
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
    json = JSON.parse(trimmed);
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
    const hpMax = Number(o.hpMax ?? o.hp ?? 0);
    const ac = Number(o.ac ?? 10);
    const initiative = Number(o.initiative ?? 0);
    // When a monster is grounded by srdRef the engine fills HP/AC, so missing
    // or placeholder values are tolerated. Otherwise both are required.
    const grounded = kind === "monster" && !!srdRef;
    if (!grounded && (!Number.isFinite(hpMax) || hpMax < 1)) continue;
    if (!grounded && (!Number.isFinite(ac) || ac < 1)) continue;
    if (!Number.isFinite(initiative)) continue;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : `c_${++auto}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
    entries.push({
      id,
      kind,
      name,
      hpMax: Number.isFinite(hpMax) && hpMax >= 1 ? Math.floor(hpMax) : 1,
      ac: Number.isFinite(ac) && ac >= 1 ? Math.floor(ac) : 10,
      initiative: Math.floor(initiative),
      ...(srdRef ? { srdRef } : {}),
    });
  }
  if (entries.length === 0) return null;
  return { entries };
}
