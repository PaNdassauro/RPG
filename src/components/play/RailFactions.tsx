import { Flag } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { FactionEntry } from "@/schemas/campaign";
import { reputationTier, type ReputationTier } from "@/lib/worldRail";
import { RailSection } from "@/components/play/RailSection";

const TIER_TONE: Record<ReputationTier, string> = {
  revered: "text-accent",
  allied: "text-accent",
  friendly: "text-accent-muted",
  neutral: "text-text-muted",
  wary: "text-danger/90",
  hostile: "text-danger",
  hated: "text-danger",
};

/** Factions with a labeled reputation scale: the bar grows out of the centre mark, gold for favour, red for enmity. */
export function RailFactions({ factions }: { factions: FactionEntry[] }) {
  const t = useT();
  if (factions.length === 0) return null;
  const sorted = [...factions].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <RailSection
      id="factions"
      title={t("play.worldRail.factions")}
      icon={<Flag />}
      count={factions.length}
    >
      <ul className="flex flex-col gap-2">
        {sorted.map((f) => {
          const tier = reputationTier(f.reputation);
          const magnitude = Math.min(100, Math.abs(f.reputation)) / 100;
          return (
            <li key={f.id} className="rounded-md border border-line/60 bg-surface/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate font-display text-[15px] leading-tight text-text">
                  {f.name}
                </p>
                <p className="shrink-0 text-[13px]">
                  <span className={cn("font-medium", TIER_TONE[tier])}>
                    {t(`play.worldRail.reputationTier.${tier}`)}
                  </span>
                  <span className="ml-1.5 font-mono tabular-nums text-text-muted">
                    {f.reputation > 0 ? `+${f.reputation}` : f.reputation}
                  </span>
                </p>
              </div>
              {f.description && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text-muted">
                  {f.description}
                </p>
              )}
              <div
                role="meter"
                aria-label={t("play.worldRail.reputation")}
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={f.reputation}
                className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-line/60"
              >
                <div
                  className="absolute inset-y-0 left-0 w-1/2 origin-right bg-danger transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${f.reputation < 0 ? magnitude : 0})` }}
                />
                <div
                  className="absolute inset-y-0 left-1/2 w-1/2 origin-left bg-accent transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${f.reputation > 0 ? magnitude : 0})` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-text-muted/60"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </RailSection>
  );
}
