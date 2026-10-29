import { useState } from "react";
import { Plus, Minus, Dices, Trash2 } from "lucide-react";
import { useWizardStore, type AbilityInputMode } from "@/state/wizardStore";
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  pointBuyCost,
  pointBuyRemaining,
} from "@/state/derivedCharacter";
import { ABILITIES, type Ability } from "@/schemas/character";
import { rollExpression } from "@/engine/dice";
import { StepHeader } from "@/components/ui/StepHeader";
import { DiceRoll } from "@/components/dice/DiceRoll";
import { useT } from "@/i18n";
import type { DiceRollResult } from "@/engine/types";
import { cn } from "@/lib/cn";

export function AbilitiesStep() {
  const t = useT();
  const mode = useWizardStore((s) => s.abilities.mode);
  const setMode = useWizardStore((s) => s.setAbilityMode);

  const LABELS: Record<AbilityInputMode, string> = {
    standard_array: t("wizard.abilitiesStep.modes.standardArray"),
    point_buy: t("wizard.abilitiesStep.modes.pointBuy"),
    manual: t("wizard.abilitiesStep.modes.manual"),
  };

  return (
    <div>
      <StepHeader
        title={t("wizard.abilitiesStep.title")}
        description={t("wizard.abilitiesStep.description")}
      />

      <div className="mb-6 inline-flex rounded-md border border-line bg-surface p-1">
        {(["standard_array", "point_buy", "manual"] as AbilityInputMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-sm px-4 py-1.5 font-display text-xs uppercase tracking-widest transition",
              mode === m ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text",
            )}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>

      {mode === "standard_array" && <StandardArrayMode />}
      {mode === "point_buy" && <PointBuyMode />}
      {mode === "manual" && <ManualRollMode />}
    </div>
  );
}

function abilityLabels(t: (key: string) => string): Record<Ability, string> {
  return {
    str: t("wizard.abilities.str"),
    dex: t("wizard.abilities.dex"),
    con: t("wizard.abilities.con"),
    int: t("wizard.abilities.int"),
    wis: t("wizard.abilities.wis"),
    cha: t("wizard.abilities.cha"),
  };
}

