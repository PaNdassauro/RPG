/**
 * Pure helpers behind the play screen's right rail ("the world around you"):
 * who is present, how rolls and reputation read, the in-world date line, and
 * the remembered open/closed state of each section.
 */
import { z } from "zod";
import { harptosDate } from "@/ai/harptos";
import { CLOUD_PROFILE, type ContextProfile } from "@/ai/context";
import { aliasesFor, normalizeText, selectCodex, SCAN_MESSAGES } from "@/ai/codexSelect";
import type {
  Campaign,
  ChatMessage,
  DiceRollRecord,
  NpcEntry,
} from "@/schemas/campaign";

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Most NPCs listed under "nearby", however many the scene names. */
export const NEARBY_MAX = 6;
/** Rolls listed in the rail. */
export const RECENT_ROLLS_MAX = 5;

/** NPCs named in the scene the DM is looking at (last narrative messages), newest mention first. */
export function presentNpcs(
  campaign: Campaign,
  messages: ChatMessage[],
  profile: ContextProfile = CLOUD_PROFILE,
): NpcEntry[] {
  const scanTexts = messages
    .filter((m) => m.role === "dm" || m.role === "player")
    .slice(-SCAN_MESSAGES)
    .map((m) => m.content);
  if (scanTexts.length === 0) return [];
  const scan = scanTexts.map(normalizeText);
  const { triggeredNpcs } = selectCodex(campaign, scanTexts, profile);
  // selectCodex also pulls in NPCs that only a description names; "present"
  // means the scene itself says their name.
  return triggeredNpcs
    .filter((n) =>
      aliasesFor(n.name).some((alias) => scan.some((text) => ` ${text} `.includes(` ${alias} `))),
    )
    .slice(0, NEARBY_MAX);
}

export type RollKind =
  | "check"
  | "save"
  | "attack"
  | "damage"
  | "heal"
  | "deathSave"
  | "concentration"
  | "hitDie"
  | "secondWind"
  | "manual"
  | "other";

export interface RollPurpose {
  kind: RollKind;
  /** Skill id, ability id, weapon name or damage type, when the purpose carries one. */
  detail: string | null;
  /** The untouched purpose, for roll kinds this rail does not know. */
  raw: string;
}

/** Roll `purpose` strings are machine tags ("check:perception", "attack:Longsword:id"). */
export function parseRollPurpose(purpose: string | undefined): RollPurpose {
  const raw = purpose?.trim() ?? "";
  if (raw === "") return { kind: "other", detail: null, raw };
  const [head = "", detail] = raw.split(":");
  const d = detail && detail.length > 0 ? detail : null;
  switch (head) {
    case "check":
    case "save":
    case "attack":
    case "damage":
      return { kind: head, detail: d, raw };
    case "heal":
      return { kind: "heal", detail: null, raw };
    case "death-save":
      return { kind: "deathSave", detail: null, raw };
    case "concentration":
      return { kind: "concentration", detail: null, raw };
    case "hitdie":
      return { kind: "hitDie", detail: null, raw };
    case "second-wind":
      return { kind: "secondWind", detail: null, raw };
    case "manual":
      return { kind: "manual", detail: null, raw };
    default:
      return { kind: "other", detail: null, raw };
  }
}

