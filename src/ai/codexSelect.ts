/**
 * Picks which codex entries earn full detail in this turn's <state> block.
 *
 * Core entries (where the player stands, active quests, companions, factions)
 * are always detailed. Places and NPCs are "triggered" when the recent scene
 * names them, and fill a token budget, most recently mentioned first. Every
 * other place, NPC and resolved quest shrinks to one line in the index. Pure:
 * the same campaign and scene always give the same selection.
 */
import type { Campaign, CompanionEntry, FactionEntry, NpcEntry, PlaceEntry, Quest } from "@/schemas/campaign";
import { estimateTokens, type ContextProfile } from "./context";

/** Narrative messages scanned for mentions. */
export const SCAN_MESSAGES = 6;
/** Longest description shown for a triggered entry. */
export const DESCRIPTION_CAP = 300;

/** Articles, particles and titles that must not count as a name on their own. */
const COMMON_WORDS: ReadonlySet<string> = new Set([
  "the", "of", "and", "from", "with", "lord", "lady", "sir", "dame", "old", "high", "great",
  "master", "mistress", "king", "queen", "prince", "princess", "captain", "saint",
  "de", "do", "da", "dos", "das", "del", "o", "a", "os", "as", "e", "la", "le", "el", "los", "las",
  "von", "van", "der", "den", "san", "santa", "dom", "dona", "mestre", "senhor", "senhora",
  "capitao", "rei", "rainha", "principe", "princesa", "velho", "velha", "alto", "grande",
]);

/** Lower-case, strip diacritics, and reduce punctuation to single spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Normalized names an entry answers to: the full name, plus each distinctive word of it. */
export function aliasesFor(name: string): string[] {
  const full = normalizeText(name);
  if (full.length === 0) return [];
  const aliases = [full];
  for (const word of full.split(" ")) {
    if (word.length >= 4 && !COMMON_WORDS.has(word) && !aliases.includes(word)) aliases.push(word);
  }
  return aliases;
}

/** Whole-word containment on already-normalized text. */
function containsAlias(normalizedText: string, alias: string): boolean {
  return ` ${normalizedText} `.includes(` ${alias} `);
}

interface Candidate<T> {
  entry: T;
  aliases: string[];
  /** Index of the newest scan text that names it; -1 when only a description does. */
  recency: number;
}

export interface IndexItem {
  kind: "place" | "npc" | "quest";
  label: string;
  /** For sorting: when it was added or last updated. */
  at: number;
}

export interface CodexSelection {
  /** The entry for the current location, when the codex has one. */
  currentPlace: PlaceEntry | null;
  activeQuests: Quest[];
  companions: CompanionEntry[];
  factions: FactionEntry[];
  triggeredPlaces: PlaceEntry[];
  triggeredNpcs: NpcEntry[];
  /** Most recent first, already capped at `indexMax`. */
  index: IndexItem[];
}

export function capDescription(text: string): string {
  const t = text.trim();
  return t.length > DESCRIPTION_CAP ? `${t.slice(0, DESCRIPTION_CAP - 1).trimEnd()}…` : t;
}

/** Rendered size of a detailed entry, the same line the prompt will carry. */
function detailCost(name: string, description: string): number {
  return estimateTokens(`- **${name}** (ally · devoted) — ${capDescription(description)}`) + 1;
}

/** Foes and strongly felt NPCs outrank the rest at equal recency. */
function isNotable(npc: NpcEntry): boolean {
  return npc.kind === "foe" || Math.abs(npc.disposition ?? 0) === 2;
}

/**
 * @param scanTexts recent narrative text, oldest first (the pending player
 *   input last); a later text counts as a more recent mention.
 */
export function selectCodex(
  campaign: Campaign,
  scanTexts: string[],
  profile: ContextProfile,
): CodexSelection {
  const places = campaign.placesVisited ?? [];
  const npcs = campaign.npcsMet ?? [];
  const quests = campaign.quests ?? [];

  const here = normalizeText(campaign.currentLocation.name);
  const currentPlace = places.find((p) => normalizeText(p.name) === here) ?? null;

  const scan = scanTexts.map(normalizeText);
  const candidates = <T extends { name: string }>(entries: T[]): Candidate<T>[] =>
    entries.map((entry) => {
      const aliases = aliasesFor(entry.name);
      let recency = -2;
      for (let i = scan.length - 1; i >= 0 && recency < 0; i--) {
        if (aliases.some((a) => containsAlias(scan[i]!, a))) recency = i;
      }
      return { entry, aliases, recency };
    });

  const placeCands = candidates(places.filter((p) => p !== currentPlace));
  const npcCands = candidates(npcs);

  // One level of recursion: names inside a triggered entry's description.
  const direct = [
    ...placeCands.filter((c) => c.recency >= 0).map((c) => ({ c, text: c.entry.description })),
    ...npcCands.filter((c) => c.recency >= 0).map((c) => ({ c, text: c.entry.description })),
  ];
  const described = direct.map(({ c, text }) => ({ self: c.entry, text: normalizeText(text) }));
  for (const cand of [...placeCands, ...npcCands]) {
    if (cand.recency >= 0) continue;
    const hit = described.some(
      (d) => d.self !== cand.entry && cand.aliases.some((a) => containsAlias(d.text, a)),
    );
    if (hit) cand.recency = -1;
  }

  type Ranked =
    | { kind: "place"; cand: Candidate<PlaceEntry>; notable: boolean }
    | { kind: "npc"; cand: Candidate<NpcEntry>; notable: boolean };
  const ranked: Ranked[] = [
    ...placeCands
      .filter((c) => c.recency >= -1)
      .map((cand): Ranked => ({ kind: "place", cand, notable: false })),
    ...npcCands
      .filter((c) => c.recency >= -1)
      .map((cand): Ranked => ({ kind: "npc", cand, notable: isNotable(cand.entry) })),
  ];
  // Array.prototype.sort is stable, so ties keep codex order.
  ranked.sort((a, b) => b.cand.recency - a.cand.recency || Number(b.notable) - Number(a.notable));

  const triggeredPlaces: PlaceEntry[] = [];
  const triggeredNpcs: NpcEntry[] = [];
  const triggered = new Set<unknown>();
  let used = 0;
  for (const r of ranked) {
    const cost = detailCost(r.cand.entry.name, r.cand.entry.description);
    if (used + cost > profile.triggeredBudget) continue;
    used += cost;
    triggered.add(r.cand.entry);
    if (r.kind === "place") triggeredPlaces.push(r.cand.entry);
    else triggeredNpcs.push(r.cand.entry);
  }

  const indexItems: IndexItem[] = [
    ...places
      .filter((p) => p !== currentPlace && !triggered.has(p))
      .map((p): IndexItem => ({ kind: "place", label: p.name, at: p.addedAt })),
    ...npcs
      .filter((n) => !triggered.has(n))
      .map((n): IndexItem => ({ kind: "npc", label: `${n.name} (${n.kind})`, at: n.addedAt })),
    ...quests
      .filter((q) => q.status !== "active")
      .map(
        (q): IndexItem => ({
          kind: "quest",
          label: `id:\`${q.id}\` — ${q.title} (${q.status})`,
          at: q.updatedAt,
        }),
      ),
  ];
  indexItems.sort((a, b) => b.at - a.at);

  return {
    currentPlace,
    activeQuests: quests.filter((q) => q.status === "active"),
    companions: campaign.companions ?? [],
    factions: campaign.factions ?? [],
    triggeredPlaces,
    triggeredNpcs,
    index: indexItems.slice(0, profile.indexMax),
  };
}
