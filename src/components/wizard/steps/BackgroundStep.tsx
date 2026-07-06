import { useWizardStore } from "@/state/wizardStore";
import { backgrounds } from "@/data/srd";
import { StepHeader } from "@/components/ui/StepHeader";
import { WizardCard } from "@/components/ui/WizardCard";
import { useT } from "@/i18n";

export function BackgroundStep() {
  const t = useT();
  const { background, setBackground } = useWizardStore();

  return (
    <div>
      <StepHeader
        title={t("wizard.backgroundStep.title")}
        description={t("wizard.backgroundStep.description")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {backgrounds.map((b) => {
          const selected = background.backgroundId === b.index;
          const profs = b.starting_proficiencies?.slice(0, 4) ?? [];
          return (
            <WizardCard
              key={b.index}
              selected={selected}
              onClick={() => setBackground(b.index)}
            >
              <p className="font-display text-base text-text">{b.name}</p>
              {b.feature && (
                <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                  <span className="text-accent-muted">{b.feature.name}.</span>{" "}
                  {b.feature.desc[0]}
                </p>
              )}
              {profs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {profs.map((p) => (
                    <span
                      key={p.index}
                      className="rounded-sm border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                    >
                      {p.name.replace(/^Skill: /, "")}
                    </span>
                  ))}
                </div>
              )}
            </WizardCard>
          );
        })}
      </div>
    </div>
  );
}
