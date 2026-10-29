/**
 * The DM turn orchestrator. Picks a real provider when the user has
 * configured a key for it; otherwise falls back to the templated stub so
 * the play screen is always alive.
 */
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { getWorld, type CampaignSetting } from "@/data/settings";
import { assemblePrompt } from "@/ai/promptAssembly";
import { createAnthropicProvider } from "@/ai/providers/anthropic";
import { createOpenAIProvider } from "@/ai/providers/openai";
import type { LLMProvider, StreamEvent } from "@/ai/provider";
import { resolveDamage, resolveHealing } from "@/engine/combat";
import { rollAttack } from "@/engine/dice";
import { getMonster } from "@/data/srd/lazy";
import { maybeSummarize } from "@/ai/summarizer";
import { t } from "@/i18n";
import { newId } from "@/lib/id";
import {
  parseDmMarkup,
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
  signal?: AbortSignal;
}

export async function runDmTurn(args: RunDmTurnArgs): Promise<void> {
  const session = useSessionStore.getState();
  const { campaign, character, messages } = session;
  if (!campaign || !character) return;

  const setting = getWorld();

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

  // Round-advance is driven only by the DM's [ROUND] markup (handled in
  // applyMarkupSideEffects) — never by player input timing. This avoids the
  // per-PC-turn vs per-initiative-cycle bug from the previous heuristic.

  session.setThinking(true);
  session.setError(null);

  try {
    const provider = pickProvider();
    let started = false;

    const events = provider
      ? streamFromProvider(provider, args, setting, character, campaign, messages)
      : streamFromStub(args, character);

    for await (const ev of events) {
      if (ev.kind === "text" && ev.delta) {
        if (!started) {
          session.beginDraft();
          started = true;
        }
        session.appendDraft(ev.delta);
      } else if (ev.kind === "error") {
        session.setError(ev.message);
      } else if (ev.kind === "done") {
        const final = await session.finalizeDraft();
        await applyMarkupSideEffects(final?.content ?? "");
        return;
      }
    }
    // If the iterable ended without a `done` event, finalize anyway.
    const final = await session.finalizeDraft();
    await applyMarkupSideEffects(final?.content ?? "");
  } finally {
    session.setThinking(false);
  }
}

