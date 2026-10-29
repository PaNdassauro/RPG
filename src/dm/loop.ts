/**
 * The DM turn orchestrator. Picks a real provider when the user has
 * configured a key for it; otherwise falls back to the templated stub so
 * the play screen is always alive.
 */
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { getWorld, type CampaignSetting } from "@/data/settings";
import { assemblePrompt } from "@/ai/promptAssembly";
import { createProviderFromRecord } from "@/ai/providers";
import type { LLMProvider, StreamEvent } from "@/ai/provider";
import { resolveDamage, resolveHealing, type DamageResolution } from "@/engine/combat";
import { armorClass, effectiveMaxHp } from "@/state/sheetDerived";
import { rollAttack } from "@/engine/dice";
import { getMonster } from "@/data/srd/lazy";
import { maybeSummarize } from "@/ai/summarizer";
import { t } from "@/i18n";
import { newId } from "@/lib/id";
import {
  parseDmMarkup,
  stripUnclosedMarkup,
  type ParsedAttack,
  type ParsedDamage,
  type ParsedHeal,
  type ParsedInitiative,
} from "@/lib/parseDmMarkup";
import type { Condition } from "@/schemas/character";
import type {
  ChatMessage,
  DiceRollRecord,
  InitiativeEntry,
} from "@/schemas/campaign";
import type { Character } from "@/schemas/character";
import { stubDmTurn } from "./stub";

interface RunDmTurnArgs {
  /** The player's input. Empty string means "open the scene". */
  playerInput: string;
  /** True on the very first DM turn for a campaign. */
  isFirstTurn: boolean;
}

type StreamDoneReason = Extract<StreamEvent, { kind: "done" }>["reason"];

/**
 * Run one DM turn. Turn ownership lives in the session store: `beginTurn`
 * aborts any turn still in flight and hands out the signal, so callers never
 * manage an AbortController. Everything below is dropped (no persistence, no
 * side effects) if the player switched campaign in the meantime.
 */
export async function runDmTurn(args: RunDmTurnArgs): Promise<void> {
  const session = useSessionStore.getState();
  const { campaign, character, messages } = session;
  if (!campaign || !character) return;

  const turn = session.beginTurn();
  if (!turn) return;
  const campaignId = turn.campaignId;
  // Live = still the current turn, in this campaign, not aborted.
  const live = () => useSessionStore.getState().isTurnCurrent(turn.id);
  const sameCampaign = () => useSessionStore.getState().campaignId === campaignId;

  const setting = getWorld();

  try {
    // Safety net: if the encounter is in a dead state (every enemy at 0 HP)
    // — e.g. the DM forgot to emit [ENDCOMBAT] last turn — close it before
    // assembling the next prompt, so the DM doesn't keep narrating corpses.
    const encounter = session.encounter;
    if (encounter && encounter.mode === "combat") {
      const enemies = encounter.initiative.filter((e) => e.kind !== "pc");
      if (enemies.length > 0 && enemies.every((e) => e.hp.current === 0)) {
        await session.endEncounter();
      }
    }
    if (!live()) return;

    // Round-advance is driven only by the DM's [ROUND] markup (handled in
    // applyMarkupSideEffects) — never by player input timing. This avoids the
    // per-PC-turn vs per-initiative-cycle bug from the previous heuristic.

    session.setThinking(true);
    session.setError(null);

    const provider = pickProvider();
    let started = false;
    let reason: StreamDoneReason = "stop";

    const events = provider
      ? streamFromProvider(provider, args, setting, character, campaign, messages, turn.signal)
      : streamFromStub(args, character);

    for await (const ev of events) {
      // Aborted, superseded by a newer turn, or the campaign changed: drop
      // the rest of the stream.
      if (!live()) return;
      if (ev.kind === "text" && ev.delta) {
        if (!started) {
          session.beginDraft();
          started = true;
        }
        session.appendDraft(ev.delta);
      } else if (ev.kind === "error") {
        session.setError(ev.message);
      } else if (ev.kind === "done") {
        reason = ev.reason;
        break;
      }
    }
    if (!live()) return;

    // A failed or cancelled stream leaves a half-sentence: never persist it
    // or let its markup act. (If the iterable simply ended without `done`,
    // treat it as a normal stop.)
    if (reason === "aborted" || reason === "error") {
      session.discardDraft();
      return;
    }
    if (reason === "refusal") {
      session.discardDraft();
      await persistMarkupWarning(campaignId, t("play.combat.warnRefused"));
      return;
    }

    // A max-token cut-off can end mid-block (`[ATTACK …` / `[INITIATIVE]{…`):
    // keep the prose, drop the unfinished block, and tell the player. Finished
    // replies get the same strip as a no-op safety net.
    const final = await session.finalizeDraft({
      campaignId,
      sanitize: stripUnclosedMarkup,
    });
    if (!sameCampaign()) return;
    if (reason === "length") {
      await persistMarkupWarning(campaignId, t("play.combat.warnTruncated"));
    }
    await applyMarkupSideEffects(final?.content ?? "", campaignId);
  } finally {
    // Only the live turn clears the busy flag; a superseded one must not
    // un-busy its successor.
    useSessionStore.getState().endTurn(turn.id);
  }
}

