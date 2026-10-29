/**
 * Quick-action panel: attacks, spell slots, potions, rests.
 * Always available outside the death/twist overlay.
 */
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  BedDouble,
  Bed,
  FlaskRound,
  Flame,
  Heart,
  Sparkles,
  Sword,
  ChevronDown,
  Zap,
} from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { attacks, attacksPerAction, spellcasting } from "@/state/sheetDerived";
import { rollAttack, rollDamage, rollExpression } from "@/engine/dice";
import { applyConditionsToRoll } from "@/engine/conditions";
import { isPotionItem } from "@/engine/inventory";
import {
  divineSmiteExpression,
  paladinCanSmite,
  rageDamageBonus,
  sneakAttackEligible,
} from "@/engine/classFeatures";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import type { UsageCounter } from "@/schemas/character";
import { cn } from "@/lib/cn";

type Panel = "attacks" | "spells" | "potions" | "powers" | "rest" | null;

interface ActionPanelProps {
  /** Opens the CharacterSheet pre-focused on a specific tab. */
  onOpenSheet?: (tab: "spells" | "summary") => void;
}

export function ActionPanel({ onOpenSheet }: ActionPanelProps = {}) {
  const t = useT();
  const character = useSessionStore((s) => s.character);
  const encounter = useSessionStore((s) => s.encounter);
  const [open, setOpen] = useState<Panel>(null);
  if (!character) return null;
  const hasSpells = !!spellcasting(character);
  const hasPowers = character.usageCounters.length > 0;
  const potionsAvailable = character.inventory.some((i) =>
    isPotionItem(i.name, i.srdRef),
  );

  return (
    <aside className="flex flex-col gap-2 rounded-md border border-line bg-surface/40 p-3 backdrop-blur">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={<Sword className="h-3.5 w-3.5" />}
          label={t("play.actionPanel.attacks")}
          active={open === "attacks"}
          onClick={() => setOpen(open === "attacks" ? null : "attacks")}
        />
        {hasSpells && (
          <Tile
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={t("play.actionPanel.spells")}
            active={open === "spells"}
            onClick={() => setOpen(open === "spells" ? null : "spells")}
          />
        )}
        {hasPowers && (
          <Tile
            icon={<Zap className="h-3.5 w-3.5" />}
            label={t("play.actionPanel.powers")}
            active={open === "powers"}
            onClick={() => setOpen(open === "powers" ? null : "powers")}
          />
        )}
        {potionsAvailable && (
          <Tile
            icon={<FlaskRound className="h-3.5 w-3.5" />}
            label={t("play.actionPanel.potions")}
            active={open === "potions"}
            onClick={() => setOpen(open === "potions" ? null : "potions")}
          />
        )}
        <Tile
          icon={<BedDouble className="h-3.5 w-3.5" />}
          label={t("play.actionPanel.rest")}
          active={open === "rest"}
          disabled={!!encounter}
          onClick={() => setOpen(open === "rest" ? null : "rest")}
        />
      </div>

      {open === "attacks" && <AttacksPanel />}
      {open === "spells" && hasSpells && <SpellsPanel onOpenSheet={onOpenSheet} />}
      {open === "powers" && hasPowers && <PowersPanel />}
      {open === "potions" && <PotionsPanel />}
      {open === "rest" && !encounter && <RestPanel />}
    </aside>
  );
}

function Tile({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-display text-[10px] uppercase tracking-[0.25em] transition",
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text",
        "disabled:cursor-not-allowed disabled:opacity-30",
      )}
    >
      {icon}
      {label}
      <ChevronDown
        className={cn("h-3 w-3 transition", active && "rotate-180")}
      />
    </button>
  );
}

