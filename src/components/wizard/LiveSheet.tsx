import { motion } from "framer-motion";
import { useWizardStore } from "@/state/wizardStore";
import { deriveSheet } from "@/state/derivedCharacter";
import { ABILITIES, type Ability } from "@/schemas/character";
import { getClass, getRace, getSubrace, getBackground } from "@/data/srd";
import { getWorld } from "@/data/settings";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

export function LiveSheet() {
  const t = useT();
  const ABILITY_LABELS: Record<Ability, string> = {
    str: t("wizard.abilities.str").slice(0, 3).toUpperCase(),
    dex: t("wizard.abilities.dex").slice(0, 3).toUpperCase(),
    con: t("wizard.abilities.con").slice(0, 3).toUpperCase(),
    int: t("wizard.abilities.int").slice(0, 3).toUpperCase(),
    wis: t("wizard.abilities.wis").slice(0, 3).toUpperCase(),
    cha: t("wizard.abilities.cha").slice(0, 3).toUpperCase(),
  };
  const { identity, race, classChoice, background, abilities } = useWizardStore();
  const sheet = deriveSheet({ race, classChoice, abilities });

  const world = getWorld();
  const raceData = race.raceId ? getRace(race.raceId) : undefined;
  const subraceData = race.subraceId ? getSubrace(race.subraceId) : undefined;
  const classData = classChoice.classId ? getClass(classChoice.classId) : undefined;
  const backgroundData = background.backgroundId
    ? getBackground(background.backgroundId)
    : undefined;

  const heritage =
    [subraceData?.name, raceData?.name].filter(Boolean).join(" · ") || t("liveSheet.heritage");
  const calling = classData?.name ?? t("liveSheet.calling");

  return (
    <aside className="sticky top-6 flex w-full flex-col gap-5 rounded-md border border-line bg-surface/40 p-5 backdrop-blur">
      <div className="-mx-2 -mt-2 rounded-md bg-surface/60 px-3 py-2">
        <p className="font-display text-[9px] uppercase tracking-[0.4em] text-text-muted">
          {t("liveSheet.world")}
        </p>
        <p className="mt-0.5 font-display text-sm text-accent">{world.name}</p>
      </div>

      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
          {t("liveSheet.eyebrow")}
        </p>
        <h3 className="mt-1 font-display text-xl text-text">
          {identity.name || t("liveSheet.unnamed")}
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          {heritage} · {calling} · L{sheet.level}
        </p>
        {backgroundData && (
          <p className="text-xs text-text-muted/80">{backgroundData.name}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={t("liveSheet.statHp")}
          value={sheet.hpMax != null ? String(sheet.hpMax) : "—"}
          accent
        />
        <Stat label={t("liveSheet.statAc")} value={sheet.ac != null ? String(sheet.ac) : "—"} />
        <Stat label={t("liveSheet.statSpeed")} value={sheet.speed != null ? `${sheet.speed} ft` : "—"} />
        <Stat
          label={t("liveSheet.statInit")}
          value={sheet.initiativeBonus != null ? signed(sheet.initiativeBonus) : "—"}
        />
        <Stat label={t("liveSheet.statProf")} value={signed(sheet.profBonus)} />
        <Stat
          label={t("liveSheet.statHitDie")}
          value={sheet.hitDie ? `d${sheet.hitDie}` : "—"}
        />
      </div>

      <div>
        <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
          {t("liveSheet.abilities")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ABILITIES.map((a) => (
            <AbilityBlock
              key={a}
              label={ABILITY_LABELS[a]}
              total={sheet.abilities.total[a]}
              modifier={sheet.abilities.modifier[a]}
              raceBonus={sheet.abilities.raceBonus[a]}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-line/60 bg-surface px-2 py-2 text-center">
      <p className="font-display text-[9px] uppercase tracking-[0.3em] text-text-muted">
        {label}
      </p>
      <motion.p
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "mt-0.5 font-display text-lg leading-tight",
          accent ? "text-accent" : "text-text",
        )}
      >
        {value}
      </motion.p>
    </div>
  );
}

function AbilityBlock({
  label,
  total,
  modifier,
  raceBonus,
}: {
  label: string;
  total: number;
  modifier: number;
  raceBonus: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line/60 bg-surface px-3 py-2">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.25em] text-text-muted">
          {label}
        </p>
        <motion.p
          key={total}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="font-display text-lg text-text"
        >
          {total}
          {raceBonus > 0 && (
            <span className="ml-1 text-[10px] text-accent-muted">
              +{raceBonus}
            </span>
          )}
        </motion.p>
      </div>
      <span className="font-mono text-base text-accent">{signed(modifier)}</span>
    </div>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