async function applyMarkupSideEffects(text: string, campaignId: string): Promise<void> {
  if (!text) return;
  const parsed = parseDmMarkup(text);
  const store = () => useSessionStore.getState();
  // Everything below awaits (SRD lazy-load, Dexie writes): bail the moment the
  // player has moved to another campaign, or the rest would land in it.
  const alive = () => store().campaignId === campaignId;
  const session = store();
  if (!alive() || !session.character) return;

  // INITIATIVE — start an encounter (and stamp the player's actual HP/AC if listed).
  if (parsed.initiative) {
    await startEncounterFromMarkup(parsed.initiative, session.character, campaignId);
    if (!alive()) return;
  }

  // ATTACK — roll d20 + to-hit vs the target's AC; on a hit roll damage
  // (doubling dice on a crit) and apply it. This is how enemies (and any
  // attack that should respect AC) deal damage — never bare [DAMAGE].
  for (const atk of parsed.attacks) {
    if (!alive()) return;
    await applyAttack(atk, campaignId);
  }

  // DAMAGE — resolve, append system dice roll, apply HP change with FX.
  // Auto-hit only: failed-save AoE, ongoing damage, falling, etc. Anything
  // that involves an attack roll should use [ATTACK] instead.
  for (const dmg of parsed.damages) {
    if (!alive()) return;
    await applyDamage(dmg, campaignId);
  }

  // HEAL — same, but gold.
  for (const heal of parsed.heals) {
    if (!alive()) return;
    await applyHeal(heal, campaignId);
  }
  if (!alive()) return;

  // ENDCOMBAT — close the active encounter.
  if (parsed.endCombat) {
    await store().endEncounter();
  }

  // PLACE / NPC — register codex entries (deduped by name).
  for (const place of parsed.places) {
    if (!alive()) return;
    await store().addPlace({ name: place.name, description: place.description });
  }
  for (const npc of parsed.npcs) {
    if (!alive()) return;
    await store().addNpc({
      name: npc.name,
      description: npc.description,
      kind: npc.kind,
    });
  }

  // QUEST — upsert by id (creates new, or updates title/objective/status).
  for (const quest of parsed.quests) {
    if (!alive()) return;
    await store().upsertQuest({
      id: quest.id,
      title: quest.title,
      objective: quest.objective,
      status: quest.status,
    });
  }
  if (!alive()) return;

  // While the player is dying (or dead) the death-save card owns the screen:
  // damage above could just have dropped them to 0, so re-read the state and
  // don't stack check/save/reaction prompts on top of it.
  const down = (): boolean => !!store().pendingDying || !!store().pendingDeath;

  // CHECK — pause the loop until the player rolls.
  if (parsed.checks.length > 0 && !down()) {
    const check = parsed.checks[0]!;
    store().setPendingCheck({
      id: newId(),
      skill: check.skill,
      dc: check.dc,
      mode: check.mode,
      reason: check.reason,
    });
  }

  // SAVE — pause the loop until the player rolls.
  if (parsed.saves.length > 0 && !down()) {
    const save = parsed.saves[0]!;
    store().setPendingSave({
      id: newId(),
      ability: save.ability,
      dc: save.dc,
      mode: save.mode,
      reason: save.reason,
    });
  }

  // XP — credit experience; auto-prompts level-up if a threshold crossed.
  for (const award of parsed.xpAwards) {
    if (!alive()) return;
    await store().awardXp(award.amount, award.reason);
  }

  // FACTION — register a faction (deduped by name).
  for (const f of parsed.factions) {
    if (!alive()) return;
    await store().upsertFaction({ name: f.name, description: f.description });
  }

  // REP — adjust reputation toward a known faction.
  for (const r of parsed.reps) {
    if (!alive()) return;
    await store().adjustReputation({
      factionKey: r.faction.toLowerCase().trim(),
      delta: r.delta,
    });
  }
  if (!alive()) return;

  // SHOP — open the shop overlay.
  if (parsed.shop) {
    store().openShop({
      vendorName: parsed.shop.vendorName,
      location: parsed.shop.location,
      offers: parsed.shop.offers,
      openedAt: Date.now(),
    });
  }

  // COMPANION — register/refresh a companion in the campaign roster.
  for (const comp of parsed.companions) {
    if (!alive()) return;
    await store().upsertCompanion({
      name: comp.name,
      kind: comp.kind,
      description: comp.description,
      hpMax: comp.hpMax,
      hpCurrent: comp.hpMax,
      ac: comp.ac,
      initiativeBonus: comp.initiativeBonus,
      ...(comp.attack ? { attack: comp.attack } : {}),
      active: true,
    });
  }

  // TRAVEL — consume rations + apply hunger consequences silently.
  for (const trip of parsed.travels) {
    if (!alive()) return;
    const args: { days: number; destination?: string } = { days: trip.days };
    if (trip.destination) args.destination = trip.destination;
    await store().travel(args);
  }
  if (!alive()) return;

  // REACTION — pause the loop until the player chooses use/pass.
  if (parsed.reactions.length > 0 && !down()) {
    const r = parsed.reactions[0]!;
    store().setPendingReaction({
      id: newId(),
      ability: r.ability,
      trigger: r.trigger,
      reason: r.reason,
    });
  }

  // LEVELUP — open the level-up modal. The store guards against combat/death
  // races so calling this during a bad moment is harmless.
  if (parsed.levelUp) {
    store().requestLevelUp({
      classId: parsed.levelUp.classId,
      narration: parsed.levelUp.narration,
    });
  }

  // DISPOSITION — nudge an NPC's personal warmth toward the player.
  for (const d of parsed.dispositions) {
    if (!alive()) return;
    await store().adjustNpcDisposition({ npc: d.npc, delta: d.delta });
  }

  // ROUND — DM explicitly closed a combat round. Decrement timers + bump.
  // Runs BEFORE [COND]: a message that ends a round and applies a fresh
  // condition means "from the next round on", so the new timer must not lose
  // a round to the decrement that happens in the same message.
  if (parsed.roundAdvance) {
    if (!alive()) return;
    await store().advanceCombatRound();
  }

  // COND — apply tracked condition timers to the player only (NPC condition
  // timers are out of scope for now; the DM still applies untracked condition
  // flags on enemies via initiative state). Non-player targets get warned.
  for (const c of parsed.conditions) {
    if (!alive()) return;
    if (c.target !== "player") {
      await persistMarkupWarning(
        campaignId,
        t("play.combat.warnNonPlayerCond", { id: c.target }),
      );
      continue;
    }
    await store().applyConditionTimer({
      index: c.index as Condition,
      rounds: c.rounds,
      ...(c.saveEnd ? { saveEnd: c.saveEnd } : {}),
      ...(c.source ? { source: c.source } : {}),
    });
  }

  // INSPIRE — DM awards inspiration. Idempotent: already-inspired is no-op.
  for (const _ of parsed.inspires) {
    void _;
    if (!alive()) return;
    await store().grantInspiration();
  }
  if (!alive()) return;

  // Fire-and-forget: extend the rolling summary if we've crossed the
  // threshold. Best-effort — failures are swallowed inside.
  void maybeSummarize();
}

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

