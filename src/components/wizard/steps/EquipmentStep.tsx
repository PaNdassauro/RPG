import { useWizardStore } from "@/state/wizardStore";
import { getClass } from "@/data/srd";
import { StepHeader } from "@/components/ui/StepHeader";
import { WizardCard } from "@/components/ui/WizardCard";
import { useT } from "@/i18n";

export function EquipmentStep() {
  const t = useT();
  const classId = useWizardStore((s) => s.classChoice.classId);
  const choices = useWizardStore((s) => s.equipment.choices);
  const setChoice = useWizardStore((s) => s.setEquipmentChoice);

  if (!classId) {
    return (
      <div>
        <StepHeader
          title={t("wizard.stepNav.equipment")}
          description={t("wizard.equipmentStep.noClass")}
        />
      </div>
    );
  }

  const klass = getClass(classId);
  if (!klass) {
    return (
      <div>
        <StepHeader
          title={t("wizard.stepNav.equipment")}
          description={t("wizard.equipmentStep.noClassFound")}
        />
      </div>
    );
  }

  const groups = klass.starting_equipment_options ?? [];

  return (
    <div>
      <StepHeader
        title={t("wizard.equipmentStep.title")}
        description={t("wizard.equipmentStep.description")}
      />

      {klass.starting_equipment.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
            {t("wizard.equipmentStep.alwaysGranted")}
          </h3>
          <ul className="space-y-1 rounded-md border border-line bg-surface px-4 py-3 text-sm text-text-muted">
            {klass.starting_equipment.map((e, i) => (
              <li key={i}>
                <span className="text-text">{e.equipment.name}</span>
                {e.quantity > 1 && (
                  <span className="ml-2 font-mono text-xs text-text-muted">×{e.quantity}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-6">
        {groups.map((group, i) => (
          <section key={i}>
            <h3 className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("wizard.equipmentStep.choice", { n: i + 1 })}
            </h3>
            {group.desc && (
              <p className="mb-3 text-sm text-text-muted">{group.desc}</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {(group.from.options ?? []).map((opt, optIdx) => {
                const selected = choices[i] === optIdx;
                return (
                  <WizardCard
                    key={optIdx}
                    selected={selected}
                    onClick={() => setChoice(i, optIdx)}
                  >
                    <p className="text-sm text-text">{describeOption(opt)}</p>
                  </WizardCard>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The SRD shape for equipment options is a tagged union — we just need a
 * human-readable description for each one. This walks the common shapes.
 */
function describeOption(opt: unknown): string {
  if (!opt || typeof opt !== "object") return "Option";
  const o = opt as Record<string, unknown>;
  if (o.option_type === "counted_reference") {
    const ref = o.of as { name?: string } | undefined;
    return `${ref?.name ?? "Item"}${o.count && (o.count as number) > 1 ? ` ×${o.count}` : ""}`;
  }
  if (o.option_type === "multiple") {
    const items = (o.items as unknown[]) ?? [];
    return items.map(describeOption).join(", ");
  }
  if (o.option_type === "choice") {
    const choice = (o.choice as { desc?: string } | undefined)?.desc;
    return choice ?? "Choose…";
  }
  if (o.option_type === "reference") {
    const ref = o.of as { name?: string } | undefined;
    return ref?.name ?? "Item";
  }
  if (typeof o.desc === "string") return o.desc as string;
  return "Option";
}
