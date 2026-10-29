import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWizardStore } from "@/state/wizardStore";
import { races, getRace, getSubracesForRace } from "@/data/srd";
import { StepHeader } from "@/components/ui/StepHeader";
import { WizardCard } from "@/components/ui/WizardCard";
import { ABILITIES, type Ability } from "@/schemas/character";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

export function RaceStep() {
  const t = useT();
  const ABILITY_LABEL: Record<Ability, string> = {
    str: "STR",
    dex: "DEX",
    con: "CON",
    int: "INT",
    wis: "WIS",
    cha: "CHA",
  };
  const { race, setRace, setRaceAbilityChoice, clearRaceAbilityChoice } =
    useWizardStore();

  const selectedRace = useMemo(
    () => (race.raceId ? getRace(race.raceId) : null),
    [race.raceId],
  );

  const subraces = useMemo(
    () => (race.raceId ? getSubracesForRace(race.raceId) : []),
    [race.raceId],
  );

  return (
    <div>
      <StepHeader
        title={t("wizard.raceStep.title")}
        description={t("wizard.raceStep.description")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {races.map((r) => {
          const selected = race.raceId === r.index;
          return (
            <WizardCard
              key={r.index}
              selected={selected}
              onClick={() => setRace(r.index, null)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base text-text">{r.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("wizard.raceStep.sizeSpeed", { size: r.size, speed: r.speed })}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {r.ability_bonuses.map((b, i) => (
                    <span
                      key={i}
                      className="rounded-sm border border-accent-muted/40 bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent"
                    >
                      {b.ability_score.name} +{b.bonus}
                    </span>
                  ))}
                  {r.ability_bonus_options && (
                    <span className="rounded-sm border border-accent-muted/30 bg-accent/5 px-1.5 py-0.5 font-mono text-xs text-accent-muted">
                      {t("wizard.raceStep.choiceTag", { count: r.ability_bonus_options.choose })}
                    </span>
                  )}
                </div>
              </div>
            </WizardCard>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedRace && subraces.length > 0 && (
          <motion.section
            key="subraces"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <h3 className="mb-3 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("wizard.raceStep.subraceHeading")}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {subraces.map((s) => {
                const selected = race.subraceId === s.index;
                return (
                  <WizardCard
                    key={s.index}
                    selected={selected}
                    onClick={() => setRace(selectedRace.index, s.index)}
                  >
                    <p className="font-display text-base text-text">{s.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {s.ability_bonuses
                        .map((b) => `${b.ability_score.name} +${b.bonus}`)
                        .join(" · ")}
                    </p>
                    {s.desc && (
                      <p className="mt-2 line-clamp-3 text-xs text-text-muted/80">
                        {s.desc}
                      </p>
                    )}
                  </WizardCard>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRace?.ability_bonus_options && (
          <motion.section
            key="ability-choice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <h3 className="mb-1 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("wizard.raceStep.abilityHeading")}
            </h3>
            <p className="mb-3 text-xs text-text-muted">
              {t("wizard.raceStep.abilityHelp", {
                count: selectedRace.ability_bonus_options.choose,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {ABILITIES.map((a) => {
                const chosen = race.abilityChoiceBonuses[a] === 1;
                const remaining =
                  selectedRace.ability_bonus_options!.choose -
                  Object.keys(race.abilityChoiceBonuses).length;
                const fixedHasIt = selectedRace.ability_bonuses.some(
                  (b) => b.ability_score.index.toLowerCase() === a,
                );
                const disabled = !chosen && (fixedHasIt || remaining <= 0);
                return (
                  <button
                    type="button"
                    key={a}
                    disabled={disabled}
                    onClick={() => {
                      if (chosen) clearRaceAbilityChoice(a);
                      else setRaceAbilityChoice(a, 1);
                    }}
                    className={cn(
                      "rounded-md border px-3 py-1.5 font-mono text-xs transition",
                      chosen
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {ABILITY_LABEL[a]} {chosen ? "+1" : ""}
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
