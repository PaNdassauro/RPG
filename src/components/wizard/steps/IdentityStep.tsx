import { useWizardStore } from "@/state/wizardStore";
import { StepHeader } from "@/components/ui/StepHeader";
import { useT } from "@/i18n";
import { PORTRAITS } from "@/data/portraits";
import { cn } from "@/lib/cn";

export function IdentityStep() {
  const t = useT();
  const { identity, setIdentity } = useWizardStore();

  return (
    <div>
      <StepHeader
        title={t("wizard.identityStep.title")}
        description={t("wizard.identityStep.description")}
      />

      <div className="space-y-6">
        <div>
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("wizard.identityStep.nameLabel")}
          </label>
          <input
            type="text"
            value={identity.name}
            onChange={(e) => setIdentity({ name: e.target.value })}
            placeholder={t("wizard.identityStep.namePlaceholder")}
            maxLength={60}
            className="w-full rounded-md border border-line bg-surface px-4 py-3 font-display text-lg text-text placeholder:text-text-muted/40 focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
          />
        </div>

        <div>
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("wizard.identityStep.bioLabel")}
          </label>
          <textarea
            value={identity.bio}
            onChange={(e) => setIdentity({ bio: e.target.value })}
            placeholder={t("wizard.identityStep.bioPlaceholder")}
            rows={4}
            maxLength={2000}
            className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/40 focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
          />
          <p className="mt-1 text-right font-mono text-[10px] text-text-muted/60">
            {identity.bio.length} / 2000
          </p>
        </div>

        <div>
          <label className="mb-3 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("wizard.identityStep.sigilLabel")}
          </label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {PORTRAITS.map(({ id, icon: Icon, label }) => {
              const selected = identity.portraitId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIdentity({ portraitId: id })}
                  title={label}
                  aria-label={label}
                  aria-pressed={selected}
                  className={cn(
                    "group relative flex aspect-square items-center justify-center rounded-md border transition",
                    selected
                      ? "border-accent bg-accent/15 shadow-[0_0_0_1px_rgba(212,175,55,0.5)]"
                      : "border-line bg-surface hover:border-accent-muted hover:bg-surface-elevated",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 transition",
                      selected ? "text-accent" : "text-text-muted group-hover:text-text",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
