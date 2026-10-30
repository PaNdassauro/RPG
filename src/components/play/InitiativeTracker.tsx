import { motion, AnimatePresence } from "framer-motion";
import { Sword, Shield, Heart, PawPrint } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import type { CombatRange } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

const RANGE_LABEL: Record<CombatRange, string> = {
  close: "≤5ft",
  near: "≤30ft",
  far: "≤120ft",
  veryFar: ">120ft",
};
const RANGE_ORDER: CombatRange[] = ["close", "near", "far", "veryFar"];

function cycleRange(r: CombatRange): CombatRange {
  const i = RANGE_ORDER.indexOf(r);
  return RANGE_ORDER[(i + 1) % RANGE_ORDER.length]!;
}

export function InitiativeTracker() {
  const t = useT();
  const encounter = useSessionStore((s) => s.encounter);
  const setRange = useSessionStore((s) => s.setCombatantRange);
  if (!encounter) return null;

  return (
    <section>
      <div className="mb-2 flex min-h-10 items-center justify-between">
        <p className="flex items-center gap-2 font-display text-[13px] uppercase leading-none tracking-[0.15em] text-danger">
          <Sword aria-hidden="true" className="h-4 w-4" />
          {t("play.combat.initiativeHeading")}
        </p>
        <p className="text-[13px] tabular-nums text-text-muted">
          {t("play.combat.round", { n: encounter.round })}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {encounter.initiative.map((entry, idx) => {
            const isCurrent = idx === encounter.turnIndex;
            const isDown = entry.hp.current <= 0;
            const hpPct =
              entry.hp.max > 0
                ? Math.max(0, entry.hp.current) / entry.hp.max
                : 0;
            const hpColor =
              hpPct > 0.5
                ? "var(--color-accent)"
                : hpPct > 0.25
                  ? "#d49a37"
                  : "var(--color-danger)";

            return (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: isDown ? 0.45 : 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                className={
                  isCurrent
                    ? "relative rounded-md border border-accent/70 bg-surface px-3 py-2 shadow-[0_0_18px_-4px_rgba(212,175,55,0.45)]"
                    : "relative rounded-md border border-line/60 bg-surface/60 px-3 py-2"
                }
              >
                {isCurrent && (
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                    className="absolute -left-[1px] top-1.5 h-[calc(100%-12px)] w-[2px] rounded-full bg-accent"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {entry.kind === "pc" ? (
                      <Shield className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : entry.kind === "companion" ? (
                      <PawPrint className="h-3.5 w-3.5 shrink-0 text-accent-muted" />
                    ) : (
                      <Sword className="h-3.5 w-3.5 shrink-0 text-danger/80" />
                    )}
                    <p
                      className={
                        isDown
                          ? "truncate font-display text-sm text-text-muted line-through"
                          : "truncate font-display text-sm text-text"
                      }
                    >
                      {entry.name}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                    {t("play.combat.initShort", { n: entry.initiative })}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-line/60 bg-surface">
                    <motion.div
                      initial={false}
                      animate={{
                        width: `${hpPct * 100}%`,
                        backgroundColor: hpColor,
                      }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="h-full"
                    />
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-text-muted">
                    <Heart className="h-3 w-3" />
                    {entry.hp.current}/{entry.hp.max}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-text-muted">
                    {t("play.combat.acShort", { n: entry.ac })}
                  </span>
                </div>
                {entry.kind !== "pc" && !isDown && (
                  <button
                    type="button"
                    onClick={() => setRange(entry.id, cycleRange(entry.range))}
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-xs uppercase tracking-widest transition",
                      entry.range === "close"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : entry.range === "near"
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : entry.range === "far"
                            ? "border-line bg-surface text-text-muted"
                            : "border-line/60 bg-surface text-text-muted/60",
                    )}
                    title={t("play.combat.cycleRange")}
                  >
                    {t(`play.combat.range.${entry.range}`)} · {RANGE_LABEL[entry.range]}
                  </button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