/**
 * SRD resistance/immunity entries are freeform strings like "bludgeoning,
 * piercing, and slashing from nonmagical attacks". We can't model the
 * "nonmagical" qualifier, so we extract the bare damage-type tokens — a
 * faithful-enough approximation for the engine's typed-damage scaling.
 */
function extractDamageTypes(raw: string[] | undefined): string[] {
  if (!raw || raw.length === 0) return [];
  const joined = raw.join(" ").toLowerCase();
  return DAMAGE_TYPES.filter((t) => joined.includes(t));
}

/** Look up an SRD monster, treating a failed lazy-load as "not found". */
async function lookupMonster(srdRef: string | undefined) {
  if (!srdRef) return undefined;
  try {
    return await getMonster(srdRef);
  } catch (err) {
    console.error(`[loop] SRD monster lookup failed for "${srdRef}"`, err);
    return undefined;
  }
}

async function startEncounterFromMarkup(
  initiative: ParsedInitiative,
  character: Character,
  campaignId: string,
): Promise<void> {
  const session = useSessionStore.getState();
  const unstatted: string[] = [];
  const entries: InitiativeEntry[] = await Promise.all(
    initiative.entries.map(async (e): Promise<InitiativeEntry> => {
      const isPlayer = e.kind === "pc";
      if (isPlayer) {
        return {
          id: e.id,
          kind: e.kind,
          name: character.name,
          initiative: e.initiative,
          hp: { max: character.hp.max, current: character.hp.current },
          // Derived from the equipped gear — the stored `ac` is only the
          // unarmored figure from character creation.
          ac: armorClass(character).value,
          conditions: [],
          range: "close" as const,
          hidden: false,
          resistances: [],
          vulnerabilities: [],
          immunities: [],
        };
      }
      // Ground monster stats from the SRD when the DM tagged an srdRef, so
      // HP/AC are canonical and resistances/immunities are actually populated
      // (which is what makes the typed-damage scaling meaningful for NPCs).
      // An srdRef that doesn't resolve falls back to the DM's own numbers.
      const srd = await lookupMonster(e.srdRef);
      let hpMax: number;
      let ac: number;
      if (srd) {
        hpMax = srd.hit_points;
        ac = srd.armor_class[0]?.value ?? e.ac ?? 10;
      } else {
        if (e.hpMax === null || e.ac === null) unstatted.push(e.name);
        hpMax = e.hpMax ?? 10;
        ac = e.ac ?? 10;
      }
      return {
        id: e.id,
        kind: e.kind,
        name: e.name,
        initiative: e.initiative,
        hp: { max: hpMax, current: hpMax },
        ac,
        conditions: [],
        range: "near" as const,
        hidden: false,
        resistances: srd ? extractDamageTypes(srd.damage_resistances) : [],
        vulnerabilities: srd ? extractDamageTypes(srd.damage_vulnerabilities) : [],
        immunities: srd ? extractDamageTypes(srd.damage_immunities) : [],
        ...(e.srdRef ? { srdRef: e.srdRef } : {}),
      };
    }),
  );
  // The lazy-load above can outlast a campaign switch.
  if (useSessionStore.getState().campaignId !== campaignId) return;
  for (const name of unstatted) {
    await persistMarkupWarning(campaignId, t("play.combat.warnNoStats", { name }));
  }
  // Pull in active companions automatically so they don't need to be listed
  // in every [INITIATIVE] block.
  const campaign = session.campaign;
  const companions = (campaign?.companions ?? []).filter((c) => c.active);
  for (const c of companions) {
    entries.push({
      id: `companion-${c.id}`,
      kind: "companion",
      name: c.name,
      initiative: Math.max(1, c.initiativeBonus + 10),
      hp: { max: c.hpMax, current: c.hpCurrent },
      ac: c.ac,
      conditions: [],
      range: "close",
      hidden: false,
      resistances: [],
      vulnerabilities: [],
      immunities: [],
    });
  }
  await session.startEncounter(entries);
}

