import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Skull, HeartPulse } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { rollDeathSave } from "@/engine/deathSave";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import { DiceRoll } from "@/components/dice/DiceRoll";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import type { DiceRollResult } from "@/engine/types";
import { cn } from "@/lib/cn";

export function DyingCard() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingDying);
  const character = useSessionStore((s) => s.character);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);
  const applyDeathSaveDelta = useSessionStore((s) => s.applyDeathSaveDelta);

  const [rolling, setRolling] = useState<DiceRollResult | null>(null);

  const onRoll = useCallback(async () => {
    if (!pending || !character || !campaignId || rolling) return;
    const outcome = rollDeathSave();
    setRolling(outcome.result);

    const ts = Date.now();
    const rollRecord: DiceRollRecord = {
      id: newId(),
      expression: outcome.result.expression,
      mode: null,
      rolls: outcome.result.rolls,
      kept: outcome.result.kept,
      modifier: outcome.result.modifier,
      total: outcome.result.total,
      isCritical: outcome.kind === "crit",
      isFumble: outcome.kind === "fumble",
      purpose: "death-save",
      dc: 10,
      ts,
    };

    const verbKey =
      outcome.kind === "crit"
        ? "play.dying.recovered"
        : outcome.kind === "fumble"
          ? "play.dying.critFail"
          : outcome.kind === "success"
            ? "play.dying.success"
            : "play.dying.failure";

    const sysContent = t("play.dying.systemMessage", {
      total: outcome.result.total,
      outcome: t(verbKey),
    });

    const sysMsg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content: sysContent,
      toolCallIds: [],
      diceRollIds: [rollRecord.id],
      ts,
    };

    await appendDiceRoll(sysMsg, rollRecord);

    setTimeout(async () => {
      setRolling(null);
      await applyDeathSaveDelta({
        successes: outcome.successesDelta,
        failures: outcome.failuresDelta,
        recovered: outcome.recovered,
      });
    }, 1500);
  }, [pending, character, campaignId, rolling, appendDiceRoll, applyDeathSaveDelta, t]);

  return (
    <AnimatePresence>
      {pending && character && (
        <motion.div
          key={pending.id}
          layout
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="mx-auto mb-3 w-full max-w-prose rounded-md border border-danger/70 bg-canvas/80 px-5 py-4 shadow-[0_0_40px_-8px_rgba(220,80,60,0.55)] backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <Skull className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[10px] uppercase tracking-[0.4em] text-danger">
                {t("play.dying.eyebrow")}
              </p>
              <p className="mt-1 font-display text-base text-text">
                {t("play.dying.title")}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
                {t("play.dying.body")}
              </p>
              <PipsRow
                successes={character.deathSaves?.successes ?? 0}
                failures={character.deathSaves?.failures ?? 0}
                t={t}
              />
            </div>
            <button
              type="button"
              onClick={onRoll}
              disabled={!!rolling}
              className={cn(
                "shrink-0 rounded-md border border-danger bg-danger/15 px-5 py-2 font-display text-xs uppercase tracking-[0.3em] text-danger transition hover:bg-danger/25 disabled:cursor-default disabled:opacity-60",
              )}
            >
              <HeartPulse className="mr-2 inline-block h-3.5 w-3.5" />
              {rolling ? t("play.check.rolling") : t("play.dying.rollButton")}
            </button>
          </div>
          {rolling && (
            <div className="mt-4 flex justify-center border-t border-line/40 pt-4">
              <DiceRoll result={rolling} dc={10} autoPlay />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PipsRow({
  successes,
  failures,
  t,
}: {
  successes: number;
  failures: number;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="mt-3 flex items-center gap-4">
      <Row label={t("play.dying.successes")} count={successes} tone="accent" />
      <Row label={t("play.dying.failures")} count={failures} tone="danger" />
    </div>
  );
}

function Row({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "accent" | "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
        {label}
      </span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full border",
              i < count
                ? tone === "accent"
                  ? "border-accent bg-accent"
                  : "border-danger bg-danger"
                : "border-line bg-transparent",
            )}
          />
        ))}
      </div>
    </div>
  );
}