function StandardArrayMode() {
  const t = useT();
  const ABILITY_LABEL = abilityLabels(t);
  const assignments = useWizardStore((s) => s.abilities.arrayAssignments);
  const setAssignment = useWizardStore((s) => s.setArrayAssignment);

  const usedSlots = new Set(Object.values(assignments));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
          {t("wizard.abilitiesStep.arrayHeading")}
        </span>
        {STANDARD_ARRAY.map((value, idx) => (
          <span
            key={idx}
            className={cn(
              "rounded-md border px-3 py-1 font-mono text-base",
              usedSlots.has(idx)
                ? "border-line bg-surface text-text-muted/60 line-through"
                : "border-accent-muted/60 bg-accent/10 text-accent",
            )}
          >
            {value}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ABILITIES.map((a) => {
          const slot = assignments[a];
          const value = slot != null ? STANDARD_ARRAY[slot] : null;
          return (
            <div
              key={a}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3"
            >
              <span className="font-display text-sm text-text">{ABILITY_LABEL[a]}</span>
              <div className="flex items-center gap-2">
                <select
                  aria-label={ABILITY_LABEL[a]}
                  value={slot ?? ""}
                  onChange={(e) =>
                    setAssignment(
                      a,
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  className="rounded-md border border-line bg-surface-elevated px-3 py-1 font-mono text-base text-text focus:border-accent-muted sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
                >
                  <option value="">—</option>
                  {STANDARD_ARRAY.map((arrayValue, idx) => {
                    // a slot is selectable if it isn't taken (or if it's this ability's current slot)
                    const taken = usedSlots.has(idx) && assignments[a] !== idx;
                    return (
                      <option key={idx} value={idx} disabled={taken}>
                        {arrayValue}
                      </option>
                    );
                  })}
                </select>
                <span className="w-8 text-right font-mono text-base text-text">
                  {value ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PointBuyMode() {
  const t = useT();
  const ABILITY_LABEL = abilityLabels(t);
  const scores = useWizardStore((s) => s.abilities.scores);
  const setScore = useWizardStore((s) => s.setAbilityScore);
  const remaining = pointBuyRemaining(scores);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3">
        <span className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
          {t("wizard.abilitiesStep.pointsRemaining")}
        </span>
        <span
          className={cn(
            "font-mono text-2xl",
            remaining < 0 ? "text-danger" : remaining === 0 ? "text-accent" : "text-text",
          )}
        >
          {remaining} / {POINT_BUY_BUDGET}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ABILITIES.map((a) => {
          const value = scores[a];
          const cost = pointBuyCost(value);
          const canIncrement = value < POINT_BUY_MAX && remaining - (pointBuyCost(value + 1) - cost) >= 0;
          const canDecrement = value > POINT_BUY_MIN;
          return (
            <div
              key={a}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3"
            >
              <div>
                <p className="font-display text-sm text-text">{ABILITY_LABEL[a]}</p>
                <p className="font-mono text-xs text-text-muted">
                  {t("wizard.abilitiesStep.pointBuyCost", { n: cost })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => canDecrement && setScore(a, value - 1)}
                  disabled={!canDecrement}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface-elevated text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-mono text-2xl text-text">
                  {value}
                </span>
                <button
                  type="button"
                  onClick={() => canIncrement && setScore(a, value + 1)}
                  disabled={!canIncrement}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface-elevated text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManualRollMode() {
  const t = useT();
  const ABILITY_LABEL = abilityLabels(t);
  const scores = useWizardStore((s) => s.abilities.scores);
  const setScore = useWizardStore((s) => s.setAbilityScore);
  const setManualRolls = useWizardStore((s) => s.setManualRolls);
  const manualRolls = useWizardStore((s) => s.abilities.manualRolls);
  const [active, setActive] = useState<DiceRollResult | null>(null);

  function rollOne() {
    const r = rollExpression("4d6");
    setActive(r);
    // After settle, drop lowest and store
    const sorted = [...r.rolls].sort((a, b) => b.value - a.value);
    const top3 = sorted.slice(0, 3).reduce((sum, d) => sum + d.value, 0);
    setManualRolls([...manualRolls, top3]);
  }

  function reset() {
    setManualRolls([]);
    setActive(null);
    for (const a of ABILITIES) setScore(a, 8);
  }

  const usedRolls = ABILITIES.map((a) => scores[a]).filter((v) => v > 8);
  // Determine which manual rolls have been assigned by counting matches.
  const remainingPool = [...manualRolls];
  for (const v of usedRolls) {
    const idx = remainingPool.indexOf(v);
    if (idx >= 0) remainingPool.splice(idx, 1);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
              {t("wizard.abilitiesStep.manualHeading")}
            </p>
            <p className="mt-1 text-xs text-text-muted/80">
              {t("wizard.abilitiesStep.manualHelp")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={rollOne}
              disabled={manualRolls.length >= 6}
              className="flex items-center gap-2 rounded-md border border-accent-muted/60 bg-accent/15 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-accent transition hover:bg-accent/25 disabled:opacity-40"
            >
              <Dices className="h-3.5 w-3.5" />
              {t("wizard.abilitiesStep.rollLabel")}
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 rounded-md border border-line bg-surface-elevated px-3 py-1.5 font-display text-xs uppercase tracking-widest text-text-muted transition hover:text-text"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("wizard.abilitiesStep.reset")}
            </button>
          </div>
        </div>

        {active && (
          <div className="mt-4">
            <DiceRoll result={active} dc={null} />
          </div>
        )}

        {manualRolls.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
              {t("wizard.abilitiesStep.pool")}
            </span>
            {manualRolls.map((r, i) => {
              const used = !remainingPool.includes(r) || remainingPool.indexOf(r) < i;
              // Approximate "used" state based on assignment counts. Resets/duplicates may glitch
              // visually but the underlying truth lives in scores[].
              return (
                <span
                  key={i}
                  className={cn(
                    "rounded-md border px-3 py-1 font-mono text-base",
                    used
                      ? "border-line bg-surface text-text-muted/60"
                      : "border-accent-muted/60 bg-accent/10 text-accent",
                  )}
                >
                  {r}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ABILITIES.map((a) => (
          <div
            key={a}
            className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3"
          >
            <span className="font-display text-sm text-text">{ABILITY_LABEL[a]}</span>
            <input
              type="number"
              aria-label={ABILITY_LABEL[a]}
              min={3}
              max={20}
              value={scores[a]}
              onChange={(e) => setScore(a, Math.max(3, Math.min(20, Number(e.target.value) || 0)))}
              className="w-16 rounded-md border border-line bg-surface-elevated px-2 py-1 text-right font-mono text-base text-text focus:border-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
