import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "@/state/wizardStore";
import { finalizeCharacter } from "@/state/finalizeCharacter";
import { db } from "@/db/schema";
import { newId } from "@/lib/id";
import { StepHeader } from "@/components/ui/StepHeader";
import { deriveSheet } from "@/state/derivedCharacter";
import { getRace, getSubrace, getClass, getBackground } from "@/data/srd";
import { ABILITIES, type Ability } from "@/schemas/character";
import { getSetting } from "@/data/settings";
import { useT } from "@/i18n";

export function ReviewStep() {
  const t = useT();
  const ABILITY_LABEL: Record<Ability, string> = {
    str: t("wizard.abilities.str"),
    dex: t("wizard.abilities.dex"),
    con: t("wizard.abilities.con"),
    int: t("wizard.abilities.int"),
    wis: t("wizard.abilities.wis"),
    cha: t("wizard.abilities.cha"),
  };
  const wizard = useWizardStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const race = wizard.race.raceId ? getRace(wizard.race.raceId) : null;
  const subrace = wizard.race.subraceId ? getSubrace(wizard.race.subraceId) : null;
  const klass = wizard.classChoice.classId ? getClass(wizard.classChoice.classId) : null;
  const background = wizard.background.backgroundId
    ? getBackground(wizard.background.backgroundId)
    : null;

  const setting = getSetting(wizard.setting.settingId);

  const sheet = deriveSheet({
    race: wizard.race,
    classChoice: wizard.classChoice,
    abilities: wizard.abilities,
  });

  async function beginAdventure() {
    setBusy(true);
    setError(null);
    try {
      const character = finalizeCharacter({
        identity: wizard.identity,
        race: wizard.race,
        classChoice: wizard.classChoice,
        background: wizard.background,
        abilities: wizard.abilities,
        skills: wizard.skills,
        equipment: wizard.equipment,
      });
      const campaignId = newId();
      const now = Date.now();

      const customDesc = wizard.setting.customDescription.trim();
      await db.transaction("rw", db.characters, db.campaigns, async () => {
        await db.characters.put(character);
        await db.campaigns.put({
          id: campaignId,
          title: `${character.name}'s Tale`,
          characterId: character.id,
          worldSeed: newId(),
          settingId: wizard.setting.settingId,
          customSettingDescription:
            wizard.setting.settingId === "custom" && customDesc.length > 0
              ? customDesc
              : undefined,
          currentLocation: { name: "An Unknown Threshold", description: "" },
          inWorldDay: 1,
          quests: [],
          factions: [],
          companions: [],
          pinnedFacts: [],
          placesVisited: [],
          npcsMet: [],
          journal: "",
          rollingSummary: "",
          summaryThroughTurn: 0,
          createdAt: now,
          updatedAt: now,
        });
      });

      wizard.reset();
      navigate(`/play/${campaignId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wizard.reviewStep.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <StepHeader
        title={t("wizard.reviewStep.title")}
        description={t("wizard.reviewStep.description")}
      />

      <div className="space-y-6 rounded-md border border-accent-muted/30 bg-surface/60 p-6">
        <header>
          {setting && (
            <p className="mb-3 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
              {t("wizard.reviewStep.worldLabel")} · <span className="text-accent">{setting.name}</span>
            </p>
          )}
          <p className="font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
            {[subrace?.name, race?.name].filter(Boolean).join(" · ")} · {klass?.name} · L
            {sheet.level}
          </p>
          <h3 className="mt-2 font-display text-2xl text-text">{wizard.identity.name}</h3>
          {wizard.identity.bio && (
            <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed text-text-muted">
              {wizard.identity.bio}
            </p>
          )}
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("wizard.reviewStep.hp")} value={sheet.hpMax ?? "—"} />
          <Stat label={t("wizard.reviewStep.ac")} value={sheet.ac ?? "—"} />
          <Stat label={t("wizard.reviewStep.speed")} value={sheet.speed ? `${sheet.speed} ft` : "—"} />
          <Stat label={t("wizard.reviewStep.prof")} value={`+${sheet.profBonus}`} />
        </div>

        <div>
          <h4 className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
            {t("wizard.reviewStep.abilities")}
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ABILITIES.map((a) => (
              <div
                key={a}
                className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2"
              >
                <span className="font-display text-sm text-text">
                  {ABILITY_LABEL[a]}
                </span>
                <span className="font-mono text-base text-text">
                  {sheet.abilities.total[a]}{" "}
                  <span className="ml-1 text-accent">
                    {sheet.abilities.modifier[a] >= 0
                      ? `+${sheet.abilities.modifier[a]}`
                      : sheet.abilities.modifier[a]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {wizard.skills.selected.length > 0 && (
          <div>
            <h4 className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("wizard.reviewStep.skillsHeading")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {wizard.skills.selected.map((s) => (
                <span
                  key={s}
                  className="rounded-sm border border-accent-muted/40 bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {background && (
          <div>
            <h4 className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("wizard.reviewStep.backgroundLabel", { name: background.name })}
            </h4>
            {background.feature && (
              <p className="text-sm text-text-muted">
                <span className="text-text">{background.feature.name}.</span>{" "}
                {background.feature.desc[0]}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={beginAdventure}
          disabled={busy}
          className="rounded-md border border-accent bg-accent/20 px-10 py-3 font-display text-sm uppercase tracking-[0.3em] text-accent transition hover:bg-accent/30 disabled:opacity-50"
        >
          {busy ? t("wizard.reviewStep.saving") : t("wizard.reviewStep.beginButton")}
        </button>
        <p className="text-xs text-text-muted/60">
          {t("wizard.reviewStep.helper")}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-center">
      <p className="font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-display text-xl text-text">{value}</p>
    </div>
  );
}