async function applyDamage(dmg: ParsedDamage, campaignId: string): Promise<void> {
  const session = useSessionStore.getState();
  if (dmg.target !== "player") {
    // Non-player target — validate against the active encounter so we don't
    // silently apply damage to a hallucinated combatant id. If the id isn't
    // in the initiative list, log a system warning and skip.
    const encounter = session.encounter;
    const targetEntry = encounter?.initiative.find((e) => e.id === dmg.target);
    if (!targetEntry) {
      await persistMarkupWarning(
        campaignId,
        t("play.combat.warnUnknownTarget", { id: dmg.target }),
      );
      return;
    }
    try {
      // Honor the combatant's own resistances/vulnerabilities/immunities so
      // DM-narrated (AoE, environmental, companion) damage scales like the
      // player's direct attacks do.
      const result = resolveDamage(
        {
          hp: { max: 999, current: 999, temp: 0 },
          resistances: targetEntry.resistances,
          vulnerabilities: targetEntry.vulnerabilities,
          immunities: targetEntry.immunities,
        },
        dmg.expression,
        dmg.damageType,
      );
      await session.damageCombatant(dmg.target, result.amount);
      await persistDamageMessage({
        campaignId,
        target: dmg.target,
        dmg,
        amount: result.amount,
        rawAmount: result.rawAmount,
        scale: result.scale,
        result: result.result,
      });
    } catch {
      // bad expression — drop silently.
    }
    return;
  }
  const character = session.character;
  if (!character) return;
  let resolution;
  try {
    resolution = resolveDamage(character, dmg.expression, dmg.damageType);
  } catch {
    return;
  }
  await session.applyHpChange(resolution.newHp, {
    kind: "damage",
    amount: damageFxAmount(character, resolution),
    damageType: dmg.damageType,
  });
  await persistDamageMessage({
    campaignId,
    target: "player",
    dmg,
    amount: resolution.amount,
    rawAmount: resolution.rawAmount,
    scale: resolution.scale,
    result: resolution.result,
  });
  // Concentration save: if the player was concentrating and just took damage,
  // open a CON save. DC = max(10, floor(damage/2)). Failure or breaking by
  // the player ends concentration via the engine.
  const taken = resolution.appliedToHp + resolution.absorbedByTemp;
  if (taken > 0 && character.concentration) {
    await session.requestConcentrationSave(taken);
  }
}

