import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { WIZARD_STEPS, useWizardStore } from "@/state/wizardStore";
import { isStepComplete } from "@/state/wizardValidation";
import { useT } from "@/i18n";
import { StepNav } from "@/components/wizard/StepNav";
import { LiveSheet } from "@/components/wizard/LiveSheet";
import { IdentityStep } from "@/components/wizard/steps/IdentityStep";
import { RaceStep } from "@/components/wizard/steps/RaceStep";
import { ClassStep } from "@/components/wizard/steps/ClassStep";
import { BackgroundStep } from "@/components/wizard/steps/BackgroundStep";
import { AbilitiesStep } from "@/components/wizard/steps/AbilitiesStep";
import { SkillsStep } from "@/components/wizard/steps/SkillsStep";
import { EquipmentStep } from "@/components/wizard/steps/EquipmentStep";
import { ReviewStep } from "@/components/wizard/steps/ReviewStep";

export function CharacterWizard() {
  const t = useT();
  const step = useWizardStore((s) => s.step);
  const next = useWizardStore((s) => s.next);
  const prev = useWizardStore((s) => s.prev);
  const snapshot = useWizardStore(
    useShallow((s) => ({
      identity: s.identity,
      race: s.race,
      classChoice: s.classChoice,
      background: s.background,
      abilities: s.abilities,
      skills: s.skills,
      equipment: s.equipment,
    })),
  );

  const currentValid = isStepComplete(step, snapshot);
  const stepIndex = WIZARD_STEPS.indexOf(step);
  const stepCount = WIZARD_STEPS.length;

  // On a step change: back to the top and focus the new step's heading so
  // keyboard and screen-reader users land on the new content, not the old button.
  const mainRef = useRef<HTMLElement>(null);
  const firstStepRender = useRef(true);
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    mainRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-xs uppercase tracking-widest text-text-muted hover:text-text"
        >
          {t("wizard.backTitle")}
        </Link>
        <p className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
          {t("wizard.eyebrow")}
        </p>
        <span className="hidden font-display text-xs uppercase tracking-widest text-text-muted/80 sm:inline">
          {t("wizard.flavor")}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr_320px]">
        <div className="hidden lg:block">
          <StepNav isStepValid={(s) => isStepComplete(s, snapshot)} />
        </div>

        <main ref={mainRef} className="min-w-0">
          <div className="mb-6 lg:hidden">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
              {t("wizard.progress", {
                n: stepIndex + 1,
                total: stepCount,
                name: t(`wizard.stepNav.${step}`),
              })}
            </p>
            <div
              role="progressbar"
              aria-label={t("wizard.eyebrow")}
              aria-valuemin={1}
              aria-valuemax={stepCount}
              aria-valuenow={stepIndex + 1}
              className="mt-2 h-0.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full w-full origin-left bg-accent transition-transform duration-300 ease-out"
                style={{ transform: `scaleX(${(stepIndex + 1) / stepCount})` }}
              />
            </div>
          </div>

          {step === "identity" && <IdentityStep />}
          {step === "race" && <RaceStep />}
          {step === "class" && <ClassStep />}
          {step === "background" && <BackgroundStep />}
          {step === "abilities" && <AbilitiesStep />}
          {step === "skills" && <SkillsStep />}
          {step === "equipment" && <EquipmentStep />}
          {step === "review" && <ReviewStep />}

          {step !== "review" && (
            <div className="mt-10 flex items-center justify-between">
              <button
                type="button"
                onClick={prev}
                disabled={step === "identity"}
                className="rounded-md border border-line bg-surface px-5 py-2.5 font-display text-xs uppercase tracking-widest text-text transition-colors duration-150 ease-out hover:bg-surface-elevated active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("wizard.nav.back")}
              </button>
              <button
                type="button"
                onClick={next}
                disabled={!currentValid}
                className="rounded-md border border-accent-muted/60 bg-accent/15 px-6 py-2.5 font-display text-xs uppercase tracking-widest text-accent transition-colors duration-150 ease-out hover:bg-accent/25 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("wizard.nav.continue")}
              </button>
            </div>
          )}
        </main>

        <aside className="hidden lg:block">
          <LiveSheet />
        </aside>
      </div>
    </div>
  );
}
