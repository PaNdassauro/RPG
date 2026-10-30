import { Dices } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { DiceRollRecord } from "@/schemas/campaign";
import { recentRolls, rollLabel, rollVerdict, type RollVerdict } from "@/lib/worldRail";
import { RailSection } from "@/components/play/RailSection";

const VERDICT_TONE: Record<RollVerdict, string> = {
  success: "text-success",
  failure: "text-danger",
  critical: "text-accent",
  fumble: "text-danger",
};

/** The last few dice results as readable rows, with a plain-sentence empty state. */
export function RailRolls({ diceRolls }: { diceRolls: Record<string, DiceRollRecord> }) {
  const t = useT();
  const rolls = recentRolls(diceRolls);
  return (
    <RailSection id="rolls" title={t("play.worldRail.rolls.heading")} icon={<Dices />}>
      {rolls.length === 0 ? (
        <p className="rounded-md border border-dashed border-line/70 px-3 py-3 text-sm leading-snug text-text-muted">
          {t("play.worldRail.rolls.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rolls.map((r) => {
            const verdict = rollVerdict(r);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-md border border-line/60 bg-surface/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-text">{rollLabel(r, t)}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-text-muted">
                    {r.expression}
                    {r.dc !== null && ` · ${t("play.worldRail.rolls.vsDc", { dc: r.dc })}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "font-mono text-xl leading-none tabular-nums",
                      verdict ? VERDICT_TONE[verdict] : "text-text",
                    )}
                  >
                    {r.total}
                  </p>
                  {verdict && (
                    <p className={cn("mt-1 text-xs font-medium leading-none", VERDICT_TONE[verdict])}>
                      {t(`play.worldRail.rolls.verdict.${verdict}`)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}