/**
 * Amount shown on the HP bar (and used to detect "took damage"). At 0 HP the
 * bar can't drop further, so report what got past temp HP instead — the store
 * turns that into a failed death save.
 */
function damageFxAmount(before: Character, r: DamageResolution): number {
  return before.hp.current === 0 ? r.amount - r.absorbedByTemp : r.appliedToHp + r.absorbedByTemp;
}

async function applyAttack(atk: ParsedAttack, campaignId: string): Promise<void> {
  const session = useSessionStore.getState();

  if (atk.target === "player") {
    const character = session.character;
    if (!character) return;
    // Armor class from the equipped gear, not the stale creation-time `ac`.
    const ac = armorClass(character).value;
    const roll = rollAttack({
      bonus: atk.toHit,
      targetAC: ac,
      ...(atk.mode ? { mode: atk.mode } : {}),
    });
    await persistAttackMessage({ campaignId, target: "player", ac, roll });
    if (!roll.hit) return;

    let resolution;
    try {
      resolution = resolveDamage(character, atk.damage, atk.damageType, {
        crit: roll.crit,
      });
    } catch {
      return;
    }
    await session.applyHpChange(
      resolution.newHp,
      {
        kind: "damage",
        amount: damageFxAmount(character, resolution),
        damageType: atk.damageType,
      },
      // A crit on a downed target is two failed death saves.
      { crit: roll.crit },
    );
    await persistDamageMessage({
      campaignId,
      target: "player",
      dmg: {
        target: "player",
        expression: atk.damage,
        damageType: atk.damageType,
        reason: atk.reason,
      },
      amount: resolution.amount,
      rawAmount: resolution.rawAmount,
      scale: resolution.scale,
      result: resolution.result,
    });
    const taken = resolution.appliedToHp + resolution.absorbedByTemp;
    if (taken > 0 && character.concentration) {
      await session.requestConcentrationSave(taken);
    }
    return;
  }

  // Non-player target — must be a known combatant in the active encounter.
  const encounter = session.encounter;
  const targetEntry = encounter?.initiative.find((e) => e.id === atk.target);
  if (!targetEntry) {
    await persistMarkupWarning(
      campaignId,
      t("play.combat.warnUnknownTarget", { id: atk.target }),
    );
    return;
  }
  const roll = rollAttack({
    bonus: atk.toHit,
    targetAC: targetEntry.ac,
    ...(atk.mode ? { mode: atk.mode } : {}),
  });
  await persistAttackMessage({ campaignId, target: atk.target, ac: targetEntry.ac, roll });
  if (!roll.hit) return;

  let resolution;
  try {
    resolution = resolveDamage(
      {
        hp: { max: 9999, current: 9999, temp: 0 },
        resistances: targetEntry.resistances,
        vulnerabilities: targetEntry.vulnerabilities,
        immunities: targetEntry.immunities,
      },
      atk.damage,
      atk.damageType,
      { crit: roll.crit },
    );
  } catch {
    return;
  }
  await session.damageCombatant(atk.target, resolution.amount);
  await persistDamageMessage({
    campaignId,
    target: atk.target,
    dmg: {
      target: atk.target,
      expression: atk.damage,
      damageType: atk.damageType,
      reason: atk.reason,
    },
    amount: resolution.amount,
    rawAmount: resolution.rawAmount,
    scale: resolution.scale,
    result: resolution.result,
  });
}

