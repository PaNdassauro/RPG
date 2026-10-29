import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSessionStore, type PendingCheck } from "@/state/sessionStore";
import { resolveSkillCheck } from "@/engine/checks";
import { applyConditionsToRoll } from "@/engine/conditions";
import { runDmTurn } from "@/dm/loop";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import { DiceRoll } from "@/components/dice/DiceRoll";
import { SKILL_TO_ABILITY, abilityModifier } from "@/schemas/character";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import type { DiceRollResult } from "@/engine/types";
import { cn } from "@/lib/cn";

const SKILL_LABEL: Record<string, string> = {
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

const ABILITY_LABEL: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

interface RollingState {
  result: DiceRollResult;
  success: boolean;
}

export function PendingCheckCard() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingCheck);
  const character = useSessionStore((s) => s.character);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);
  const setPendingCheck = useSessionStore((s) => s.setPendingCheck);

  const [rolling, setRolling] = useState<RollingState | null>(null);

  const onRoll = useCallback(async () => {
    if (!pending || !character || !campaignId || rolling) return;
    const condMode = applyConditionsToRoll({
      conditions: character.conditions,
      kind: "check",
      base: pending.mode,
    });
    const resolution = resolveSkillCheck(
      character,
      pending.skill,
      pending.dc,
      condMode.mode,
    );
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
      purpose: `check:${pending.skill}`,
      dc: pending.dc,
      ts,
    };

    // The outcome is decided by the DC alone (a natural 20/1 never flips an
    // ability check); the natural roll is only mentioned as flavor.
    const outcome = resolution.success
      ? resolution.isCritical
        ? t("play.check.successNat20")
        : t("play.check.success")
      : resolution.isFumble
        ? t("play.check.failureNat1")
        : t("play.check.failure");

    const sysContent = t("play.check.systemMessage", {
      skill: SKILL_LABEL[pending.skill] ?? pending.skill,
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

    // Wait for the DiceRoll animation to settle before continuing the DM turn
    // — feels less abrupt than firing immediately.
    setTimeout(async () => {
      setRolling(null);
      setPendingCheck(null);
      await runDmTurn({
        playerInput: sysContent,
        isFirstTurn: false,
      });
    }, 1500);
  }, [pending, character, campaignId, rolling, appendDiceRoll, setPendingCheck, t]);

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
  pending: PendingCheck;
  rolling: RollingState | null;
  onRoll: () => void;
  t: ReturnType<typeof useT>;
  character: ReturnType<typeof useSessionStore.getState>["character"];
}

function CardBody({ pending, rolling, onRoll, t, character }: CardBodyProps) {
  const ability = SKILL_TO_ABILITY[pending.skill];
  const score = character?.abilities[ability] ?? 10;
  const abilityMod = abilityModifier(score);
  const proficient = character?.proficientSkills.includes(pending.skill) ?? false;
  const expertise = character?.expertiseSkills.includes(pending.skill) ?? false;
  const profBonus = character
    ? proficiencyBonusForLevel(character.classes.reduce((s, c) => s + c.level, 0))
    : 2;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={cn(
        "mx-auto mb-3 w-full max-w-prose rounded-md border border-accent/60 bg-surface/80 px-5 py-4 shadow-[0_0_0_1px_rgba(212,175,55,0.2),0_0_30px_-8px_rgba(212,175,55,0.4)] backdrop-blur",
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            {t("play.check.requested")}
          </p>
          <p className="mt-1 font-display text-base text-text">
            {SKILL_LABEL[pending.skill] ?? pending.skill}
            <span className="ml-2 font-mono text-sm text-accent">
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
            {ABILITY_LABEL[ability]} {signed(abilityMod)}
            {expertise
              ? t("play.check.expertise", { bonus: profBonus * 2 })
              : proficient
                ? t("play.check.proficient", { bonus: profBonus })
                : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onRoll}
          disabled={!!rolling}
          className={cn(
            "shrink-0 rounded-md border border-accent bg-accent/20 px-5 py-2 font-display text-xs uppercase tracking-[0.3em] text-accent transition hover:bg-accent/30 disabled:cursor-default disabled:opacity-60",
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

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function proficiencyBonusForLevel(level: number): number {
  return Math.ceil(level / 4) + 1;
}