async function applyMarkupSideEffects(text: string): Promise<void> {
  if (!text) return;
  const parsed = parseDmMarkup(text);
  const session = useSessionStore.getState();
  const { campaignId, character } = session;
  if (!campaignId || !character) return;

  // INITIATIVE — start an encounter (and stamp the player's actual HP/AC if listed).
  if (parsed.initiative) {
    await startEncounterFromMarkup(parsed.initiative, character);
  }

  // ATTACK — roll d20 + to-hit vs the target's AC; on a hit roll damage
  // (doubling dice on a crit) and apply it. This is how enemies (and any
  // attack that should respect AC) deal damage — never bare [DAMAGE].
  for (const atk of parsed.attacks) {
    await applyAttack(atk, campaignId);
  }

  // DAMAGE — resolve, append system dice roll, apply HP change with FX.
  // Auto-hit only: failed-save AoE, ongoing damage, falling, etc. Anything
  // that involves an attack roll should use [ATTACK] instead.
  for (const dmg of parsed.damages) {
    await applyDamage(dmg, campaignId);
  }

  // HEAL — same, but gold.
  for (const heal of parsed.heals) {
    await applyHeal(heal, campaignId);
  }

  // ENDCOMBAT — close the active encounter.
  if (parsed.endCombat) {
    await session.endEncounter();
  }

  // PLACE / NPC — register codex entries (deduped by name).
  for (const place of parsed.places) {
    await session.addPlace({ name: place.name, description: place.description });
  }
  for (const npc of parsed.npcs) {
    await session.addNpc({
      name: npc.name,
      description: npc.description,
      kind: npc.kind,
    });
  }

  // QUEST — upsert by id (creates new, or updates title/objective/status).
  for (const quest of parsed.quests) {
    await session.upsertQuest({
      id: quest.id,
      title: quest.title,
      objective: quest.objective,
      status: quest.status,
    });
  }

  // CHECK — pause the loop until the player rolls.
  if (parsed.checks.length > 0) {
    const check = parsed.checks[0]!;
    session.setPendingCheck({
      id: newId(),
      skill: check.skill,
      dc: check.dc,
      mode: check.mode,
      reason: check.reason,
    });
  }

  // SAVE — pause the loop until the player rolls.
  if (parsed.saves.length > 0) {
    const save = parsed.saves[0]!;
    session.setPendingSave({
      id: newId(),
      ability: save.ability,
      dc: save.dc,
      mode: save.mode,
      reason: save.reason,
    });
  }

  // XP — credit experience; auto-prompts level-up if a threshold crossed.
  for (const award of parsed.xpAwards) {
    await session.awardXp(award.amount, award.reason);
  }

  // FACTION — register a faction (deduped by name).
  for (const f of parsed.factions) {
    await session.upsertFaction({ name: f.name, description: f.description });
  }

  // REP — adjust reputation toward a known faction.
  for (const r of parsed.reps) {
    await session.adjustReputation({
      factionKey: r.faction.toLowerCase().trim(),
      delta: r.delta,
    });
  }

  // SHOP — open the shop overlay.
  if (parsed.shop) {
    session.openShop({
      vendorName: parsed.shop.vendorName,
      location: parsed.shop.location,
      offers: parsed.shop.offers,
      openedAt: Date.now(),
    });
  }

  // COMPANION — register/refresh a companion in the campaign roster.
  for (const comp of parsed.companions) {
    await session.upsertCompanion({
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
    const args: { days: number; destination?: string } = { days: trip.days };
    if (trip.destination) args.destination = trip.destination;
    await session.travel(args);
  }

  // REACTION — pause the loop until the player chooses use/pass.
  if (parsed.reactions.length > 0) {
    const r = parsed.reactions[0]!;
    session.setPendingReaction({
      id: newId(),
      ability: r.ability,
      trigger: r.trigger,
      reason: r.reason,
    });
  }

  // LEVELUP — open the level-up modal. The store guards against combat/death
  // races so calling this during a bad moment is harmless.
  if (parsed.levelUp) {
    session.requestLevelUp({
      classId: parsed.levelUp.classId,
      narration: parsed.levelUp.narration,
    });
  }

  // DISPOSITION — nudge an NPC's personal warmth toward the player.
  for (const d of parsed.dispositions) {
    await session.adjustNpcDisposition({ npc: d.npc, delta: d.delta });
  }

  // COND — apply tracked condition timers to the player only (NPC condition
  // timers are out of scope for now; the DM still applies untracked condition
  // flags on enemies via initiative state). Non-player targets get warned.
  for (const c of parsed.conditions) {
    if (c.target !== "player") {
      await persistMarkupWarning(
        campaignId,
        t("play.combat.warnNonPlayerCond", { id: c.target }),
      );
      continue;
    }
    await session.applyConditionTimer({
      index: c.index as Condition,
      rounds: c.rounds,
      ...(c.saveEnd ? { saveEnd: c.saveEnd } : {}),
      ...(c.source ? { source: c.source } : {}),
    });
  }

  // ROUND — DM explicitly closed a combat round. Decrement timers + bump.
  if (parsed.roundAdvance) {
    await session.advanceCombatRound();
  }

  // INSPIRE — DM awards inspiration. Idempotent: already-inspired is no-op.
  for (const _ of parsed.inspires) {
    void _;
    await session.grantInspiration();
  }

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

async function startEncounterFromMarkup(
  initiative: ParsedInitiative,
  character: Character,
): Promise<void> {
  const session = useSessionStore.getState();
  const entries: InitiativeEntry[] = await Promise.all(
    initiative.entries.map(async (e) => {
      const isPlayer = e.kind === "pc";
      if (isPlayer) {
        return {
          id: e.id,
          kind: e.kind,
          name: character.name,
          initiative: e.initiative,
          hp: { max: character.hp.max, current: character.hp.current },
          ac: character.ac,
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
      const srd = e.srdRef ? await getMonster(e.srdRef) : undefined;
      const hpMax = srd ? srd.hit_points : e.hpMax;
      const ac = srd ? srd.armor_class[0]?.value ?? e.ac : e.ac;
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
    amount: resolution.appliedToHp + resolution.absorbedByTemp,
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

async function applyAttack(atk: ParsedAttack, campaignId: string): Promise<void> {
  const session = useSessionStore.getState();

  if (atk.target === "player") {
    const character = session.character;
    if (!character) return;
    const roll = rollAttack({
      bonus: atk.toHit,
      targetAC: character.ac,
      ...(atk.mode ? { mode: atk.mode } : {}),
    });
    await persistAttackMessage({ campaignId, target: "player", ac: character.ac, roll });
    if (!roll.hit) return;

    let resolution;
    try {
      resolution = resolveDamage(character, atk.damage, atk.damageType, {
        crit: roll.crit,
      });
    } catch {
      return;
    }
    await session.applyHpChange(resolution.newHp, {
      kind: "damage",
      amount: resolution.appliedToHp + resolution.absorbedByTemp,
      damageType: atk.damageType,
    });
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
    resolution = resolveHealing(character, heal.expression);
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

  if (record.providerId === "claude") {
    return createAnthropicProvider({
      apiKey: record.key,
      model: record.model,
    });
  }
  if (record.providerId === "openai") {
    return createOpenAIProvider({
      apiKey: record.key,
      model: record.model,
      ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
    });
  }
  // Gemini / Ollama land in a follow-up slice.
  return null;
}

async function* streamFromProvider(
  provider: LLMProvider,
  args: RunDmTurnArgs,
  setting: CampaignSetting,
  character: NonNullable<ReturnType<typeof useSessionStore.getState>["character"]>,
  campaign: NonNullable<ReturnType<typeof useSessionStore.getState>["campaign"]>,
  history: ReturnType<typeof useSessionStore.getState>["messages"],
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
    ...(args.signal ? { signal: args.signal } : {}),
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
