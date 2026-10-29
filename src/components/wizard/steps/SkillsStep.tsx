import { Check } from "lucide-react";
import { useWizardStore } from "@/state/wizardStore";
import { getClass, getSkill } from "@/data/srd";
import { SKILLS, SKILL_TO_ABILITY, type SkillName } from "@/schemas/character";
import { StepHeader } from "@/components/ui/StepHeader";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

const ABILITY_LABEL: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

// Skill labels stay in English: they map to SRD content. Translate later if
// the user wants a localized SRD too.
const SKILL_LABEL: Record<SkillName, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

/**
 * The first proficiency_choices entry on each class is its skill list. Pull
 * the SRD indexes ("skill-stealth") and convert to our snake-camel SkillName.
 */
function classSkillOptions(classIndex: string): { allowed: Set<SkillName>; budget: number } {
  const klass = getClass(classIndex);
  if (!klass) return { allowed: new Set(), budget: 0 };
  const choice = klass.proficiency_choices[0];
  if (!choice) return { allowed: new Set(), budget: 0 };
  const allowed = new Set<SkillName>();
  const opts = choice.from.options ?? choice.from.options_array ?? [];
  for (const o of opts as { item?: { index: string } }[]) {
    const srdIdx = o.item?.index;
    if (!srdIdx) continue;
    const stripped = srdIdx.replace(/^skill-/, "");
    const name = srdToSchemaSkill(stripped);
    if (name) allowed.add(name);
  }
  return { allowed, budget: choice.choose };
}

function srdToSchemaSkill(srd: string): SkillName | null {
  // SRD uses kebab-case ("animal-handling"), our schema uses camelCase ("animalHandling").
  const camel = srd.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return (SKILLS as readonly string[]).includes(camel) ? (camel as SkillName) : null;
}

export function SkillsStep() {
  const t = useT();
  const classId = useWizardStore((s) => s.classChoice.classId);
  const selected = useWizardStore((s) => s.skills.selected);
  const toggleSkill = useWizardStore((s) => s.toggleSkill);

  const { allowed, budget } = classId
    ? classSkillOptions(classId)
    : { allowed: new Set<SkillName>(), budget: 0 };

  const remaining = budget - selected.length;

  if (!classId) {
    return (
      <div>
        <StepHeader
          title={t("wizard.stepNav.skills")}
          description={t("wizard.skillsStep.noClass")}
        />
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        title={t("wizard.skillsStep.title")}
        description={t("wizard.skillsStep.description", {
          count: budget,
          plural: budget === 1 ? "" : "s",
        })}
      />

      <div className="mb-4 flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3">
        <span className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
          {t("wizard.skillsStep.choicesLabel")}
        </span>
        <span
          className={cn(
            "font-mono text-lg",
            remaining === 0 ? "text-accent" : remaining < 0 ? "text-danger" : "text-text",
          )}
        >
          {selected.length} / {budget}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SKILLS.map((skill) => {
          const ability = SKILL_TO_ABILITY[skill];
          const isAllowed = allowed.has(skill);
          const isSelected = selected.includes(skill);
          const disabled = !isAllowed || (!isSelected && remaining === 0);
          const srdSkill = getSkill(srdSkillIndex(skill));
          return (
            <button
              type="button"
              key={skill}
              disabled={disabled}
              onClick={() => toggleSkill(skill)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition",
                isSelected && "border-accent bg-accent/10",
                !isSelected && isAllowed && "border-line bg-surface hover:border-accent-muted hover:bg-surface-elevated",
                !isAllowed && "border-line/50 bg-surface/40 cursor-not-allowed text-text-muted/60",
              )}
            >
              <div className="min-w-0">
                <p className="font-display text-sm text-text">
                  {SKILL_LABEL[skill]}
                </p>
                <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                  {ABILITY_LABEL[ability]}
                  {srdSkill && (
                    <>
                      {" — "}
                      <span className="normal-case tracking-normal">
                        {srdSkill.desc[0]?.slice(0, 60)}…
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                  isSelected ? "border-accent bg-accent text-canvas" : "border-line",
                )}
              >
                {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function srdSkillIndex(name: SkillName): string {
  // camelCase → kebab-case (animalHandling → animal-handling)
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