/** A known translation, else the raw id (a weapon name, an unlisted damage type). */
function translateOr(t: Translate, key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

/** "Test: Perception", "Salvaguarda: Destreza", "Ataque: Longsword"... */
export function rollLabel(roll: DiceRollRecord, t: Translate): string {
  const { kind, detail, raw } = parseRollPurpose(roll.purpose);
  const base = "play.worldRail.rolls";
  switch (kind) {
    case "check":
      return detail
        ? t(`${base}.kind.check`, { detail: translateOr(t, `${base}.skill.${detail}`, detail) })
        : raw;
    case "save":
      return detail
        ? t(`${base}.kind.save`, { detail: translateOr(t, `${base}.ability.${detail}`, detail) })
        : raw;
    case "attack":
      return detail ? t(`${base}.kind.attack`, { detail }) : t(`${base}.kind.attackBare`);
    case "damage":
      return detail
        ? t(`${base}.kind.damage`, { detail: translateOr(t, `${base}.damageType.${detail}`, detail) })
        : t(`${base}.kind.damageBare`);
    case "other":
      return raw || roll.expression;
    default:
      return t(`${base}.kind.${kind}`);
  }
}

export type RollVerdict = "success" | "failure" | "critical" | "fumble";

/**
 * How a roll turned out. Checks and saves are decided by the DC alone (a
 * natural 20 never flips an ability check); attacks and bare d20s read crits.
 */
export function rollVerdict(roll: DiceRollRecord): RollVerdict | null {
  const { kind } = parseRollPurpose(roll.purpose);
  if ((kind === "check" || kind === "save") && roll.dc !== null) {
    return roll.total >= roll.dc ? "success" : "failure";
  }
  if (roll.isCritical) return "critical";
  if (roll.isFumble) return "fumble";
  if (roll.dc !== null) return roll.total >= roll.dc ? "success" : "failure";
  return null;
}

/** Newest first. */
export function recentRolls(
  diceRolls: Record<string, DiceRollRecord>,
  max: number = RECENT_ROLLS_MAX,
): DiceRollRecord[] {
  return Object.values(diceRolls)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, max);
}

export type ReputationTier =
  | "revered"
  | "allied"
  | "friendly"
  | "neutral"
  | "wary"
  | "hostile"
  | "hated";

/** Faction reputation runs -100..+100. */
export function reputationTier(rep: number): ReputationTier {
  if (rep >= 75) return "revered";
  if (rep >= 40) return "allied";
  if (rep >= 10) return "friendly";
  if (rep > -10) return "neutral";
  if (rep > -40) return "wary";
  if (rep > -75) return "hostile";
  return "hated";
}

export type DispositionTier = "hostile" | "wary" | "neutral" | "friendly" | "devoted";

/** NPC disposition runs -2..+2. */
export function dispositionTier(d: number): DispositionTier {
  const v = Math.max(-2, Math.min(2, Math.round(d)));
  return v <= -2 ? "hostile" : v === -1 ? "wary" : v === 0 ? "neutral" : v === 1 ? "friendly" : "devoted";
}

export type HealthTone = "healthy" | "hurt" | "critical";

export function healthTone(current: number, max: number): HealthTone {
  const pct = max > 0 ? Math.max(0, current) / max : 0;
  return pct > 0.5 ? "healthy" : pct > 0.25 ? "hurt" : "critical";
}

/** Fraction 0..1 of a bar, clamped (for scaleX). */
export function fraction(current: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
}

/** "3 Ches, 1492 DR" (en) / "3 de Ches de 1492 CV" (pt-BR); festival days read "Greengrass, 1492 DR". */
export function formatWorldDate(inWorldDay: number, t: Translate): string {
  const d = harptosDate(inWorldDay);
  if (d.festival) return t("play.worldRail.dateFestival", { festival: d.festival, year: d.year });
  return t("play.worldRail.dateDay", { day: d.day ?? 1, month: d.month ?? "", year: d.year });
}

/** "Tenday 2" / "Década 2", or null on festival days. */
export function formatTenday(inWorldDay: number, t: Translate): string | null {
  const d = harptosDate(inWorldDay);
  return d.tenday === null ? null : t("play.worldRail.tenday", { n: d.tenday });
}

/** The current location's description: the campaign's own, else the matching codex place. */
export function locationDescription(campaign: Campaign): string {
  const own = campaign.currentLocation.description.trim();
  if (own.length > 0) return own;
  const here = normalizeText(campaign.currentLocation.name);
  if (here.length === 0) return "";
  const place = (campaign.placesVisited ?? []).find((p) => normalizeText(p.name) === here);
  return place?.description.trim() ?? "";
}

const OpenStateSchema =z.record(z.string(), z.boolean());

export const RAIL_STORAGE_KEY = "rpg.worldRail.open";

/** Parse the persisted open/closed map; anything malformed reads as "nothing remembered". */
export function parseOpenState(raw: string | null): Record<string, boolean> {
  if (raw === null) return {};
  try {
    const parsed = OpenStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
