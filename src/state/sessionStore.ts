import { create } from "zustand";
import { db } from "@/db/schema";
import { applyMemoryUpdate, type MemoryUpdate } from "@/ai/memory";
import type {
  Campaign,
  ChatMessage,
  CompanionEntry,
  DiceRollRecord,
  EncounterState,
  FactionEntry,
  InitiativeEntry,
  NpcEntry,
  PlaceEntry,
  Quest,
  ShopState,
} from "@/schemas/campaign";
import type {
  AcquiredFeat,
  AcquiredFeature,
  Ability,
  Character,
  HitDieEntry,
  SkillName,
} from "@/schemas/character";
import { CharacterSchema, abilityModifier } from "@/schemas/character";
import { resolveTravelHunger } from "@/engine/hunger";
import {
  CLEAR_DEATH_SAVES,
  damageWhileAtZero,
  resolveDeathSaveDelta,
} from "@/engine/deathSave";
import { averageHitDieGain, featuresForClassLevel } from "@/state/sheetDerived";
import { getClass } from "@/data/srd";
import {
  applyLongRest,
  applyShortRestRefreshes,
  spendHitDie,
} from "@/engine/rest";
import {
  endConcentration,
  initializeSlotsFromClasses,
  spendSlot,
  startConcentration,
  type SlotLevel,
} from "@/engine/spells";
import { getClassLevel } from "@/data/srd";
import { concentrationSaveDc, scaleDamageByType } from "@/engine/combat";
import {
  addConditionTimer as engineAddConditionTimer,
  decrementConditionTimers as engineDecrementConditionTimers,
  effectiveHpMax,
  exhaustionLevel,
  settleTimersAtCombatEnd,
  withExhaustionLevel,
} from "@/engine/conditions";
import type { Condition } from "@/schemas/character";
import {
  refreshCounters as engineRefreshCounters,
  spendCounter as engineSpendCounter,
  syncFeatureCounters,
} from "@/engine/classFeatures";
import { levelForXp } from "@/engine/xp";
import { getFeat } from "@/data/srd/feats";
import { ATTUNEMENT_CAP, attunedCount, isPotionItem, potionHealing } from "@/engine/inventory";
import { rollExpression } from "@/engine/dice";

export interface PendingCheck {
  skill: SkillName;
  dc: number;
  mode: "adv" | "dis" | null;
  reason: string;
  /** Stable id used as a key so we can animate this card in/out. */
  id: string;
}

export interface PendingSave {
  id: string;
  ability: Ability;
  dc: number;
  mode: "adv" | "dis" | null;
  reason: string;
}

export interface PendingReaction {
  id: string;
  ability: string;
  trigger: string;
  reason: string;
}

/**
 * Player took damage while concentrating; they must roll a CON save.
 * This is just a `PendingSave` with extra metadata so the UI can label the
 * card as "Concentration check" instead of generic "Saving throw".
 */
export interface PendingConcentrationSave {
  id: string;
  spellName: string;
  dc: number;
  damageTaken: number;
}

/**
 * Player is at 0 HP and rolling death saves. Replaces the direct jump to
 * the death overlay — the player goes through the 3-success/3-failure loop
 * first. Failing it transitions to `pendingDeath` (the end/twist choice).
 */
export interface PendingDying {
  id: string;
}

/**
 * Surfaced when the DM emits a [LEVELUP] markup. The modal opens; player
 * picks ASI/subclass/etc and confirms; engine applies the increments.
 */
export interface PendingLevelUp {
  id: string;
  classId: string;
  narration: string;
}

/**
 * Input shape applied when the level-up modal confirms. At an ASI level, the
 * player either bumps abilities (`asi`) OR picks a feat (`feat`) — not both.
 */
export interface LevelUpInput {
  /** Class being leveled (may differ from primary class for multiclass). */
  classId: string;
  /** ASI choice — null if not an ASI level OR if the player chose a feat. */
  asi: { ability: Ability; amount: number }[] | null;
  /** Feat choice — exclusive with `asi` at ASI levels. */
  feat?: { featId: string; choice?: string };
  /** Subclass picked, when newLevel is the subclass-pick level. */
  subclassId?: string;
}

/**
 * Surfaced when the player's HP hits 0. Player picks between letting the
 * story end (campaign closes with a recap) or a twist of fate (revive at
 * half HP). Until they choose, all other UI (combat, checks, reactions)
 * is suppressed.
 */
export interface PendingDeath {
  id: string;
}

/**
 * Per-turn usage of the player's action economy. Reset by the player when
 * they end their turn (the DM then advances NPCs and hands control back).
 * Purely UI advisory — the DM still narrates authoritatively.
 */
export interface ActionEconomy {
  action: boolean;
  bonus: boolean;
}

/**
 * A short-lived floating-number FX, drawn over the HP bar. Pop in, rise,
 * fade out. Cleared by the consumer once the animation has played.
 */
export interface HpDeltaFx {
  id: string;
  kind: "damage" | "heal";
  amount: number;
  /** Optional damage type ("fire", "slashing", …) — colors the badge. */
  damageType?: string;
  ts: number;
}

/**
 * Handle for the one DM turn allowed in flight. Callers never build their own
 * AbortController: `beginTurn` aborts the previous turn and hands out a fresh
 * signal, and `reset()` / `loadCampaign()` abort it too.
 */
export interface TurnHandle {
  id: number;
  /** Campaign the turn started in; its output is dropped if this changes. */
  campaignId: string;
  signal: AbortSignal;
}

export interface FinalizeDraftOptions {
  /** Persist only while this campaign is still the loaded one. */
  campaignId?: string;
  /** Rewrite the draft before it is persisted (e.g. strip a cut-off block). */
  sanitize?: (draft: string) => string;
}

interface SessionState {
  campaignId: string | null;
  campaign: Campaign | null;
  character: Character | null;
  messages: ChatMessage[];
  diceRolls: Record<string, DiceRollRecord>;
  /** Active combat encounter; null when in exploration mode. */
  encounter: EncounterState | null;
  /** Floating numbers above the HP bar. UI consumes + clears these. */
  hpFx: HpDeltaFx[];

  /** Streaming DM text not yet finalized into a persisted message. */
  draftDm: string;
  /** True while the DM is "thinking" — no first token yet. */
  thinking: boolean;
  /** True while text is actively streaming. */
  streaming: boolean;
  /**
   * True from `beginTurn` until `runDmTurn` fully finishes — stream AND the
   * markup side effects (monster lazy-load, shop, level-up…). `streaming`
   * flips off earlier, so gate turn submission on this instead.
   */
  busy: boolean;
  /** Surface for transient errors (e.g., provider failed). */
  error: string | null;
  /** Outstanding skill check the player must roll before the DM continues. */
  pendingCheck: PendingCheck | null;
  /** Outstanding saving throw the player must roll before the DM continues. */
  pendingSave: PendingSave | null;
  /** Outstanding reaction prompt — player must pick use/pass before DM continues. */
  pendingReaction: PendingReaction | null;
  /** Outstanding concentration save (damage-driven). */
  pendingConcentration: PendingConcentrationSave | null;
  /** Damage amounts from further hits that still owe their own CON save. */
  concentrationQueue: number[];
  /** Active death-save loop — player rolls until 3 successes or 3 failures. */
  pendingDying: PendingDying | null;
  /** Set after 3 death-save failures — overlay until they choose end or twist. */
  pendingDeath: PendingDeath | null;
  /** Set when the DM has emitted [LEVELUP] — opens the level-up modal. */
  pendingLevelUp: PendingLevelUp | null;
  /** Player's current-round action economy (advisory). */
  actionEconomy: ActionEconomy;
  /**
   * Monotonic counter bumped at every player-turn boundary (turn reset, combat
   * start/end). Per-turn UI state (multi-attack count, "sneaked this turn")
   * keys off this instead of the action flag, which doesn't flip when a turn
   * ends with attacks unspent.
   */
  turnNonce: number;
  /** Currently open shop overlay (transient, not persisted). */
  shop: ShopState | null;

