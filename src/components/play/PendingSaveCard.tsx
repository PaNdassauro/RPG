import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useSessionStore, type PendingSave } from "@/state/sessionStore";
import { resolveSavingThrow } from "@/engine/saves";
import { applyConditionsToRoll } from "@/engine/conditions";
import { runDmTurn } from "@/dm/loop";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import { DiceRoll } from "@/components/dice/DiceRoll";
import { abilityModifier } from "@/schemas/character";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import type { DiceRollResult } from "@/engine/types";
import { cn } from "@/lib/cn";

const ABILITY_LABEL_PT: Record<string, string> = {
  str: "Força",
  dex: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  wis: "Sabedoria",
  cha: "Carisma",
};

interface RollingState {
  result: DiceRollResult;
  success: boolean;
}

export function PendingSaveCard() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingSave);
  const character = useSessionStore((s) => s.character);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);
  const setPendingSave = useSessionStore((s) => s.setPendingSave);

  const [rolling, setRolling] = useState<RollingState | null>(null);

  const onRoll = useCallback(async () => {
    if (!pending || !character || !campaignId || rolling) return;

    // Conditions can impose disadvantage or auto-fail the save.
    const condMode = applyConditionsToRoll({
      conditions: character.conditions,
      kind: "save",
      ability: pending.ability,
      base: pending.mode,
    });

    let resolution = resolveSavingThrow(
      character,
      pending.ability,
      pending.dc,
      condMode.mode,
    );
    // Auto-fail override (paralyzed/stunned/etc. on STR/DEX saves).
    if (condMode.autoFail) {
      resolution = { ...resolution, success: false };
    }

    setRolling({ result: resolution.result, success: resolution.success });

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
      purpose: `save:${pending.ability}`,
      dc: pending.dc,
      ts,
    };

    // Outcome comes from `resolution.success` (DC only); a natural 20/1 never
    // auto-succeeds/fails a save and is mentioned purely as flavor.
    const outcome = condMode.autoFail
      ? t("play.save.autoFail")
      : resolution.success
        ? resolution.isCritical
          ? t("play.check.successNat20")
          : t("play.check.success")
        : resolution.isFumble
          ? t("play.check.failureNat1")
          : t("play.check.failure");

    const sysContent = t("play.save.systemMessage", {
      ability: ABILITY_LABEL_PT[pending.ability] ?? pending.ability,
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
      setPendingSave(null);
      await runDmTurn({ playerInput: sysContent, isFirstTurn: false });
    }, 1500);
  }, [pending, character, campaignId, rolling, appendDiceRoll, setPendingSave, t]);

  return (
    <AnimatePresence>
      {pending && (
        <CardBody
          key={pending.id}
          pending={pending}
          rolling={rolling}
          onRoll={onRoll}
          t={t}
          character={character}
        />
      )}
    </AnimatePresence>
  );
}

interface CardBodyProps {
  pending: PendingSave;
  rolling: RollingState | null;
  onRoll: () => void;
  t: ReturnType<typeof useT>;
  character: ReturnType<typeof useSessionStore.getState>["character"];
}

function CardBody({ pending, rolling, onRoll, t, character }: CardBodyProps) {
  const score = character?.abilities[pending.ability] ?? 10;
  const aMod = abilityModifier(score);
  const proficient = character?.savingThrows.includes(pending.ability) ?? false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={cn(
        "mx-auto mb-3 w-full max-w-prose rounded-md border border-danger/60 bg-surface/80 px-5 py-4 shadow-[0_0_0_1px_rgba(220,80,60,0.18),0_0_30px_-8px_rgba(220,80,60,0.4)] backdrop-blur",
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] uppercase tracking-[0.4em] text-danger/80">
            {t("play.save.requested")}
          </p>
          <p className="mt-1 font-display text-base text-text">
            {t("play.save.title", {
              ability: ABILITY_LABEL_PT[pending.ability] ?? pending.ability,
            })}
            <span className="ml-2 font-mono text-sm text-danger">
              {t("play.check.dc", { dc: pending.dc })}
            </span>
            {pending.mode === "adv" && (
              <span className="ml-2 text-xs italic text-accent-muted">
                {t("play.check.modeAdv")}
              </span>
            )}
            {pending.mode === "dis" && (
              <span className="ml-2 text-xs italic text-danger/80">
                {t("play.check.modeDis")}
              </span>
            )}
          </p>
          {pending.reason && (
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
              {pending.reason}
            </p>
          )}
          <p className="mt-2 font-mono text-xs text-text-muted/80">
            mod {aMod >= 0 ? `+${aMod}` : aMod}
            {proficient && t("play.save.proficient")}
          </p>
        </div>

        <button
          type="button"
          onClick={onRoll}
          disabled={!!rolling}
          className={cn(
            "shrink-0 rounded-md border border-danger bg-danger/15 px-5 py-2 font-display text-xs uppercase tracking-[0.3em] text-danger transition hover:bg-danger/25 disabled:cursor-default disabled:opacity-60",
          )}
        >
          {rolling ? t("play.check.rolling") : t("play.check.rollButton")}
        </button>
      </div>

      {rolling && (
        <div className="mt-4 flex justify-center border-t border-line/40 pt-4">
          <DiceRoll result={rolling.result} dc={pending.dc} success={rolling.success} autoPlay />
        </div>
      )}
    </motion.div>
  );
}