function AttacksPanel() {
  const t = useT();
  const character = useSessionStore((s) => s.character);
  const campaignId = useSessionStore((s) => s.campaignId);
  const encounter = useSessionStore((s) => s.encounter);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);
  const damageCombatant = useSessionStore((s) => s.damageCombatant);
  const damageCombatantTyped = useSessionStore((s) => s.damageCombatantTyped);
  const spendSlot = useSessionStore((s) => s.spendSlot);
  const actionEconomy = useSessionStore((s) => s.actionEconomy);
  const consumeAction = useSessionStore((s) => s.consumeAction);
  const turnNonce = useSessionStore((s) => s.turnNonce);

  // Target selection: list of live, non-PC combatants.
  const liveTargets = (encounter?.initiative ?? []).filter(
    (e) => e.kind !== "pc" && e.hp.current > 0,
  );
  const [targetId, setTargetId] = useState<string | null>(null);

  // Multi-attack tracker: number of attacks remaining within the current
  // Attack action. Resets when the action chip is reset (new turn).
  const maxAttacks = character ? attacksPerAction(character) : 1;
  const [attacksLeft, setAttacksLeft] = useState<number>(maxAttacks);
  // Refill at every turn boundary (turnNonce bumps on turn reset / combat
  // start / combat end). Keying off turnNonce — not the action flag — is what
  // makes this fire even when a turn ends with attacks still unspent.
  useEffect(() => {
    setAttacksLeft(maxAttacks);
  }, [turnNonce, maxAttacks]);

  // Class-feature modifiers ready to be folded into the next attack.
  const sneakAttack = character ? sneakAttackEligible(character) : null;
  const [useSneak, setUseSneak] = useState(false);
  // Sneak Attack is once per turn — clear the spent flag at each turn boundary.
  const [hasSneakedThisTurn, setHasSneakedThisTurn] = useState(false);
  useEffect(() => {
    setHasSneakedThisTurn(false);
    setUseSneak(false);
  }, [turnNonce]);
  const canSmite = !!character && paladinCanSmite(character);
  const [smiteSlot, setSmiteSlot] = useState<0 | 1 | 2 | 3 | 4>(0);
  const isRaging = !!character?.raging;
  const rageBonus = character
    ? rageDamageBonus(character.classes.find((c) => c.classId === "barbarian")?.level ?? 0)
    : 0;

  useEffect(() => {
    // Auto-select the first live target if none chosen or current is gone.
    if (!liveTargets.length) {
      if (targetId !== null) setTargetId(null);
      return;
    }
    if (!targetId || !liveTargets.some((e) => e.id === targetId)) {
      setTargetId(liveTargets[0]!.id);
    }
  }, [encounter, liveTargets.map((e) => `${e.id}:${e.hp.current}`).join(","), liveTargets, targetId]);

  if (!character || !campaignId) return null;
  const list = attacks(character);
  if (list.length === 0) {
    return <Empty text={t("play.actionPanel.noAttacks")} />;
  }
  const target = encounter && targetId
    ? encounter.initiative.find((e) => e.id === targetId) ?? null
    : null;

  async function onAttack(id: string) {
    const atk = list.find((a) => a.id === id);
    if (!atk) return;
    if (!character || !campaignId) return;
    // Conditions apply mode (e.g. blinded/prone → disadvantage).
    const condMode = applyConditionsToRoll({
      conditions: character.conditions,
      kind: "attack",
    });
    // Use the active target's AC when combat is up; otherwise fall back to a
    // forgiving 10 so the player can still roll attacks in narrative scenes.
    const targetAC = target?.ac ?? 10;
    const attack = rollAttack({
      bonus: atk.toHit,
      targetAC,
      ...(condMode.mode ? { mode: condMode.mode } : {}),
    });
    // Rage adds flat damage on melee STR attacks (we approximate by checking
    // ability = "str"). Damage bonus = rageDamageBonus by barb level.
    const isMeleeStr = atk.range.kind === "melee" && atk.ability === "str";
    const rageAdd = isRaging && isMeleeStr ? rageBonus : 0;
    const baseMod = atk.damage.mod + rageAdd;
    const damageExpr = `${atk.damage.dice}${baseMod >= 0 ? "+" : ""}${baseMod}`;
    const damage = attack.hit ? rollDamage(damageExpr, { crit: attack.crit }) : null;
    // Sneak Attack: rogue once per turn on hit with advantage OR ally adj. We
    // trust the player's intent here (the toggle was checked before the click).
    let sneakDmg: ReturnType<typeof rollExpression> | null = null;
    if (
      sneakAttack?.hasFeature &&
      useSneak &&
      !hasSneakedThisTurn &&
      attack.hit &&
      sneakAttack.expression
    ) {
      // RAW: dice doubled on crit.
      const expr = attack.crit
        ? `${parseInt(sneakAttack.expression, 10) * 2}d6`
        : sneakAttack.expression;
      sneakDmg = rollExpression(expr);
    }
    // Divine Smite: paladin spends a chosen slot to add +Nd8 radiant on hit.
    let smiteDmg: ReturnType<typeof rollExpression> | null = null;
    let smiteSlotUsed: 0 | 1 | 2 | 3 | 4 = 0;
    if (canSmite && smiteSlot > 0 && attack.hit) {
      const ok = await spendSlot(smiteSlot as 1 | 2 | 3 | 4);
      if (ok) {
        const expr = divineSmiteExpression(smiteSlot);
        // Crit doubles dice for smite too.
        const finalExpr = attack.crit
          ? `${parseInt(expr, 10) * 2}d8`
          : expr;
        smiteDmg = rollExpression(finalExpr);
        smiteSlotUsed = smiteSlot;
      }
    }
    const sneakTotal = sneakDmg?.total ?? 0;
    const smiteTotal = smiteDmg?.total ?? 0;
    const grandTotalDamage = (damage?.total ?? 0) + sneakTotal + smiteTotal;

    const ts = Date.now();
    const rollRecord: DiceRollRecord = {
      id: newId(),
      expression: attack.attack.expression,
      mode: attack.attack.mode,
      rolls: attack.attack.rolls,
      kept: attack.attack.kept,
      modifier: attack.attack.modifier,
      total: attack.attack.total,
      isCritical: attack.crit,
      isFumble: !attack.crit && !attack.hit && attack.attack.kept[0]!.value === 1,
      purpose: `attack:${atk.name}${target ? `:${target.id}` : ""}`,
      dc: targetAC,
      ts,
    };
    const verdict = attack.crit
      ? t("play.actionPanel.crit")
      : attack.hit
        ? t("play.actionPanel.hit")
        : t("play.actionPanel.miss");
    // Extra-damage notes are appended after the base damage so the player can
    // see the breakdown without staring at math.
    const extraNotes: string[] = [];
    if (rageAdd > 0) extraNotes.push(`+${rageAdd} ${t("play.actionPanel.rageBonus")}`);
    if (sneakDmg) extraNotes.push(`+${sneakDmg.total} ${t("play.actionPanel.sneakAttack")}`);
    if (smiteDmg)
      extraNotes.push(
        `+${smiteDmg.total} ${t("play.actionPanel.divineSmite", { slot: smiteSlotUsed })}`,
      );
    const extras = extraNotes.length > 0 ? ` (${extraNotes.join(", ")})` : "";
    const content = target
      ? t("play.actionPanel.attackOnTargetMessage", {
          name: atk.name,
          target: target.name,
          ac: targetAC,
          toHit: attack.attack.total,
          verdict,
          damage: grandTotalDamage,
          type: atk.damage.type,
        }) + extras
      : t("play.actionPanel.attackMessage", {
          name: atk.name,
          toHit: attack.attack.total,
          verdict,
          damage: grandTotalDamage,
          type: atk.damage.type,
        }) + extras;
    const msg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content,
      toolCallIds: [],
      diceRollIds: [rollRecord.id],
      ts,
    };
    await appendDiceRoll(msg, rollRecord);
    // Apply damage to the live target — this is what makes the engine
    // authoritative on player attacks (the DM no longer has to remember).
    if (target && damage && attack.hit) {
      // Honor target's resistances/vulnerabilities/immunities. Sneak attack +
      // smite are folded into the same type for the base hit; smite damage is
      // technically radiant (different type) but we keep one type per attack
      // for simplicity — fanatic note acknowledged. Radiant resist is rare.
      const typed = await damageCombatantTyped(
        target.id,
        grandTotalDamage,
        atk.damage.type,
      );
      // Fall back if the typed call returned null (encounter ended mid-action).
      if (!typed) await damageCombatant(target.id, grandTotalDamage);
    }
    // Mark single-use-per-turn rogue sneak.
    if (sneakDmg) setHasSneakedThisTurn(true);
    // Reset smite slot picker so accidental re-clicks don't burn slots.
    setSmiteSlot(0);
    setUseSneak(false);
    // Multi-attack tracking: spend one of the action's attacks. When the
    // last one resolves, mark the Action chip consumed.
    if (encounter) {
      const remaining = Math.max(0, attacksLeft - 1);
      setAttacksLeft(remaining);
      if (remaining === 0 && !actionEconomy.action) {
        consumeAction("action");
      }
    }
  }

  const outOfAttacks = !!encounter && attacksLeft <= 0;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {encounter && liveTargets.length > 0 && (
        <TargetPicker
          targets={liveTargets.map((e) => ({ id: e.id, name: e.name, ac: e.ac, hp: e.hp }))}
          selectedId={targetId}
          onSelect={setTargetId}
        />
      )}
      {encounter && maxAttacks > 1 && (
        <div className="flex items-center justify-between rounded-sm border border-accent-muted/40 bg-accent/5 px-2 py-1 font-mono text-xs uppercase tracking-widest text-accent-muted">
          <span>{t("play.actionPanel.multiAttack")}</span>
          <span className="text-accent">
            {attacksLeft}/{maxAttacks}
          </span>
        </div>
      )}
      {isRaging && (
        <div className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-danger">
          {t("play.actionPanel.rageActive", { bonus: rageBonus })}
        </div>
      )}
      {sneakAttack?.hasFeature && encounter && sneakAttack.expression && (
        <label className="flex cursor-pointer items-center justify-between rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-xs uppercase tracking-widest text-accent">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useSneak}
              disabled={hasSneakedThisTurn}
              onChange={(e) => setUseSneak(e.target.checked)}
              className="h-3 w-3 accent-current"
            />
            {t("play.actionPanel.sneakAttackToggle", { expr: sneakAttack.expression })}
          </span>
          {hasSneakedThisTurn && (
            <span className="text-text-muted">{t("play.actionPanel.usedThisTurn")}</span>
          )}
        </label>
      )}
      {canSmite && encounter && (
        <div className="flex items-center justify-between rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-xs uppercase tracking-widest">
          <span className="text-accent">{t("play.actionPanel.smiteLabel")}</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSmiteSlot(lvl as 0 | 1 | 2 | 3 | 4)}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5",
                  smiteSlot === lvl
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-line bg-surface text-text-muted hover:border-accent-muted",
                )}
              >
                {lvl === 0 ? t("play.actionPanel.smiteOff") : `L${lvl}`}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onAttack(a.id)}
              disabled={outOfAttacks}
              className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-left transition hover:border-accent-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div>
                <p className="font-display text-sm text-text">{a.name}</p>
                <p className="font-mono text-xs text-text-muted">
                  {a.damage.dice}
                  {a.damage.mod >= 0 ? `+${a.damage.mod}` : a.damage.mod} {a.damage.type}
                </p>
              </div>
              <span className="font-mono text-sm text-accent">
                {a.toHit >= 0 ? `+${a.toHit}` : a.toHit}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TargetSummary {
  id: string;
  name: string;
  ac: number;
  hp: { current: number; max: number };
}

