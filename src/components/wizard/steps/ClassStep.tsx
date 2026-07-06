import { useWizardStore } from "@/state/wizardStore";
import { classes, getClassLevel } from "@/data/srd";
import { StepHeader } from "@/components/ui/StepHeader";
import { WizardCard } from "@/components/ui/WizardCard";
import { useT } from "@/i18n";

export function ClassStep() {
  const t = useT();
  const { classChoice, setClass } = useWizardStore();

  return (
    <div>
      <StepHeader
        title={t("wizard.classStep.title")}
        description={t("wizard.classStep.description")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => {
          const selected = classChoice.classId === c.index;
          const level1 = getClassLevel(c.index, 1);
          return (
            <WizardCard
              key={c.index}
              selected={selected}
              onClick={() => setClass(c.index)}
            >
              <div className="flex items-baseline justify-between">
                <p className="font-display text-base text-text">{c.name}</p>
                <span className="font-mono text-[10px] text-text-muted">
                  {t("wizard.classStep.hd", { die: c.hit_die })}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                {t(`wizard.classStep.flavor.${c.index}`)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {c.saving_throws.map((s) => (
                  <span
                    key={s.index}
                    className="rounded-sm border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted"
                  >
                    {t("wizard.classStep.save", { ability: s.name })}
                  </span>
                ))}
                {level1?.spellcasting && (
                  <span className="rounded-sm border border-accent-muted/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                    {t("wizard.classStep.spellcaster")}
                  </span>
                )}
              </div>
            </WizardCard>
          );
        })}
      </div>
    </div>
  );
}
