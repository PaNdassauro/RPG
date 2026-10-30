import { PawPrint } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { CompanionEntry } from "@/schemas/campaign";
import { fraction, healthTone, type HealthTone } from "@/lib/worldRail";
import { RailSection } from "@/components/play/RailSection";

const TONE_FILL: Record<HealthTone, string> = {
  healthy: "bg-accent",
  hurt: "bg-[#d49a37]",
  critical: "bg-danger",
};

/** Companions with a health bar (scaleX from the left edge) and armor class. */
export function RailCompanions({ companions }: { companions: CompanionEntry[] }) {
  const t = useT();
  if (companions.length === 0) return null;
  return (
    <RailSection
      id="companions"
      title={t("play.worldRail.companions")}
      icon={<PawPrint />}
      count={companions.length}
    >
      <ul className="flex flex-col gap-2">
        {companions.map((c) => {
          const tone = healthTone(c.hpCurrent, c.hpMax);
          return (
            <li key={c.id} className="rounded-md border border-line/60 bg-surface/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate font-display text-[15px] leading-tight text-text">
                  {c.name}
                </p>
                <p className="shrink-0 text-xs text-text-muted">
                  {t(`play.codex.companionKind.${c.kind}`)}
                </p>
              </div>
              {c.description && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text-muted">
                  {c.description}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-2.5">
                <div
                  role="meter"
                  aria-label={t("play.worldRail.hp")}
                  aria-valuemin={0}
                  aria-valuemax={c.hpMax}
                  aria-valuenow={c.hpCurrent}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-line/60"
                >
                  <div
                    className={cn(
                      "h-full origin-left transition-transform duration-300 ease-out",
                      TONE_FILL[tone],
                    )}
                    style={{ transform: `scaleX(${fraction(c.hpCurrent, c.hpMax)})` }}
                  />
                </div>
                <p className="shrink-0 font-mono text-[13px] tabular-nums text-text">
                  <span className="font-sans text-xs text-text-muted">{t("play.worldRail.hp")} </span>
                  {c.hpCurrent}/{c.hpMax}
                </p>
                <p className="shrink-0 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-xs tabular-nums text-text-muted">
                  {t("play.worldRail.ac", { n: c.ac })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </RailSection>
  );
}