async function applyHeal(heal: ParsedHeal, campaignId: string): Promise<void> {
  const session = useSessionStore.getState();
  if (heal.target !== "player") {
    const encounter = session.encounter;
    const known =
      !!encounter && encounter.initiative.some((e) => e.id === heal.target);
    if (!known) {
      await persistMarkupWarning(
        campaignId,
        t("play.combat.warnUnknownTarget", { id: heal.target }),
      );
      return;
    }
    try {
      const result = resolveHealing({ hp: { max: 9999, current: 0, temp: 0 } }, heal.expression);
      await session.healCombatant(heal.target, result.rolled);
      await persistHealMessage({ campaignId, target: heal.target, heal, amount: result.rolled, result: result.result });
    } catch {
      // bad expression — drop silently.
    }
    return;
  }
  const character = session.character;
  if (!character) return;
  let resolution;
  try {
    resolution = resolveHealing(character, heal.expression, effectiveMaxHp(character));
  } catch {
    return;
  }
  await session.applyHpChange(resolution.newHp, {
    kind: "heal",
    amount: resolution.applied,
  });
  await persistHealMessage({
    campaignId,
    target: "player",
    heal,
    amount: resolution.applied,
    result: resolution.result,
  });
}

async function persistDamageMessage(args: {
  campaignId: string;
  target: string;
  dmg: ParsedDamage;
  amount: number;
  rawAmount: number;
  scale: import("@/engine/combat").DamageScale;
  result: import("@/engine/types").DiceRollResult;
}): Promise<void> {
  const session = useSessionStore.getState();
  const ts = Date.now();
  const rollRecord: DiceRollRecord = {
    id: newId(),
    expression: args.result.expression,
    mode: null,
    rolls: args.result.rolls,
    kept: args.result.kept,
    modifier: args.result.modifier,
    total: args.result.total,
    isCritical: false,
    isFumble: false,
    purpose: `damage:${args.dmg.damageType}`,
    dc: null,
    ts,
  };
  const targetLabel = args.target === "player" ? t("play.combat.youLabel") : args.target;
  const baseContent = t("play.combat.damageMessage", {
    target: targetLabel,
    amount: args.amount,
    type: args.dmg.damageType,
  });
  const scaleNote =
    args.scale === "resisted"
      ? ` ${t("play.combat.scale.resisted", { raw: args.rawAmount, type: args.dmg.damageType })}`
      : args.scale === "vulnerable"
        ? ` ${t("play.combat.scale.vulnerable", { raw: args.rawAmount, type: args.dmg.damageType })}`
        : args.scale === "immune"
          ? ` ${t("play.combat.scale.immune", { type: args.dmg.damageType })}`
          : "";
  const sysMsg: ChatMessage = {
    id: newId(),
    campaignId: args.campaignId,
    role: "system",
    content: baseContent + scaleNote,
    toolCallIds: [],
    diceRollIds: [rollRecord.id],
    ts,
  };
  await session.appendDiceRoll(sysMsg, rollRecord);
}