function TargetPicker({
  targets,
  selectedId,
  onSelect,
}: {
  targets: TargetSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5">
      <p className="mb-1 font-display text-[10px] uppercase tracking-[0.3em] text-danger/80">
        {t("play.actionPanel.target")}
      </p>
      <div className="flex flex-wrap gap-1">
        {targets.map((tgt) => {
          const active = tgt.id === selectedId;
          return (
            <button
              key={tgt.id}
              type="button"
              onClick={() => onSelect(tgt.id)}
              className={cn(
                "rounded-sm border px-2 py-0.5 font-mono text-xs transition",
                active
                  ? "border-danger bg-danger/15 text-danger"
                  : "border-line bg-surface text-text-muted hover:border-danger/40 hover:text-text",
              )}
            >
              {tgt.name}{" "}
              <span className="opacity-70">
                CA{tgt.ac} · {tgt.hp.current}/{tgt.hp.max}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpellsPanel({ onOpenSheet }: { onOpenSheet?: (tab: "spells" | "summary") => void }) {
  const t = useT();
  const character = useSessionStore((s) => s.character);
  const endConcentration = useSessionStore((s) => s.endConcentration);
  if (!character) return null;
  const slots = character.spellSlots;
  if (!slots) return <Empty text={t("play.actionPanel.noSlots")} />;
  const concentrating = character.concentration;
  const rows: { level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; max: number; used: number }[] = [];
  ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).forEach((n) => {
    const entry = slots[`l${n}` as const];
    if (entry.max > 0) rows.push({ level: n, max: entry.max, used: entry.used });
  });
  const hasKnown =
    (character.cantrips?.length ?? 0) + (character.spellsKnown?.length ?? 0) > 0;
  const cantripCount = character.cantrips?.length ?? 0;
  const knownCount = character.spellsKnown?.length ?? 0;
  // Side panel is now a thin teaser; the full grimoire is on the Magias tab
  // of the CharacterSheet drawer. Always offer a single "Abrir grimório"
  // affordance so the player never feels stuck in a tight side column.
  return (
    <div className="mt-1 flex flex-col gap-2">
      {concentrating && (
        <div className="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">
            {t("play.actionPanel.concentrationActive", { spell: concentrating.spellName })}
          </span>
          <button
            type="button"
            onClick={() => void endConcentration()}
            className="shrink-0 rounded-sm border border-accent/40 px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider transition hover:bg-accent/20"
          >
            {t("play.actionPanel.dropConcentration")}
          </button>
        </div>
      )}
      <div className="rounded-md border border-line bg-surface px-3 py-2">
        <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-text-muted">
          <span>{t("play.actionPanel.slotsLabel")}</span>
          {!hasKnown && (
            <span className="text-accent">{t("play.actionPanel.spellsEmptyTitle")}</span>
          )}
        </div>
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.level} className="flex items-center justify-between text-xs">
              <span className="font-mono text-text-muted">
                {t("play.actionPanel.slotLabel", { level: r.level })}
              </span>
              <div className="flex gap-0.5">
                {Array.from({ length: r.max }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2 w-2 rounded-full border",
                      i < r.max - r.used
                        ? "border-accent bg-accent"
                        : "border-line bg-transparent",
                    )}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        {hasKnown && (
          <p className="mt-2 font-mono text-xs text-text-muted/80">
            {t("play.actionPanel.knownSummary", {
              cantrips: cantripCount,
              spells: knownCount,
            })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpenSheet?.("spells")}
        className="rounded-md border border-accent bg-accent/15 px-3 py-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent transition hover:bg-accent/25"
      >
        <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5" />
        {hasKnown
          ? t("play.actionPanel.openSpellbook")
          : t("play.actionPanel.configureSpells")}
      </button>
    </div>
  );
}

function PotionsPanel() {
  const t = useT();
  const { character, drinkPotion } = useSessionStore(
    useShallow((s) => ({ character: s.character, drinkPotion: s.drinkPotion })),
  );
  if (!character) return null;
  const potions = character.inventory.filter((i) => isPotionItem(i.name, i.srdRef));
  if (potions.length === 0) return <Empty text={t("play.actionPanel.noPotions")} />;
  return (
    <ul className="mt-1 flex flex-col gap-1.5">
      {potions.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => drinkPotion(p.id)}
            className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-left transition hover:border-accent-muted"
          >
            <span className="font-display text-sm text-text">
              {p.name}{" "}
              {p.qty > 1 && (
                <span className="ml-1 font-mono text-xs text-text-muted">×{p.qty}</span>
              )}
            </span>
            <span className="font-mono text-xs uppercase tracking-widest text-accent">
              {t("play.actionPanel.drink")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RestPanel() {
  const t = useT();
  const { character, campaignId, longRest, shortRestSpendHitDie, shortRestFinalize, appendDiceRoll } =
    useSessionStore(
      useShallow((s) => ({
        character: s.character,
        campaignId: s.campaignId,
        longRest: s.longRest,
        shortRestSpendHitDie: s.shortRestSpendHitDie,
        shortRestFinalize: s.shortRestFinalize,
        appendDiceRoll: s.appendDiceRoll,
      })),
    );
  if (!character) return null;

  async function onSpendHitDie(classId: string, die: number) {
    if (!campaignId) return;
    const out = await shortRestSpendHitDie(classId);
    if (!out) return;
    // Persist the hit-die roll as a system message + DiceRollRecord so the
    // narration log shows the rolled face (not just a silent heal FX).
    const ts = Date.now();
    const rollRecord: DiceRollRecord = {
      id: newId(),
      expression: `1d${die}`,
      mode: null,
      rolls: [{ sides: die, value: out.rolled }],
      kept: [{ sides: die, value: out.rolled }],
      modifier: 0,
      total: out.rolled,
      isCritical: false,
      isFumble: false,
      purpose: "hitdie",
      dc: null,
      ts,
    };
    const msg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content: t("play.actionPanel.hitDieMessage", {
        die,
        rolled: out.rolled,
        healed: out.healed,
      }),
      toolCallIds: [],
      diceRollIds: [rollRecord.id],
      ts,
    };
    await appendDiceRoll(msg, rollRecord);
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.25em] text-text-muted">
          {t("play.actionPanel.shortRest")}
        </p>
        <p className="mt-0.5 text-xs text-text-muted/80">
          {t("play.actionPanel.shortRestHint")}
        </p>
        <ul className="mt-1 flex flex-col gap-1">
          {character.hitDice.map((hd) => (
            <li
              key={hd.classId}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-2.5 py-1"
            >
              <span className="font-mono text-xs text-text">
                d{hd.die}{" "}
                <span className="text-text-muted">
                  {hd.current}/{hd.max}
                </span>
              </span>
              <button
                type="button"
                disabled={hd.current <= 0}
                onClick={() => onSpendHitDie(hd.classId, hd.die)}
                className="rounded-sm border border-line bg-surface px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Bed className="mr-1 inline-block h-3 w-3" />
                {t("play.actionPanel.spendHd")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => shortRestFinalize()}
          className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-1.5 font-display text-[10px] uppercase tracking-widest text-text-muted transition hover:border-accent-muted hover:text-text"
        >
          {t("play.actionPanel.finishShortRest")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => longRest()}
        className="rounded-md border border-accent bg-accent/15 px-3 py-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent transition hover:bg-accent/25"
      >
        <BedDouble className="mr-1.5 inline-block h-3.5 w-3.5" />
        {t("play.actionPanel.longRest")}
      </button>
    </div>
  );
}

function PowersPanel() {
  const t = useT();
  const { character, campaignId, spendUsage, toggleRage, appendDiceRoll, applyHpChange } =
    useSessionStore(
      useShallow((s) => ({
        character: s.character,
        campaignId: s.campaignId,
        spendUsage: s.spendUsage,
        toggleRage: s.toggleRage,
        appendDiceRoll: s.appendDiceRoll,
        applyHpChange: s.applyHpChange,
      })),
    );
  if (!character) return null;
  const counters = character.usageCounters;

  // Quick action: Second Wind rolls 1d10+lvl healing, spends the charge.
  async function fireSecondWind() {
    if (!character || !campaignId) return;
    const fighterLvl =
      character.classes.find((c) => c.classId === "fighter")?.level ?? 0;
    if (fighterLvl < 1) return;
    const ok = await spendUsage("second-wind");
    if (!ok) return;
    const roll = rollExpression(`1d10+${fighterLvl}`);
    const healed = Math.min(character.hp.max - character.hp.current, roll.total);
    await applyHpChange(
      { ...character.hp, current: character.hp.current + healed },
      { kind: "heal", amount: healed },
    );
    const ts = Date.now();
    const rec: DiceRollRecord = {
      id: newId(),
      expression: roll.expression,
      mode: null,
      rolls: roll.rolls,
      kept: roll.kept,
      modifier: roll.modifier,
      total: roll.total,
      isCritical: false,
      isFumble: false,
      purpose: "second-wind",
      dc: null,
      ts,
    };
    const msg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content: t("play.actionPanel.secondWindMessage", { healed, rolled: roll.total }),
      toolCallIds: [],
      diceRollIds: [rec.id],
      ts,
    };
    await appendDiceRoll(msg, rec);
  }

  // Generic counter spend (no side effect beyond the system message).
  async function spendCounter(counter: UsageCounter) {
    if (!character || !campaignId) return;
    const ok = await spendUsage(counter.id);
    if (!ok) return;
    const ts = Date.now();
    const msg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content: t("play.actionPanel.powerSpentMessage", {
        id: counter.id,
        remaining: counter.current - 1,
        max: counter.max,
      }),
      toolCallIds: [],
      diceRollIds: [],
      ts,
    };
    await useSessionStore.getState().appendMessage(msg);
  }

  return (
    <ul className="mt-1 flex flex-col gap-1.5">
      {counters.map((c) => {
        const remaining = c.current;
        const exhausted = remaining <= 0;
        const isRage = c.id === "rage";
        return (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <PowerIcon id={c.id} />
              <div className="min-w-0">
                <p className="truncate font-display text-sm text-text">
                  {t(`play.actionPanel.powerName.${c.id}`)}
                </p>
                <p className="font-mono text-xs text-text-muted">
                  {remaining}/{c.max} · {t(`play.actionPanel.powerRest.${c.perRest}`)}
                  {c.die && <> · d{c.die}</>}
                </p>
              </div>
            </div>
            {isRage ? (
              <button
                type="button"
                onClick={() => toggleRage()}
                disabled={!character.raging && exhausted}
                className={cn(
                  "rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-widest transition",
                  character.raging
                    ? "border-danger bg-danger/15 text-danger hover:bg-danger/25"
                    : "border-accent bg-accent/15 text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                {character.raging
                  ? t("play.actionPanel.rageEnd")
                  : t("play.actionPanel.rageStart")}
              </button>
            ) : c.id === "second-wind" ? (
              <button
                type="button"
                onClick={fireSecondWind}
                disabled={exhausted}
                className="rounded-sm border border-accent bg-accent/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t("play.actionPanel.useButton")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => spendCounter(c)}
                disabled={exhausted}
                className="rounded-sm border border-line bg-surface px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-text-muted transition hover:border-accent-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t("play.actionPanel.useButton")}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PowerIcon({ id }: { id: string }) {
  if (id === "rage") return <Flame className="h-3.5 w-3.5 text-danger" />;
  if (id === "second-wind") return <Heart className="h-3.5 w-3.5 text-accent" />;
  if (id === "lay-on-hands") return <Heart className="h-3.5 w-3.5 text-accent" />;
  if (id === "bardic-inspiration") return <Sparkles className="h-3.5 w-3.5 text-accent" />;
  return <Zap className="h-3.5 w-3.5 text-accent-muted" />;
}

function Empty({ text }: { text: string }) {
  return <p className="mt-1 py-2 text-center text-xs text-text-muted/80">{text}</p>;
}
