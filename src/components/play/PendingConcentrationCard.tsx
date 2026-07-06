import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { resolveSavingThrow } from "@/engine/saves";
import { applyConditionsToRoll } from "@/engine/conditions";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import { DiceRoll } from "@/components/dice/DiceRoll";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import type { DiceRollResult } from "@/engine/types";
import { cn } from "@/lib/cn";

export function PendingConcentrationCard() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingConcentration);
  const character = useSessionStore((s) => s.character);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);
  const resolveConcentrationSave = useSessionStore(
    (s) => s.resolveConcentrationSave,
  );

  const [rolling, setRolling] = useState<DiceRollResult | null>(null);

  const onRoll = useCallback(async () => {
    if (!pending || !character || !campaignId || rolling) return;

    const condMode = applyConditionsToRoll({
      conditions: character.conditions,
      kind: "save",
      ability: "con",
    });
    let resolution = resolveSavingThrow(character, "con", pending.dc, condMode.mode);
    if (condMode.autoFail) {
      resolution = { ...resolution, success: false };
    }
    setRolling(resolution.result);

    const ts = Date.now();
    const rollRecord: DiceRollRecord = {
      id: newId(),
      expression: resolution.result.expression,
      mode: resolution.result.mode,
      rolls: resolution.result.rolls,
      kept: resolution.result.kept,
      modifier: resolution.result.modifier,
      total: resolution.result.total,
      isCritical: resolution.result.isCritical,
      isFumble: resolution.result.isFumble,
      purpose: "concentration",
      dc: pending.dc,
      ts,
    };

    const outcome = resolution.success
      ? t("play.concentration.held")
      : t("play.concentration.broken");
    const sysContent = t("play.concentration.systemMessage", {
      spell: pending.spellName,
      total: resolution.total,
      dc: pending.dc,
      outcome,
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
      await resolveConcentrationSave(resolution.total);
    }, 1500);
  }, [pending, character, campaignId, rolling, appendDiceRoll, resolveConcentrationSave, t]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key={pending.id}
          layout
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className={cn(
            "mx-auto mb-3 w-full max-w-prose rounded-md border border-accent/60 bg-surface/80 px-5 py-4 shadow-[0_0_0_1px_rgba(212,175,55,0.18),0_0_30px_-8px_rgba(212,175,55,0.4)] backdrop-blur",
          )}
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent">
                {t("play.concentration.requested")}
              </p>
              <p className="mt-1 font-display text-base text-text">
                {t("play.concentration.title", { spell: pending.spellName })}
                <span className="ml-2 font-mono text-sm text-accent">
                  {t("play.check.dc", { dc: pending.dc })}
                </span>
              </p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
                {t("play.concentration.body", { damage: pending.damageTaken })}
              </p>
            </div>
            <button
              type="button"
              onClick={onRoll}
              disabled={!!rolling}
              className={cn(
                "shrink-0 rounded-md border border-accent bg-accent/15 px-5 py-2 font-display text-xs uppercase tracking-[0.3em] text-accent transition hover:bg-accent/25 disabled:cursor-default disabled:opacity-60",
              )}
            >
              {rolling ? t("play.check.rolling") : t("play.check.rollButton")}
            </button>
          </div>
          {rolling && (
            <div className="mt-4 flex justify-center border-t border-line/40 pt-4">
              <DiceRoll result={rolling} dc={pending.dc} autoPlay />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