async function persistAttackMessage(args: {
  campaignId: string;
  target: string;
  ac: number;
  roll: import("@/engine/types").AttackRollResult;
}): Promise<void> {
  const session = useSessionStore.getState();
  const ts = Date.now();
  const r = args.roll.attack;
  const rollRecord: DiceRollRecord = {
    id: newId(),
    expression: r.expression,
    mode: r.mode,
    rolls: r.rolls,
    kept: r.kept,
    modifier: r.modifier,
    total: r.total,
    isCritical: args.roll.crit,
    isFumble: r.isFumble,
    purpose: "attack",
    dc: args.ac,
    ts,
  };
  const targetLabel =
    args.target === "player" ? t("play.combat.youLabel") : args.target;
  const key = args.roll.hit
    ? args.roll.crit
      ? "play.combat.attackCrit"
      : "play.combat.attackHit"
    : "play.combat.attackMiss";
  const content = t(key, { target: targetLabel, roll: r.total, ac: args.ac });
  const sysMsg: ChatMessage = {
    id: newId(),
    campaignId: args.campaignId,
    role: "system",
    content,
    toolCallIds: [],
    diceRollIds: [rollRecord.id],
    ts,
  };
  await session.appendDiceRoll(sysMsg, rollRecord);
}

/**
 * Emit a system-message log line when the DM emitted invalid markup. Keeps
 * the player informed without crashing the loop, and shows up in the roll log
 * so it's clear something fishy happened.
 */
async function persistMarkupWarning(
  campaignId: string,
  body: string,
): Promise<void> {
  const session = useSessionStore.getState();
  const ts = Date.now();
  const msg: ChatMessage = {
    id: newId(),
    campaignId,
    role: "system",
    content: `⚠ ${body}`,
    toolCallIds: [],
    diceRollIds: [],
    ts,
  };
  await session.appendMessage(msg);
}

async function persistHealMessage(args: {
  campaignId: string;
  target: string;
  heal: ParsedHeal;
  amount: number;
  result: import("@/engine/types").DiceRollResult;
}): Promise<void> {
  const session = useSessionStore.getState();
  const ts = Date.now();
  const rollRecord: DiceRollRecord = {
    id: newId(),
    expression: args.result.expression,
    mode: null,
    rolls: args.result.rolls,
    kept: args.result.kept,
    modifier: args.result.modifier,
    total: args.result.total,
    isCritical: false,
    isFumble: false,
    purpose: "heal",
    dc: null,
    ts,
  };
  const targetLabel = args.target === "player" ? t("play.combat.youLabel") : args.target;
  const sysMsg: ChatMessage = {
    id: newId(),
    campaignId: args.campaignId,
    role: "system",
    content: t("play.combat.healMessage", {
      target: targetLabel,
      amount: args.amount,
    }),
    toolCallIds: [],
    diceRollIds: [rollRecord.id],
    ts,
  };
  await session.appendDiceRoll(sysMsg, rollRecord);
}

function pickProvider(): LLMProvider | null {
  const keys = useKeysStore.getState();
  const active = keys.activeProvider;
  if (!active) return null;
  const record = keys.records[active];
  if (!record) return null;
  return createProviderFromRecord(record);
}

async function* streamFromProvider(
  provider: LLMProvider,
  args: RunDmTurnArgs,
  setting: CampaignSetting,
  character: NonNullable<ReturnType<typeof useSessionStore.getState>["character"]>,
  campaign: NonNullable<ReturnType<typeof useSessionStore.getState>["campaign"]>,
  history: ReturnType<typeof useSessionStore.getState>["messages"],
  signal: AbortSignal,
): AsyncIterable<StreamEvent> {
  const encounter = useSessionStore.getState().encounter;
  const { system, messages } = assemblePrompt({
    setting,
    character,
    campaign,
    history,
    encounter,
    pendingPlayerInput: args.isFirstTurn ? "" : args.playerInput,
  });

  yield* provider.streamCompletion({
    system,
    messages,
    tools: [],
    signal,
  });
}

async function* streamFromStub(
  args: RunDmTurnArgs,
  character: NonNullable<ReturnType<typeof useSessionStore.getState>["character"]>,
): AsyncIterable<StreamEvent> {
  for await (const ev of stubDmTurn({
    character,
    playerInput: args.playerInput,
    isFirstTurn: args.isFirstTurn,
  })) {
    if (ev.kind === "text" && ev.delta) {
      yield { kind: "text", delta: ev.delta };
    } else if (ev.kind === "done") {
      yield { kind: "done", reason: "stop" };
    }
  }
}