  loadCampaign: (campaignId: string) => Promise<void>;
  appendMessage: (msg: ChatMessage) => Promise<void>;
  appendDiceRoll: (
    msg: ChatMessage,
    roll: DiceRollRecord,
  ) => Promise<void>;
  setThinking: (thinking: boolean) => void;
  /** Start a DM turn: aborts the previous one and returns the new handle (null without a campaign). */
  beginTurn: () => TurnHandle | null;
  /** True while `id` is the live turn, in the campaign it started in, not aborted. */
  isTurnCurrent: (id: number) => boolean;
  /** Finish a turn. A superseded turn is a no-op so it can't clear its successor's flags. */
  endTurn: (id: number) => void;
  /** Abort whatever turn is in flight (navigation, campaign switch). */
  abortTurn: () => void;
  beginDraft: () => void;
  appendDraft: (delta: string) => void;
  /** Throw the streamed text away without persisting (aborted / failed stream). */
  discardDraft: () => void;
  finalizeDraft: (opts?: FinalizeDraftOptions) => Promise<ChatMessage | null>;
  setError: (error: string | null) => void;
  setPendingCheck: (check: PendingCheck | null) => void;
  setPendingSave: (save: PendingSave | null) => void;
  setPendingReaction: (reaction: PendingReaction | null) => void;
  /** Open a concentration save card after the player took damage while concentrating. */
  requestConcentrationSave: (damageTaken: number) => Promise<void>;
  /** Resolve the open concentration save with the rolled total. */
  resolveConcentrationSave: (rolledTotal: number) => Promise<void>;
  /** Begin concentrating on a spell (replaces any prior concentration). */
  beginConcentration: (input: { spellName: string; srdRef?: string }) => Promise<void>;
  /** Manually end concentration (spell dismissed / ran out). */
  endConcentration: () => Promise<void>;
  /** Nudge an NPC's personal disposition toward the player (clamped -2..+2). */
  adjustNpcDisposition: (input: { npc: string; delta: number }) => Promise<boolean>;
  /** Replace the campaign journal markdown (autosaved by the Codex Diário tab). */
  updateJournal: (markdown: string) => Promise<void>;
  /** Apply a condition timer (5e duration) to the player. */
  applyConditionTimer: (input: {
    index: Condition;
    rounds: number;
    saveEnd?: { ability: Ability; dc: number };
    source?: string;
  }) => Promise<void>;
  /** Advance combat by one round: decrement timers, expire conditions, bump round counter. */
  advanceCombatRound: () => Promise<{ expired: Condition[] } | null>;
  /** Spend a counter (ki, action surge, etc.); returns true on success. */
  spendUsage: (id: string, amount?: number) => Promise<boolean>;
  /** Toggle barbarian rage; auto-spends a rage charge on activate. */
  toggleRage: () => Promise<boolean>;
  /** Award inspiration (DM-driven). */
  grantInspiration: () => Promise<void>;
  /** Spend inspiration (player burns for advantage on next roll). */
  spendInspiration: () => Promise<boolean>;
  /** Upload portrait as base64 data URL. */
  setPortraitData: (dataUrl: string | null) => Promise<void>;
  /** Apply non-player damage with full scaling against InitiativeEntry defenses. */
  damageCombatantTyped: (
    id: string,
    amount: number,
    type: string,
  ) => Promise<{ amount: number; rawAmount: number; scale: import("@/engine/combat").DamageScale } | null>;
  /** Manually reconcile usage counters with current class progression. */
  resyncUsageCounters: () => Promise<void>;
  /** Persist the player's chosen cantrip + known-spell lists. */
  setKnownSpells: (input: { cantrips: string[]; spellsKnown: string[] }) => Promise<void>;
  setPendingDeath: (death: PendingDeath | null) => void;
  setPendingDying: (dying: PendingDying | null) => void;
  /** Apply the result of a single death-save roll. */
  applyDeathSaveDelta: (deltas: { successes: number; failures: number; recovered: boolean }) => Promise<void>;
  /** Reset the death-save pip counter (used on revive/stabilize). */
  clearDeathSaves: () => Promise<void>;
  requestLevelUp: (input: { classId: string; narration: string }) => void;
  applyLevelUp: (input: LevelUpInput) => Promise<void>;
  cancelLevelUp: () => void;
  consumeAction: (slot: "action" | "bonus") => void;
  resetActionEconomy: () => void;
  /** Restore player HP — used by the twist-of-fate flow. Animates a heal FX. */
  reviveToHalf: () => Promise<void>;
  /** Award XP and prompt level-up if the player crossed a threshold. */
  awardXp: (amount: number, reason?: string) => Promise<void>;
  /** Spend a spell slot of the given level. No-op if no slot or none available. */
  spendSlot: (level: SlotLevel) => Promise<boolean>;
  /** Take a long rest — refills HP, slots, half hit dice, drops exhaustion. */
  longRest: () => Promise<void>;
  /** Advance the in-world calendar by N days (long rests, travel). */
  advanceDay: (days: number) => Promise<void>;
  /** Spend one hit die during a short rest. */
  shortRestSpendHitDie: (classId: string) => Promise<{ healed: number; rolled: number; die: number } | null>;
  /** Finalize a short rest — applies non-hit-die refreshes (warlock, etc.). */
  shortRestFinalize: () => Promise<void>;
  /** Toggle equipped flag on an inventory item. */
  toggleEquipped: (itemId: string) => Promise<void>;
  /** Toggle attuned flag (enforces 3-item cap). Returns false if cap hit. */
  toggleAttunement: (itemId: string) => Promise<boolean>;
  /** Drink a potion item (removes 1 qty, heals via dice). */
  drinkPotion: (itemId: string) => Promise<{ healed: number } | null>;
  /** Add a feat to the character (used by level-up modal). */
  grantFeat: (feat: AcquiredFeat) => Promise<void>;
  /** Upsert a faction by case-insensitive name. */
  upsertFaction: (input: { name: string; description?: string }) => Promise<boolean>;
  /** Adjust a faction's reputation (clamped -100..+100). */
  adjustReputation: (input: { factionKey: string; delta: number }) => Promise<boolean>;
  /** Open a shop overlay (transient). */
  openShop: (state: ShopState) => void;
  closeShop: () => void;
  /** Purchase a single offer; deducts gp and adds inventory. */
  purchaseOffer: (offerId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Add or update a companion (deduped by name). */
  upsertCompanion: (input: Omit<CompanionEntry, "id" | "addedAt">) => Promise<boolean>;
  /** Remove a companion by id. */
  removeCompanion: (id: string) => Promise<void>;
  /** Set range bracket of a combatant in the active encounter. */
  setCombatantRange: (id: string, range: "close" | "near" | "far" | "veryFar") => Promise<void>;
  /** Travel by N days: consumes 1 ration/day; missing rations trigger hunger. */
  travel: (input: { days: number; destination?: string }) => Promise<{ rationsConsumed: number; daysHungry: number }>;
  /** Set rations directly (used by shop purchases / quest rewards). */
  setRations: (next: number) => Promise<void>;
  /** Chronicle everything up to the end of the story now (manual recap). */
  forceRecap: () => Promise<void>;
  /** Mark the campaign as concluded. Used after the DM finishes the closing recap. */
  endCampaign: () => Promise<void>;
  /** Add a place to the codex (deduped by case-insensitive name). Returns true if added. */
  addPlace: (input: { name: string; description: string }) => Promise<boolean>;
  /** Add an NPC to the codex (deduped by case-insensitive name). Returns true if added. */
  addNpc: (input: {
    name: string;
    description: string;
    kind: "ally" | "foe" | "neutral";
  }) => Promise<boolean>;
  /**
   * Create or update a quest by id. Omitted fields leave the existing quest
   * unchanged. On a fresh id, at minimum a title or objective is required —
   * the helper rejects empty quests so the DM can't pollute the codex.
   */
  upsertQuest: (input: {
    id: string;
    title?: string | null;
    objective?: string | null;
    status?: Quest["status"] | null;
  }) => Promise<boolean>;
  /** Append memory chapters and/or fold an arc; `summaryThroughTurn` follows the newest chapter. */
  appendMemory: (update: MemoryUpdate) => Promise<void>;

  /**
   * Write the player's new HP. Also drives the dying loop: healing from 0
   * clears it, damage while at 0 adds a failed death save (`opts.crit` = 2).
   * For damage at 0 HP pass the damage dealt as `fx.amount` — `next` can't
   * show it since HP is already 0.
   */
  applyHpChange: (
    next: Character["hp"],
    fx: Omit<HpDeltaFx, "id" | "ts">,
    opts?: { crit?: boolean },
  ) => Promise<void>;
  consumeHpFx: (id: string) => void;
  startEncounter: (entries: InitiativeEntry[]) => Promise<void>;
  endEncounter: () => Promise<void>;
  damageCombatant: (id: string, amount: number) => Promise<void>;
  healCombatant: (id: string, amount: number) => Promise<void>;

  reset: () => void;
}

const initial = {
  campaignId: null,
  campaign: null,
  character: null,
  messages: [],
  diceRolls: {},
  encounter: null,
  hpFx: [],
  draftDm: "",
  thinking: false,
  streaming: false,
  busy: false,
  error: null,
  pendingCheck: null,
  pendingSave: null,
  pendingReaction: null,
  pendingConcentration: null,
  concentrationQueue: [],
  pendingDying: null,
  pendingDeath: null,
  pendingLevelUp: null,
  actionEconomy: { action: false, bonus: false },
  turnNonce: 0,
  shop: null,
};

interface LiveTurn {
  id: number;
  campaignId: string;
  controller: AbortController;
}
let liveTurn: LiveTurn | null = null;
let turnSeq = 0;

function newPendingId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** True when a heal takes the player off 0 HP (ends the dying loop). */
function healedFromZero(before: Character, nextCurrent: number): boolean {
  return before.hp.current === 0 && nextCurrent > 0;
}

/** Combat is over: round-based condition timers have nothing left to count. */
function settleCombatTimers(character: Character): Character {
  if (character.conditionTimers.length === 0) return character;
  const { conditions, conditionTimers } = settleTimersAtCombatEnd(character);
  return { ...character, conditions, conditionTimers, updatedAt: Date.now() };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initial,

  async loadCampaign(campaignId: string) {
    // A turn streaming for the previous campaign must not write into this one.
    get().abortTurn();
    set({ ...initial, campaignId });
    const campaign = await db.campaigns.get(campaignId);
    if (!campaign) {
      set({ error: "Campaign not found" });
      return;
    }
    const rawCharacter = await db.characters.get(campaign.characterId);
    if (!rawCharacter) {
      set({ campaign, error: "Character not found" });
      return;
    }
    // Migrate older records: apply Zod defaults for any new schema fields that
    // were added after this character was first saved. If parse adds anything,
    // persist the upgraded record so future loads skip the work.
    const parsed = CharacterSchema.safeParse(rawCharacter);
    let character: Character = rawCharacter as Character;
    if (parsed.success) {
      character = parsed.data;
      const changed = JSON.stringify(parsed.data) !== JSON.stringify(rawCharacter);
      if (changed) {
        await db.characters.put(character);
      }
    } else {
      // Keep playing with the stored record (better than locking the player
      // out), but say loudly that it is unvalidated so a later crash is traceable.
      console.error(
        `[sessionStore] character ${rawCharacter.id} failed schema validation; loading it unvalidated`,
        parsed.error.issues,
      );
    }
    // Reconcile per-rest usage counters with the character's class
    // progression. Backfills counters for legacy saves and tops up after
    // any silent multiclass change.
    const synced = syncFeatureCounters(character);
    if (JSON.stringify(synced.usageCounters) !== JSON.stringify(character.usageCounters)) {
      character = synced;
      await db.characters.put(character);
    }
    // Backfill missing spell slots for any caster whose save predates the
    // auto-init in finalizeCharacter. Bards/clerics/wizards/etc. created
    // before that fix had `spellSlots: undefined` and couldn't cast.
    const withSlots = initializeSlotsFromClasses(character, (cid, lvl) => {
      const e = getClassLevel(cid, lvl);
      return e?.spellcasting ?? null;
    });
    if (
      withSlots.spellSlots &&
      JSON.stringify(withSlots.spellSlots) !== JSON.stringify(character.spellSlots ?? null)
    ) {
      character = withSlots;
      await db.characters.put(character);
    }
    const messages = await db.messages
      .where("[campaignId+ts]")
      .between([campaignId, 0], [campaignId, Number.MAX_SAFE_INTEGER])
      .toArray();
    const referencedRollIds = messages.flatMap((m) => m.diceRollIds);
    const diceRolls: Record<string, DiceRollRecord> = {};
    if (referencedRollIds.length > 0) {
      const found = await db.diceRolls.bulkGet(referencedRollIds);
      for (const r of found) if (r) diceRolls[r.id] = r;
    }
    const encounters = await db.encounters
      .where("campaignId")
      .equals(campaignId)
      .toArray();
    const activeEncounter =
      encounters
        .filter((e) => e.mode === "combat")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    // Restore transient pending prompts so a mid-roll reload doesn't lose the card.
    const [savedCheck, savedSave] = await Promise.all([
      db.settings.get(`pendingCheck:${campaignId}`),
      db.settings.get(`pendingSave:${campaignId}`),
    ]);
    const pendingCheck = (savedCheck?.value as PendingCheck | null | undefined) ?? null;
    const pendingSave = (savedSave?.value as PendingSave | null | undefined) ?? null;
    // Resume the dying loop after a reload: at 0 HP and not stabilized the
    // death saves go on; three failures (or exhaustion 6) means dead.
    // (`?.`/`??`: a record that failed validation above may lack these fields.)
    const dead =
      (character.deathSaves?.failures ?? 0) >= 3 ||
      exhaustionLevel(character.conditions ?? []) >= 6;
    const dying = !dead && character.hp.current === 0 && !character.deathSaves?.stable;
    const closed = !!campaign.endedAt;
    // A newer loadCampaign (or reset) took over while we were reading.
    if (get().campaignId !== campaignId) return;
    set({
      campaign,
      character,
      messages,
      diceRolls,
      encounter: dying || dead ? null : activeEncounter,
      pendingCheck: dying || dead ? null : pendingCheck,
      pendingSave: dying || dead ? null : pendingSave,
      pendingDeath: dead && !closed ? { id: newPendingId("death") } : null,
      pendingDying: dying && !closed ? { id: newPendingId("dying") } : null,
    });
  },

  async appendMessage(msg: ChatMessage) {
    await db.messages.put(msg);
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  async appendDiceRoll(msg, roll) {
    await db.transaction("rw", db.messages, db.diceRolls, async () => {
      await db.diceRolls.put(roll);
      await db.messages.put(msg);
    });
    set((s) => ({
      messages: [...s.messages, msg],
      diceRolls: { ...s.diceRolls, [roll.id]: roll },
    }));
  },

  setThinking(thinking) {
    set({ thinking });
  },

  beginDraft() {
    set({ draftDm: "", streaming: true, thinking: false });
  },

  appendDraft(delta) {
    set((s) => ({ draftDm: s.draftDm + delta, streaming: true, thinking: false }));
  },

  beginTurn() {
    const { campaignId } = get();
    if (!campaignId) return null;
    liveTurn?.controller.abort();
    const turn: LiveTurn = { id: ++turnSeq, campaignId, controller: new AbortController() };
    liveTurn = turn;
    // Whatever the superseded turn left on screen is abandoned with it.
    set({ busy: true, draftDm: "", streaming: false });
    return { id: turn.id, campaignId, signal: turn.controller.signal };
  },

  isTurnCurrent(id) {
    return (
      liveTurn?.id === id &&
      liveTurn.campaignId === get().campaignId &&
      !liveTurn.controller.signal.aborted
    );
  },

  endTurn(id) {
    if (liveTurn?.id !== id) return;
    liveTurn = null;
    set({ busy: false, thinking: false, streaming: false });
  },

  abortTurn() {
    liveTurn?.controller.abort();
    liveTurn = null;
    set({ busy: false, thinking: false, streaming: false, draftDm: "" });
  },

  discardDraft() {
    set({ draftDm: "", streaming: false });
  },

  async finalizeDraft(opts) {
    const { draftDm, campaignId } = get();
    set({ streaming: false });
    // The loaded campaign changed under the caller: never write to the new one.
    if (!campaignId || (opts?.campaignId && opts.campaignId !== campaignId)) return null;
    const content = opts?.sanitize ? opts.sanitize(draftDm) : draftDm;
    if (content.trim().length === 0) {
      set({ draftDm: "" });
      return null;
    }
    const ts = Date.now();
    const id = `m_${ts}_${Math.random().toString(36).slice(2, 8)}`;
    const final: ChatMessage = {
      id,
      campaignId,
      role: "dm",
      content,
      toolCallIds: [],
      diceRollIds: [],
      ts,
    };
    set({ draftDm: "" });
    await db.messages.put(final);
    // The write is saved against the campaign it belongs to; only mirror it
    // into the visible log while that campaign is still the loaded one.
    if (get().campaignId === campaignId) {
      set((s) => ({ messages: [...s.messages, final] }));
    }
    return final;
  },

  setError(error) {
    set({ error });
  },

  setPendingCheck(pendingCheck) {
    set({ pendingCheck });
    const cid = get().campaignId;
    if (cid) {
      void db.settings.put({
        key: `pendingCheck:${cid}`,
        value: pendingCheck,
        updatedAt: Date.now(),
      });
    }
  },

  setPendingSave(pendingSave) {
    set({ pendingSave });
    const cid = get().campaignId;
    if (cid) {
      void db.settings.put({
        key: `pendingSave:${cid}`,
        value: pendingSave,
        updatedAt: Date.now(),
      });
    }
  },

  setPendingReaction(pendingReaction) {
    set({ pendingReaction });
  },

  async requestConcentrationSave(damageTaken) {
    const { character, campaignId, pendingConcentration } = get();
    if (!character || !campaignId || !character.concentration) return;
    // 5e RAW: one CON save per damage instance. Another hit while a save card
    // is open waits its turn instead of overwriting the card.
    if (pendingConcentration) {
      set((s) => ({ concentrationQueue: [...s.concentrationQueue, damageTaken] }));
      return;
    }
    set({
      pendingConcentration: {
        id: `con_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        spellName: character.concentration.spellName,
        dc: concentrationSaveDc(damageTaken),
        damageTaken,
      },
    });
  },

  async resolveConcentrationSave(rolledTotal) {
    const { character, pendingConcentration, campaignId, concentrationQueue } = get();
    if (!character || !campaignId || !pendingConcentration) return;
    const passed = rolledTotal >= pendingConcentration.dc;
    if (passed) {
      const [next, ...rest] = concentrationQueue;
      set({
        pendingConcentration:
          next === undefined
            ? null
            : {
                id: `con_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                spellName: pendingConcentration.spellName,
                dc: concentrationSaveDc(next),
                damageTaken: next,
              },
        concentrationQueue: rest,
      });
      return;
    }
    // Failed: the spell is gone, so any queued saves are moot.
    const updated = endConcentration(character);
    await db.characters.put(updated);
    set({ character: updated, pendingConcentration: null, concentrationQueue: [] });
  },

  async beginConcentration({ spellName, srdRef }) {
    const { character } = get();
    if (!character) return;
    const updated = startConcentration(character, {
      spellName,
      ...(srdRef ? { srdRef } : {}),
    });
    await db.characters.put(updated);
    set({ character: updated });
  },

  async endConcentration() {
    const { character } = get();
    if (!character || !character.concentration) return;
    const updated = endConcentration(character);
    await db.characters.put(updated);
    set({ character: updated, pendingConcentration: null, concentrationQueue: [] });
  },

  async adjustNpcDisposition({ npc, delta }) {
    const { campaign } = get();
    if (!campaign || !npc || delta === 0) return false;
    const key = npc.trim().toLowerCase();
    const list = campaign.npcsMet ?? [];
    const idx = list.findIndex((n) => n.key === key);
    if (idx < 0) return false;
    const cur = list[idx]!;
    const nextDisp = Math.max(-2, Math.min(2, (cur.disposition ?? 0) + delta));
    if (nextDisp === (cur.disposition ?? 0)) return false;
    const next = [...list];
    next[idx] = { ...cur, disposition: nextDisp };
    const c: Campaign = {
      ...campaign,
      npcsMet: next,
      updatedAt: Date.now(),
    };
    await db.campaigns.put(c);
    set({ campaign: c });
    return true;
  },

  async updateJournal(markdown) {
    const { campaign } = get();
    if (!campaign) return;
    const next: Campaign = {
      ...campaign,
      journal: markdown,
      updatedAt: Date.now(),
    };
    await db.campaigns.put(next);
    set({ campaign: next });
  },

  async applyConditionTimer(input) {
    const { character } = get();
    if (!character) return;
    const { conditions, conditionTimers } = engineAddConditionTimer(
      { conditions: character.conditions, conditionTimers: character.conditionTimers },
      input,
    );
    const next: Character = {
      ...character,
      conditions,
      conditionTimers,
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
  },

  async advanceCombatRound() {
    const { character, encounter } = get();
    if (!character) return null;
    // No-op outside combat — condition timers only tick during encounters.
    if (!encounter) return null;
    const { conditions, conditionTimers, expired } = engineDecrementConditionTimers({
      conditions: character.conditions,
      conditionTimers: character.conditionTimers,
    });
    const nextChar: Character = {
      ...character,
      conditions,
      conditionTimers,
      updatedAt: Date.now(),
    };
    await db.characters.put(nextChar);
    const nextEnc: EncounterState = {
      ...encounter,
      round: encounter.round + 1,
      updatedAt: Date.now(),
    };
    await db.encounters.put(nextEnc);
    set({ character: nextChar, encounter: nextEnc });
    return { expired };
  },

  async spendUsage(id, amount = 1) {
    const { character } = get();
    if (!character) return false;
    const next = engineSpendCounter(character, id, amount);
    if (!next) return false;
    await db.characters.put(next);
    set({ character: next });
    return true;
  },

  async toggleRage() {
    const { character } = get();
    if (!character) return false;
    if (character.raging) {
      const updated: Character = { ...character, raging: false, updatedAt: Date.now() };
      await db.characters.put(updated);
      set({ character: updated });
      return true;
    }
    // Activating rage costs a rage charge.
    const consumed = engineSpendCounter(character, "rage", 1);
    if (!consumed) return false;
    const updated: Character = { ...consumed, raging: true, updatedAt: Date.now() };
    await db.characters.put(updated);
    set({ character: updated });
    return true;
  },

  async grantInspiration() {
    const { character } = get();
    if (!character || character.inspiration) return;
    const updated: Character = { ...character, inspiration: true, updatedAt: Date.now() };
    await db.characters.put(updated);
    set({ character: updated });
  },

  async spendInspiration() {
    const { character } = get();
    if (!character || !character.inspiration) return false;
    const updated: Character = { ...character, inspiration: false, updatedAt: Date.now() };
    await db.characters.put(updated);
    set({ character: updated });
    return true;
  },

  async setPortraitData(dataUrl) {
    const { character } = get();
    if (!character) return;
    // Use a stable convention: `data:` URLs replace the portrait id; clearing
    // back to null falls through to the lucide-icon default.
    const updated: Character = {
      ...character,
      portraitId: dataUrl ?? undefined,
      updatedAt: Date.now(),
    };
    await db.characters.put(updated);
    set({ character: updated });
  },

  async damageCombatantTyped(id, amount, type) {
    const { encounter } = get();
    if (!encounter) return null;
    const target = encounter.initiative.find((e) => e.id === id);
    if (!target) return null;
    const scaled = scaleDamageByType(amount, type, {
      resistances: target.resistances,
      vulnerabilities: target.vulnerabilities,
      immunities: target.immunities,
    });
    await get().damageCombatant(id, scaled.amount);
    return { amount: scaled.amount, rawAmount: amount, scale: scaled.scale };
  },

  async resyncUsageCounters() {
    const { character } = get();
    if (!character) return;
    const next = syncFeatureCounters(character);
    if (JSON.stringify(next.usageCounters) === JSON.stringify(character.usageCounters)) {
      return;
    }
    await db.characters.put(next);
    set({ character: next });
  },

  async setKnownSpells({ cantrips, spellsKnown }) {
    const { character } = get();
    if (!character) return;
    // For prepared casters (cleric/druid/wizard) we mirror the known list to
    // `spellsPrepared` — full preparation UI is a follow-up; this gets the
    // SpellsPanel cast list populated immediately.
    const updated: Character = {
      ...character,
      cantrips: [...new Set(cantrips)],
      spellsKnown: [...new Set(spellsKnown)],
      spellsPrepared: [...new Set(spellsKnown)],
      updatedAt: Date.now(),
    };
    await db.characters.put(updated);
    set({ character: updated });
  },

  setPendingDeath(pendingDeath) {
    set({ pendingDeath });
  },

  setPendingDying(pendingDying) {
    set({ pendingDying });
  },

  async applyDeathSaveDelta(delta) {
    const { character } = get();
    if (!character) return;
    const { deathSaves, status } = resolveDeathSaveDelta(
      character.deathSaves ?? CLEAR_DEATH_SAVES,
      delta,
    );
    let updated: Character = { ...character, deathSaves, updatedAt: Date.now() };
    // Recovered (nat 20) wakes at 1 HP.
    if (status === "recovered") {
      updated = { ...updated, hp: { ...updated.hp, current: 1 } };
    }
    await db.characters.put(updated);
    if (status === "recovered") {
      const fxRecord: HpDeltaFx = {
        id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        kind: "heal",
        amount: 1,
      };
      set((s) => ({ character: updated, hpFx: [...s.hpFx, fxRecord], pendingDying: null }));
    } else if (status === "dead") {
      // Dead — transition to the end/twist overlay.
      set({ character: updated, pendingDying: null, pendingDeath: { id: newPendingId("death") } });
    } else if (status === "stable") {
      // Stabilized — clear dying state but keep 0 HP (`deathSaves.stable`
      // survives a reload). A heal or long rest wakes the player.
      set({ character: updated, pendingDying: null });
    } else {
      set({ character: updated });
    }
  },

  async clearDeathSaves() {
    const { character } = get();
    if (!character) return;
    const updated: Character = {
      ...character,
      deathSaves: { successes: 0, failures: 0 },
      updatedAt: Date.now(),
    };
    await db.characters.put(updated);
    set({ character: updated });
  },

  requestLevelUp({ classId, narration }) {
    const { character } = get();
    if (!character) return;
    // Guard: don't open during active combat — the DM prompt forbids it but
    // safety nets are cheap. Also guard while dying or dead.
    if (get().encounter || get().pendingDying || get().pendingDeath) return;
    // Guard: max level 20 across all classes.
    const totalLvl = character.classes.reduce((sum, c) => sum + c.level, 0);
    if (totalLvl >= 20) return;
    set({
      pendingLevelUp: {
        id: `lu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        classId,
        narration,
      },
    });
  },

  cancelLevelUp() {
    set({ pendingLevelUp: null });
  },

  async applyLevelUp(input) {
    const { character } = get();
    if (!character) return;
    const klass = getClass(input.classId);
    if (!klass) return;

    // Find or create the class entry.
    let classes = [...character.classes];
    const idx = classes.findIndex((c) => c.classId === input.classId);
    let newLevel: number;
    if (idx >= 0) {
      const cur = classes[idx]!;
      newLevel = cur.level + 1;
      classes[idx] = {
        ...cur,
        level: newLevel,
        subclassId: input.subclassId ?? cur.subclassId,
      };
    } else {
      newLevel = 1;
      classes.push({
        classId: input.classId,
        level: 1,
        ...(input.subclassId ? { subclassId: input.subclassId } : {}),
      });
    }

    // Apply ASI (or feat, exclusive).
    const abilities = { ...character.abilities };
    if (input.asi) {
      for (const { ability, amount } of input.asi) {
        abilities[ability] = Math.min(20, abilities[ability] + amount);
      }
    }

    // HP gain = average of class hit die + CON mod (+2 with Tough, which
    // keeps paying on every later level).
    const conMod = abilityModifier(abilities.con);
    const toughBonus = character.feats.some((f) => f.featId === "tough") ? 2 : 0;
    const gain = Math.max(1, averageHitDieGain(klass.hit_die, conMod)) + toughBonus;
    // RAW: when the CON modifier rises, the HP maximum rises by that much for
    // every level already attained (this level's gain above uses the new mod).
    const levelsBefore = character.classes.reduce((sum, c) => sum + c.level, 0);
    const retroactive =
      (conMod - abilityModifier(character.abilities.con)) * levelsBefore;
    const newHpMax = character.hp.max + gain + retroactive;
    const newHpCurrent = Math.min(
      newHpMax,
      Math.max(0, character.hp.current + gain + retroactive),
    );

    // Update hit dice array.
    const hitDice: HitDieEntry[] = [...character.hitDice];
    const hdIdx = hitDice.findIndex((h) => h.classId === input.classId);
    if (hdIdx >= 0) {
      const cur = hitDice[hdIdx]!;
      hitDice[hdIdx] = { ...cur, max: cur.max + 1, current: cur.current + 1 };
    } else {
      hitDice.push({
        classId: input.classId,
        die: klass.hit_die,
        max: 1,
        current: 1,
      });
    }

    // Register newly granted features at this level.
    const newFeatures = featuresForClassLevel(input.classId, newLevel);
    const featuresAcquired: AcquiredFeature[] = [...character.featuresAcquired];
    for (const f of newFeatures) {
      const alreadyHas = featuresAcquired.some(
        (a) => a.classId === input.classId && a.featureIndex === f.index,
      );
      if (!alreadyHas) {
        featuresAcquired.push({
          classId: input.classId,
          level: newLevel,
          featureIndex: f.index,
        });
      }
    }

    const preSync: Character = {
      ...character,
      classes,
      abilities,
      hp: { ...character.hp, max: newHpMax, current: newHpCurrent },
      hitDice,
      featuresAcquired,
      updatedAt: Date.now(),
    };
    const withSlots = initializeSlotsFromClasses(preSync, (cid, lvl) => {
      const e = getClassLevel(cid, lvl);
      return e?.spellcasting ?? null;
    });
    const updated = syncFeatureCounters(withSlots);
    await db.characters.put(updated);
    set({ character: updated, pendingLevelUp: null });
    // If the player chose a feat at this ASI level, apply it.
    if (input.feat) {
      const totalNewLevel = updated.classes.reduce((s, c) => s + c.level, 0);
      await get().grantFeat({
        featId: input.feat.featId,
        level: totalNewLevel,
        ...(input.feat.choice ? { choice: input.feat.choice } : {}),
      });
    }
  },

  async awardXp(amount, _reason) {
    void _reason;
    const { character } = get();
    if (!character) return;
    const xpBefore = character.xp;
    const levelBefore = character.classes.reduce((s, c) => s + c.level, 0);
    const xpAfter = Math.max(0, xpBefore + amount);
    const updated: Character = { ...character, xp: xpAfter, updatedAt: Date.now() };
    await db.characters.put(updated);
    set({ character: updated });
    // If we crossed a threshold and aren't in combat/death, surface a level-up.
    const levelByXp = levelForXp(xpAfter);
    if (levelByXp > levelBefore && levelBefore < 20) {
      // Prefer the primary class for the next level. The modal lets the user
      // pick a different class only when they hit a level-up screen — for now
      // default to the first class.
      const primary = updated.classes[0]?.classId;
      if (primary && !get().encounter && !get().pendingDying && !get().pendingDeath) {
        get().requestLevelUp({ classId: primary, narration: "" });
      }
    }
  },

  async spendSlot(level) {
    const { character } = get();
    if (!character) return false;
    const next = spendSlot(character, level);
    if (!next) return false;
    await db.characters.put(next);
    set({ character: next });
    return true;
  },

  async longRest() {
    const { character } = get();
    if (!character) return;
    const refreshed = engineRefreshCounters(character, "long");
    const next = applyLongRest({ ...refreshed, raging: false });
    await db.characters.put(next);
    const delta = next.hp.current - character.hp.current;
    const fxRecord: HpDeltaFx | null =
      delta > 0
        ? {
            id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ts: Date.now(),
            kind: "heal",
            amount: delta,
          }
        : null;
    set((s) => ({
      character: next,
      hpFx: fxRecord ? [...s.hpFx, fxRecord] : s.hpFx,
      pendingDying: null,
      pendingConcentration: null,
      concentrationQueue: [],
    }));
    // A long rest spans a night — roll the in-world calendar forward a day.
    await get().advanceDay(1);
  },

  async advanceDay(days) {
    const { campaign } = get();
    if (!campaign || days <= 0) return;
    const next: Campaign = {
      ...campaign,
      inWorldDay: (campaign.inWorldDay ?? 1) + Math.floor(days),
      updatedAt: Date.now(),
    };
    await db.campaigns.put(next);
    set({ campaign: next });
  },

  async shortRestSpendHitDie(classId) {
    const { character } = get();
    if (!character) return null;
    const out = spendHitDie(character, classId);
    if (!out) return null;
    const woke = healedFromZero(character, out.next.hp.current);
    const healed: Character = woke
      ? { ...out.next, deathSaves: { ...CLEAR_DEATH_SAVES } }
      : out.next;
    await db.characters.put(healed);
    const fxRecord: HpDeltaFx = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      kind: "heal",
      amount: out.roll.healed,
    };
    set((s) => ({
      character: healed,
      hpFx: [...s.hpFx, fxRecord],
      ...(woke ? { pendingDying: null } : {}),
    }));
    return { healed: out.roll.healed, rolled: out.roll.rolled, die: out.roll.die };
  },

  async shortRestFinalize() {
    const { character } = get();
    if (!character) return;
    const refreshed = engineRefreshCounters(character, "short");
    const next = applyShortRestRefreshes(refreshed);
    await db.characters.put(next);
    set({ character: next });
  },

  async toggleEquipped(itemId) {
    const { character } = get();
    if (!character) return;
    const next: Character = {
      ...character,
      inventory: character.inventory.map((i) =>
        i.id === itemId ? { ...i, equipped: !i.equipped } : i,
      ),
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
  },

  async toggleAttunement(itemId) {
    const { character } = get();
    if (!character) return false;
    const item = character.inventory.find((i) => i.id === itemId);
    if (!item) return false;
    if (!item.attuned && attunedCount(character) >= ATTUNEMENT_CAP) return false;
    const next: Character = {
      ...character,
      inventory: character.inventory.map((i) =>
        i.id === itemId ? { ...i, attuned: !i.attuned } : i,
      ),
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
    return true;
  },

  async drinkPotion(itemId) {
    const { character } = get();
    if (!character) return null;
    const item = character.inventory.find((i) => i.id === itemId);
    if (!item) return null;
    if (!isPotionItem(item.name, item.srdRef)) return null;
    const recipe =
      potionHealing(item.srdRef ?? item.name) ??
      potionHealing(item.name.toLowerCase().replace(/\s+/g, "-")) ??
      { dice: "2d4+2", label: item.name };
    const result = rollExpression(recipe.dice);
    const healed = Math.min(
      Math.max(0, effectiveHpMax(character.hp.max, character.conditions) - character.hp.current),
      Math.max(0, result.total),
    );
    const newQty = item.qty - 1;
    const inventory =
      newQty <= 0
        ? character.inventory.filter((i) => i.id !== itemId)
        : character.inventory.map((i) =>
            i.id === itemId ? { ...i, qty: newQty } : i,
          );
    const woke = healedFromZero(character, character.hp.current + healed);
    const next: Character = {
      ...character,
      hp: { ...character.hp, current: character.hp.current + healed },
      ...(woke ? { deathSaves: { ...CLEAR_DEATH_SAVES } } : {}),
      inventory,
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    const fxRecord: HpDeltaFx = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      kind: "heal",
      amount: healed,
    };
    set((s) => ({
      character: next,
      hpFx: [...s.hpFx, fxRecord],
      ...(woke ? { pendingDying: null } : {}),
    }));
    return { healed };
  },

  async grantFeat(feat) {
    const { character } = get();
    if (!character) return;
    if (character.feats.some((f) => f.featId === feat.featId)) return;
    const featData = getFeat(feat.featId);
    let hpBonus = 0;
    let initBonus = 0;
    const savingThrows = [...character.savingThrows];
    if (featData) {
      const eff = featData.effect;
      if (eff.hpBonus) hpBonus += eff.hpBonus;
      if (eff.initBonus) initBonus += eff.initBonus;
      // Tough: +2 HP per character level on acquisition.
      if (feat.featId === "tough") {
        const lvl = character.classes.reduce((s, c) => s + c.level, 0);
        hpBonus += 2 * lvl;
      }
      // Resilient: +1 to chosen ability AND save proficiency.
      if (feat.featId === "resilient" && feat.choice) {
        const ab = feat.choice as Ability;
        if (!savingThrows.includes(ab)) savingThrows.push(ab);
      }
    }
    const abilities = { ...character.abilities };
    if (feat.featId === "resilient" && feat.choice) {
      const ab = feat.choice as Ability;
      abilities[ab] = Math.min(20, abilities[ab] + 1);
    }
    // Resilient (CON) can lift the modifier: +1 max HP per level attained.
    hpBonus +=
      (abilityModifier(abilities.con) - abilityModifier(character.abilities.con)) *
      character.classes.reduce((s, c) => s + c.level, 0);
    const newMax = character.hp.max + hpBonus;
    const next: Character = {
      ...character,
      hp: { max: newMax, current: character.hp.current + hpBonus, temp: character.hp.temp },
      initiativeBonus: character.initiativeBonus + initBonus,
      savingThrows,
      abilities,
      feats: [...character.feats, feat],
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
  },

  async upsertFaction({ name, description }) {
    const { campaign } = get();
    if (!campaign) return false;
    const existing = campaign.factions ?? [];
    const key = name.trim().toLowerCase();
    if (!key) return false;
    const now = Date.now();
    const idx = existing.findIndex((f) => f.key === key);
    if (idx >= 0) {
      const cur = existing[idx]!;
      const updated: FactionEntry = {
        ...cur,
        description: description ? description.trim() : cur.description,
        updatedAt: now,
      };
      const next = [...existing];
      next[idx] = updated;
      const c: Campaign = { ...campaign, factions: next, updatedAt: now };
      await db.campaigns.put(c);
      set({ campaign: c });
      return true;
    }
    const entry: FactionEntry = {
      id: `fac_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: (description ?? "").trim(),
      reputation: 0,
      key,
      updatedAt: now,
    };
    const c: Campaign = { ...campaign, factions: [...existing, entry], updatedAt: now };
    await db.campaigns.put(c);
    set({ campaign: c });
    return true;
  },

  async adjustReputation({ factionKey, delta }) {
    const { campaign } = get();
    if (!campaign) return false;
    const key = factionKey.trim().toLowerCase();
    const factions = campaign.factions ?? [];
    const idx = factions.findIndex((f) => f.key === key);
    if (idx < 0) return false;
    const cur = factions[idx]!;
    const next: FactionEntry = {
      ...cur,
      reputation: Math.max(-100, Math.min(100, cur.reputation + delta)),
      updatedAt: Date.now(),
    };
    const list = [...factions];
    list[idx] = next;
    const c: Campaign = { ...campaign, factions: list, updatedAt: Date.now() };
    await db.campaigns.put(c);
    set({ campaign: c });
    return true;
  },

  openShop(state) {
    set({ shop: state });
  },

  closeShop() {
    set({ shop: null });
  },

  async purchaseOffer(offerId) {
    const { character, shop } = get();
    if (!character || !shop) return { ok: false, reason: "no-shop" };
    const offer = shop.offers.find((o) => o.id === offerId);
    if (!offer) return { ok: false, reason: "no-offer" };
    const currency = character.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    if (currency.gp < offer.priceGp) return { ok: false, reason: "broke" };
    const nextCurrency = { ...currency, gp: currency.gp - offer.priceGp };
    const inv = [...character.inventory];
    const existingIdx = inv.findIndex(
      (i) => i.name.toLowerCase() === offer.name.toLowerCase(),
    );
    if (existingIdx >= 0) {
      const cur = inv[existingIdx]!;
      inv[existingIdx] = { ...cur, qty: cur.qty + offer.qty };
    } else {
      inv.push({
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: offer.name,
        qty: offer.qty,
        equipped: false,
        attuned: false,
        ...(offer.description ? { notes: offer.description } : {}),
      });
    }
    const next: Character = {
      ...character,
      currency: nextCurrency,
      inventory: inv,
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    // Mark the offer consumed in the shop snapshot.
    const newOffers = shop.offers
      .map((o) => (o.id === offerId ? { ...o, qty: o.qty - offer.qty } : o))
      .filter((o) => o.qty > 0);
    set({ character: next, shop: { ...shop, offers: newOffers } });
    return { ok: true };
  },

  async upsertCompanion(input) {
    const { campaign } = get();
    if (!campaign) return false;
    const existing = campaign.companions ?? [];
    const key = input.name.trim().toLowerCase();
    const idx = existing.findIndex((c) => c.name.trim().toLowerCase() === key);
    const now = Date.now();
    if (idx >= 0) {
      const cur = existing[idx]!;
      const updated: CompanionEntry = { ...cur, ...input };
      const list = [...existing];
      list[idx] = updated;
      const c: Campaign = { ...campaign, companions: list, updatedAt: now };
      await db.campaigns.put(c);
      set({ campaign: c });
      return true;
    }
    const entry: CompanionEntry = {
      ...input,
      id: `comp_${now}_${Math.random().toString(36).slice(2, 6)}`,
      addedAt: now,
    };
    const c: Campaign = { ...campaign, companions: [...existing, entry], updatedAt: now };
    await db.campaigns.put(c);
    set({ campaign: c });
    return true;
  },

  async removeCompanion(id) {
    const { campaign } = get();
    if (!campaign) return;
    const list = (campaign.companions ?? []).filter((c) => c.id !== id);
    const c: Campaign = { ...campaign, companions: list, updatedAt: Date.now() };
    await db.campaigns.put(c);
    set({ campaign: c });
  },

  async setCombatantRange(id, range) {
    const { encounter } = get();
    if (!encounter) return;
    const next: EncounterState = {
      ...encounter,
      initiative: encounter.initiative.map((e) =>
        e.id === id ? { ...e, range } : e,
      ),
      updatedAt: Date.now(),
    };
    await db.encounters.put(next);
    set({ encounter: next });
  },

  async travel({ days, destination }) {
    void destination;
    const { character } = get();
    if (!character) return { rationsConsumed: 0, daysHungry: 0 };
    const hunger = resolveTravelHunger({
      rationsBefore: character.rations ?? 0,
      days,
      daysWithoutFood: character.daysWithoutFood ?? 0,
      conMod: abilityModifier(character.abilities.con),
      exhaustionLevel: exhaustionLevel(character.conditions),
    });
    const conditions = withExhaustionLevel(character.conditions, hunger.exhaustionLevel);
    // Exhaustion 4 halves the HP maximum: current HP can't stay above it.
    const hpCap = effectiveHpMax(character.hp.max, conditions);
    const next: Character = {
      ...character,
      rations: hunger.rationsAfter,
      daysWithoutFood: hunger.daysWithoutFood,
      conditions,
      hp: { ...character.hp, current: Math.min(character.hp.current, hpCap) },
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
    // Exhaustion 6 is death: hand over to the end/twist overlay.
    if (hunger.exhaustionLevel >= 6 && !get().pendingDeath && !get().campaign?.endedAt) {
      set({ pendingDying: null, pendingDeath: { id: newPendingId("death") } });
    }
    await get().advanceDay(days);
    return { rationsConsumed: hunger.rationsConsumed, daysHungry: hunger.daysHungry };
  },

  async setRations(nextValue) {
    const { character } = get();
    if (!character) return;
    const next: Character = {
      ...character,
      rations: Math.max(0, Math.floor(nextValue)),
      updatedAt: Date.now(),
    };
    await db.characters.put(next);
    set({ character: next });
  },

  async forceRecap() {
    const { maybeSummarize } = await import("@/ai/summarizer");
    await maybeSummarize({ force: true });
  },

  async reviveToHalf() {
    const { character } = get();
    if (!character) return;
    const restored = Math.max(
      1,
      Math.floor(effectiveHpMax(character.hp.max, character.conditions) / 2),
    );
    const delta = restored - character.hp.current;
    const newHp: Character["hp"] = {
      max: character.hp.max,
      current: restored,
      temp: 0,
    };
    // The twist undoes the death: fresh pips, and exhaustion 6 (the other way
    // to die) steps back to 5 so the next load doesn't kill the player again.
    const updated: Character = {
      ...character,
      hp: newHp,
      deathSaves: { ...CLEAR_DEATH_SAVES },
      conditions: withExhaustionLevel(
        character.conditions,
        Math.min(5, exhaustionLevel(character.conditions)),
      ),
      updatedAt: Date.now(),
    };
    await db.characters.put(updated);
    const fxRecord: HpDeltaFx = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      kind: "heal",
      amount: Math.max(0, delta),
    };
    set((s) => ({
      character: updated,
      hpFx: [...s.hpFx, fxRecord],
      pendingDeath: null,
      pendingDying: null,
    }));
  },

  async endCampaign() {
    const { campaign } = get();
    if (!campaign) return;
    const endedAt = Date.now();
    const updated = { ...campaign, endedAt, updatedAt: endedAt };
    await db.campaigns.put(updated);
    set({ campaign: updated, pendingDeath: null });
  },

  async addPlace({ name, description }) {
    const { campaign } = get();
    if (!campaign) return false;
    const existing = campaign.placesVisited ?? [];
    const key = name.trim().toLowerCase();
    if (existing.some((p) => p.key === key)) return false;
    const entry: PlaceEntry = {
      id: `place_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: description.trim(),
      key,
      addedAt: Date.now(),
    };
    const next: Campaign = {
      ...campaign,
      placesVisited: [...existing, entry],
      updatedAt: Date.now(),
    };
    await db.campaigns.put(next);
    set({ campaign: next });
    return true;
  },

  async addNpc({ name, description, kind }) {
    const { campaign } = get();
    if (!campaign) return false;
    const existing = campaign.npcsMet ?? [];
    const key = name.trim().toLowerCase();
    if (existing.some((n) => n.key === key)) return false;
    const entry: NpcEntry = {
      id: `npc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: description.trim(),
      kind,
      disposition: 0,
      key,
      addedAt: Date.now(),
    };
    const next: Campaign = {
      ...campaign,
      npcsMet: [...existing, entry],
      updatedAt: Date.now(),
    };
    await db.campaigns.put(next);
    set({ campaign: next });
    return true;
  },

  async upsertQuest({ id, title, objective, status }) {
    const { campaign } = get();
    if (!campaign) return false;
    const existing = campaign.quests ?? [];
    const idx = existing.findIndex((q) => q.id === id);
    const now = Date.now();

    if (idx === -1) {
      // New quest. Require at least a title or objective.
      if (!title && !objective) return false;
      const fresh: Quest = {
        id,
        title: (title ?? id).trim(),
        objective: (objective ?? "").trim(),
        status: status ?? "active",
        updatedAt: now,
      };
      const next: Campaign = {
        ...campaign,
        quests: [...existing, fresh],
        updatedAt: now,
      };
      await db.campaigns.put(next);
      set({ campaign: next });
      return true;
    }

    const current = existing[idx]!;
    const updated: Quest = {
      ...current,
      title: title != null ? title.trim() : current.title,
      objective: objective != null ? objective.trim() : current.objective,
      status: status ?? current.status,
      updatedAt: now,
    };
    const nextQuests = [...existing];
    nextQuests[idx] = updated;
    const next: Campaign = {
      ...campaign,
      quests: nextQuests,
      updatedAt: now,
    };
    await db.campaigns.put(next);
    set({ campaign: next });
    return true;
  },

  async appendMemory(update) {
    const { campaign } = get();
    if (!campaign) return;
    const next = applyMemoryUpdate(campaign, update);
    await db.campaigns.put(next);
    set({ campaign: next });
  },

  consumeAction(slot) {
    set((s) => ({ actionEconomy: { ...s.actionEconomy, [slot]: true } }));
  },

  resetActionEconomy() {
    set((s) => ({
      actionEconomy: { action: false, bonus: false },
      turnNonce: s.turnNonce + 1,
    }));
  },

  async applyHpChange(next, fx, opts) {
    const state = get();
    const character = state.character;
    if (!character) return;
    // A dead character (3 failed saves, awaiting end/twist) isn't healed by
    // narration — the twist of fate is the way back.
    if (state.pendingDeath && next.current > 0) return;
    const wasAlive = character.hp.current > 0;
    const droppingToZero = next.current === 0 && wasAlive;
    const wokeUp = healedFromZero(character, next.current);
    // Damage at 0 HP can't lower HP further — `fx.amount` carries it instead.
    const hitAtZero = !wasAlive && next.current === 0 && fx.kind === "damage" && fx.amount > 0;
    // 5e RAW: concentration auto-breaks at 0 HP. Drop it immediately so the
    // sheet/narration reflect reality before the dying loop opens.
    const concentration =
      droppingToZero && character.concentration ? null : character.concentration;
    let deathSaves = character.deathSaves ?? CLEAR_DEATH_SAVES;
    let dead = false;
    if (droppingToZero || wokeUp) {
      deathSaves = { ...CLEAR_DEATH_SAVES };
    } else if (hitAtZero) {
      const r = damageWhileAtZero(deathSaves, opts?.crit ?? false);
      deathSaves = r.deathSaves;
      dead = r.status === "dead";
    }
    let updated: Character = {
      ...character,
      hp: next,
      concentration,
      deathSaves,
      updatedAt: Date.now(),
    };
    if (droppingToZero && state.encounter) updated = settleCombatTimers(updated);
    await db.characters.put(updated);
    const fxRecord: HpDeltaFx = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...fx,
    };
    set((s) => ({
      character: updated,
      hpFx: [...s.hpFx, fxRecord],
      ...(wokeUp ? { pendingDying: null } : {}),
    }));

    if (hitAtZero) {
      // Already down: the hit costs a death save (two on a crit). A stabilized
      // character starts dying again; three failures is death.
      if (dead) {
        set({ pendingDying: null, pendingDeath: { id: newPendingId("death") } });
      } else if (!get().pendingDying && !get().pendingDeath) {
        set({ pendingDying: { id: newPendingId("dying") } });
      }
      return;
    }

    // The player has fallen — but per 5e RAW, they're not dead yet. Enter the
    // death-save loop. Combat/check/reaction UI is suppressed; pendingDying
    // surfaces the death-save card on each turn.
    if (droppingToZero && !state.pendingDeath && !state.pendingDying) {
      const encounter = state.encounter;
      if (encounter) {
        await db.encounters.update(encounter.id, {
          mode: "exploration",
          updatedAt: Date.now(),
        });
      }
      set({
        encounter: null,
        pendingCheck: null,
        pendingSave: null,
        pendingReaction: null,
        pendingConcentration: null,
        concentrationQueue: [],
        actionEconomy: { action: false, bonus: false },
        turnNonce: get().turnNonce + 1,
        pendingDying: { id: newPendingId("dying") },
      });
    }
  },

  consumeHpFx(id) {
    set((s) => ({ hpFx: s.hpFx.filter((f) => f.id !== id) }));
  },

  async startEncounter(entries) {
    const { campaignId } = get();
    if (!campaignId) return;
    // A finished (or replaced) fight must not stay "combat" in the DB, or the
    // next loadCampaign would resurrect it next to the new one.
    await db.encounters
      .where("campaignId")
      .equals(campaignId)
      .filter((e) => e.mode === "combat")
      .modify({ mode: "exploration", updatedAt: Date.now() });
    const sorted = [...entries].sort((a, b) => b.initiative - a.initiative);
    const encounter: EncounterState = {
      id: `enc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      campaignId,
      mode: "combat",
      round: 1,
      turnIndex: 0,
      initiative: sorted,
      updatedAt: Date.now(),
    };
    await db.encounters.put(encounter);
    set({
      encounter,
      actionEconomy: { action: false, bonus: false },
      turnNonce: get().turnNonce + 1,
    });
  },

  async endEncounter() {
    const { encounter } = get();
    if (encounter) {
      await db.encounters.update(encounter.id, {
        mode: "exploration",
        updatedAt: Date.now(),
      });
    }
    // Round-based condition timers stop meaning anything once combat ends.
    // (Read the character after the write above: it may have changed.)
    const character = get().character;
    let settled: Character | null = null;
    if (encounter && character) {
      const next = settleCombatTimers(character);
      if (next !== character) {
        settled = next;
        await db.characters.put(next);
      }
    }
    set({
      ...(settled ? { character: settled } : {}),
      encounter: null,
      pendingReaction: null,
      actionEconomy: { action: false, bonus: false },
      turnNonce: get().turnNonce + 1,
    });
  },

  async damageCombatant(id, amount) {
    const { encounter } = get();
    if (!encounter) return;
    const next: EncounterState = {
      ...encounter,
      initiative: encounter.initiative.map((e) =>
        e.id === id
          ? { ...e, hp: { ...e.hp, current: Math.max(0, e.hp.current - amount) } }
          : e,
      ),
      updatedAt: Date.now(),
    };
    await db.encounters.put(next);
    set({ encounter: next });

    // Auto-end combat when every non-player combatant is at 0 HP. The DM is
    // supposed to emit [ENDCOMBAT] but routinely forgets and keeps narrating
    // dead enemies' turns. This is the load-bearing guarantee.
    const enemies = next.initiative.filter((e) => e.kind !== "pc");
    if (enemies.length > 0 && enemies.every((e) => e.hp.current === 0)) {
      await get().endEncounter();
    }
  },

  async healCombatant(id, amount) {
    const { encounter } = get();
    if (!encounter) return;
    const next: EncounterState = {
      ...encounter,
      initiative: encounter.initiative.map((e) =>
        e.id === id
          ? {
              ...e,
              hp: { ...e.hp, current: Math.min(e.hp.max, e.hp.current + amount) },
            }
          : e,
      ),
      updatedAt: Date.now(),
    };
    await db.encounters.put(next);
    set({ encounter: next });
  },

  reset() {
    liveTurn?.controller.abort();
    liveTurn = null;
    set({ ...initial });
  },
}));
