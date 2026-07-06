import { useWizardStore } from "@/state/wizardStore";
import { listSettings } from "@/data/settings";
import { StepHeader } from "@/components/ui/StepHeader";
import { WizardCard } from "@/components/ui/WizardCard";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

export function SettingStep() {
  const t = useT();
  const { setting, setSetting } = useWizardStore();
  const settings = listSettings();

  return (
    <div>
      <StepHeader
        title={t("wizard.settingStep.title")}
        description={t("wizard.settingStep.description")}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {settings.map((s) => {
          const Icon = s.icon;
          const selected = setting.settingId === s.id;
          return (
            <WizardCard
              key={s.id}
              selected={selected}
              onClick={() => setSetting({ settingId: s.id })}
              className="flex h-full flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selected ? "text-accent" : "text-text-muted",
                    )}
                  />
                  <p className="font-display text-base text-text">{s.name}</p>
                </div>
                {s.recommended && (
                  <span className="rounded-sm border border-accent-muted/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
                    {t("wizard.settingStep.recommended")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs italic text-text-muted">{s.tagline}</p>
              <p className="mt-3 text-xs leading-relaxed text-text-muted/90">
                {s.blurb}
              </p>
              <div className="mt-auto pt-4">
                <div className="flex flex-wrap gap-1">
                  {s.themes.map((t) => (
                    <span
                      key={t}
                      className="rounded-sm border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </WizardCard>
          );
        })}
      </div>

      {setting.settingId === "custom" && (
        <section className="mt-8">
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
            {t("wizard.settingStep.customLabel")}
          </label>
          <textarea
            value={setting.customDescription}
            onChange={(e) => setSetting({ customDescription: e.target.value })}
            placeholder={t("wizard.settingStep.customPlaceholder")}
            rows={5}
            maxLength={2000}
            className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/40 focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
          />
          <p className="mt-1 flex items-center justify-between text-xs">
            <span className="text-text-muted/60">
              {t("wizard.settingStep.customHint")}
            </span>
            <span className="font-mono text-text-muted/60">
              {setting.customDescription.length} / 2000
            </span>
          </p>
        </section>
      )}
    </div>
  );
}
