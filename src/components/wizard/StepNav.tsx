import { WIZARD_STEPS, useWizardStore, type WizardStep } from "@/state/wizardStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

interface StepNavProps {
  isStepValid: (step: WizardStep) => boolean;
}

export function StepNav({ isStepValid }: StepNavProps) {
  const t = useT();
  const current = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const currentIdx = WIZARD_STEPS.indexOf(current);

  return (
    <nav className="space-y-1">
      <p className="px-3 pb-2 font-display text-xs uppercase tracking-[0.3em] text-text-muted">
        {t("wizard.forge")}
      </p>
      <ol className="space-y-0.5">
        {WIZARD_STEPS.map((step, idx) => {
          const valid = isStepValid(step);
          const isCurrent = step === current;
          const isPast = idx < currentIdx;
          const isFuture = idx > currentIdx;
          // Allow clicking past steps freely, future steps only if all preceding are valid.
          const reachable =
            !isFuture ||
            WIZARD_STEPS.slice(0, idx).every((s) => isStepValid(s));
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => reachable && setStep(step)}
                aria-current={isCurrent ? "step" : undefined}
                disabled={!reachable}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  isCurrent && "bg-accent/10 text-accent",
                  !isCurrent && reachable && "text-text-muted hover:bg-surface hover:text-text",
                  !reachable && "cursor-not-allowed text-text-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-mono",
                    isCurrent && "border-accent bg-accent/20 text-accent",
                    isPast && valid && "border-accent-muted/60 bg-accent/5 text-accent",
                    isPast && !valid && "border-danger/60 text-danger",
                    isFuture && "border-line text-text-muted",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="font-display tracking-wide">
                  {t(`wizard.stepNav.${step}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
