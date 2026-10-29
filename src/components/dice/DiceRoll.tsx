import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DiceFace } from "./DiceFace";
import { formatExpression } from "@/engine/dice";
import type { DieRoll, DiceRollResult } from "@/engine/types";
import { playDiceClack } from "@/state/soundStore";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n";

interface DiceRollProps {
  result: DiceRollResult;
  dc?: number | null;
  /**
   * Authoritative outcome from the engine's resolution. When omitted the verdict
   * falls back to `total >= dc`. A natural 20/1 only adds flavor (the "Critical" /
   * "Fumble" words) and never flips the outcome.
   */
  success?: boolean | null;
  /** Set false for replayed history so reloading a campaign doesn't read out every old roll. */
  announce?: boolean;
  autoPlay?: boolean;
  onComplete?: () => void;
}

type Phase = "drop" | "tumble" | "settle" | "modifier" | "verdict" | "done";

const TUMBLE_MS = 700;
const SETTLE_MS = 120;
const MODIFIER_DELAY_MS = 260;

export function DiceRoll({
  result,
  dc = null,
  success: successProp,
  announce = true,
  autoPlay = true,
  onComplete,
}: DiceRollProps) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduceMotion ? "done" : "drop");
  const [tick, setTick] = useState(0);

  // Cycle faces during tumble.
  useEffect(() => {
    if (phase !== "tumble") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60);
    return () => window.clearInterval(id);
  }, [phase]);

  // Phase scheduler.
  useEffect(() => {
    if (!autoPlay || reduceMotion) return;
    if (phase === "drop") {
      const t = window.setTimeout(() => {
        playDiceClack();
        setPhase("tumble");
      }, 200);
      return () => window.clearTimeout(t);
    }
    if (phase === "tumble") {
      const t = window.setTimeout(() => setPhase("settle"), TUMBLE_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "settle") {
      const t = window.setTimeout(() => setPhase("modifier"), SETTLE_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "modifier") {
      const t = window.setTimeout(() => setPhase("verdict"), MODIFIER_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "verdict") {
      const t = window.setTimeout(() => {
        setPhase("done");
        onComplete?.();
      }, 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, autoPlay, reduceMotion, onComplete]);

  const success = useMemo(() => {
    if (dc == null) return null;
    return successProp ?? result.total >= dc;
  }, [dc, successProp, result.total]);

  // Crit/fumble words are flavor on top of the real outcome, never against it.
  const verdictWord =
    success == null
      ? ""
      : success
        ? result.isCritical
          ? t("dice.verdict.critical")
          : t("dice.verdict.success")
        : result.isFumble
          ? t("dice.verdict.fumble")
          : t("dice.verdict.failure");

  // Screen readers get one polite line when the roll lands; the animated
  // visuals below are aria-hidden so nothing is read twice or mid-tumble.
  const announcement =
    announce && phase === "done"
      ? dc != null && success != null
        ? t("dice.announceDc", {
            expression: formatExpression(result.expression, result.mode),
            total: result.total,
            dc,
            verdict: verdictWord,
          })
        : t("dice.announce", {
            expression: formatExpression(result.expression, result.mode),
            total: result.total,
          })
      : "";
  const [liveText, setLiveText] = useState("");
  useEffect(() => {
    setLiveText(announcement);
  }, [announcement]);

  const settled = phase === "settle" || phase === "modifier" || phase === "verdict" || phase === "done";
  const showModifier = phase === "modifier" || phase === "verdict" || phase === "done";
  const showVerdict = (phase === "verdict" || phase === "done") && dc != null;
  const showDie = phase !== "drop";

  // Layout sizing: scale dice down as count grows so 8d6 still fits.
  const dieCount = result.rolls.length;
  const dieSize = dieCount <= 2 ? 88 : dieCount <= 4 ? 72 : dieCount <= 6 ? 60 : 52;

  const isKeptDie = (die: DieRoll, idx: number) => isKept(result, die, idx);

  const fumbleShake = result.isFumble && settled && dieCount === 1;
  const heroCrit = result.isCritical && settled;

  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Crit gold radial bloom — anchored to the dice row when there's one hero die. */}
      <div className="relative" aria-hidden="true">
        <AnimatePresence>
          {heroCrit && dieCount === 1 && (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(212,175,55,0.55) 0%, rgba(212,175,55,0) 65%)",
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.9, 0.6], scale: [0.6, 1.2, 1.05] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        <motion.div
          className="relative flex flex-wrap items-center justify-center gap-2"
          style={{ minHeight: dieSize + 12 }}
          animate={fumbleShake ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }}
          transition={fumbleShake ? { duration: 0.32, ease: "easeOut" } : { duration: 0 }}
        >
          <AnimatePresence>
            {showDie &&
              result.rolls.map((die, idx) => (
                <DieRollVisual
                  key={idx}
                  die={die}
                  idx={idx}
                  size={dieSize}
                  phase={phase}
                  tick={tick}
                  reduceMotion={!!reduceMotion}
                  kept={isKeptDie(die, idx)}
                  isHero={dieCount === 1}
                  showCrit={result.isCritical && dieCount === 1}
                  showFumble={result.isFumble && dieCount === 1}
                />
              ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Roll details */}
      <div className="flex min-h-[2rem] flex-col items-center gap-1" aria-hidden="true">
        <p className="font-mono text-xs text-text-muted">
          {formatExpression(result.expression, result.mode)}
          {result.mode && (
            <span className="ml-2 text-text-muted/80">
              [{result.rolls.map((r) => r.value).join(", ")} → {result.kept[0]?.value}]
            </span>
          )}
        </p>

        <AnimatePresence>
          {showModifier && (
            <motion.p
              key="modifier"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="font-display text-lg text-text"
            >
              {renderSummary(result)}
              <span className="ml-2 font-mono text-xl text-accent">= {result.total}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* DC verdict */}
      <AnimatePresence>
        {showVerdict && success != null && (
          <motion.div
            key="verdict"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            aria-hidden="true"
            className="flex w-full max-w-xs flex-col items-center gap-1"
          >
            <div className="h-px w-24 bg-accent/40" />
            <p
              className={cn(
                "font-display text-sm uppercase tracking-[0.3em]",
                success ? "text-accent" : "text-danger",
              )}
            >
              {verdictWord}
            </p>
            <p className="font-mono text-xs text-text-muted/80">{t("dice.dc", { n: dc ?? 0 })}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <p role="status" aria-live="polite" className="sr-only">
        {liveText}
      </p>
    </div>
  );
}

function DieRollVisual({
  die,
  idx,
  size,
  phase,
  tick,
  reduceMotion,
  kept,
  isHero,
  showCrit,
  showFumble,
}: {
  die: DieRoll;
  idx: number;
  size: number;
  phase: Phase;
  tick: number;
  reduceMotion: boolean;
  kept: boolean;
  isHero: boolean;
  showCrit: boolean;
  showFumble: boolean;
}) {
  const settled = phase === "settle" || phase === "modifier" || phase === "verdict" || phase === "done";

  const display = useMemo(() => {
    if (phase !== "tumble") return die.value;
    // Pseudo-random per die per tick — different from neighbors, never the resting face.
    const candidate = ((idx * 7 + tick * 13 + (die.sides - 1)) % die.sides) + 1;
    return candidate === die.value && die.sides > 1
      ? ((candidate % die.sides) + 1)
      : candidate;
  }, [phase, tick, idx, die.value, die.sides]);

  const settleScale = isHero && showCrit ? [1, 1.2, 1.08, 1.16] : [1, 1.06, 1];

  return (
    <motion.div
      key={`die-${idx}`}
      initial={reduceMotion ? false : { y: -28, opacity: 0, rotate: -12, scale: 0.8 }}
      animate={
        phase === "tumble"
          ? { y: 0, opacity: 1, rotate: 720 + (idx % 3) * 60, scale: 1 }
          : phase === "settle"
            ? { y: 0, opacity: 1, rotate: 0, scale: settleScale }
            : { y: 0, opacity: 1, rotate: 0, scale: 1 }
      }
      transition={
        phase === "tumble"
          ? { duration: TUMBLE_MS / 1000, ease: [0.2, 0.7, 0.3, 1], delay: idx * 0.02 }
          : phase === "settle"
            ? { duration: 0.5, ease: "easeOut" }
            : { duration: 0.25, ease: [0.4, 1.6, 0.5, 1] }
      }
      className="relative"
    >
      <DiceFace
        sides={die.sides}
        value={display}
        size={size}
        cracked={settled && showFumble}
        glowing={settled && showCrit && kept}
        dimmed={!kept}
      />
      {showFumble && settled && isHero && <FumbleDust />}
    </motion.div>
  );
}

function FumbleDust() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-danger"
          initial={{ opacity: 0.9, x: 0, y: 0 }}
          animate={{
            opacity: 0,
            x: (i - 4) * 6,
            y: 18 + (i % 3) * 6,
          }}
          transition={{ duration: 0.7, ease: "easeIn", delay: 0.05 * i }}
        />
      ))}
    </>
  );
}

function isKept(result: DiceRollResult, die: DieRoll, idx: number): boolean {
  if (result.mode !== "adv" && result.mode !== "dis") return true;
  // Engine emits the kept entry as the same object reference.
  if (result.kept[0] === die) return true;
  // Reference-fallback for value collisions (both d20s rolled the same number):
  // when both rolls are identical, both are visually "kept".
  if (result.rolls[0]?.value === result.rolls[1]?.value) return true;
  void idx;
  return false;
}

function renderSummary(result: DiceRollResult): React.ReactNode {
  const keptValues = result.kept.map((r) => r.value);
  const mod = result.modifier;
  const parts: string[] = [];

  if (keptValues.length === 1) {
    parts.push(String(keptValues[0]));
  } else if (keptValues.length <= 8) {
    parts.push(keptValues.join(" + "));
  } else {
    const sum = keptValues.reduce((a, b) => a + b, 0);
    parts.push(`Σ ${sum}`);
  }

  return (
    <>
      {parts[0]}
      {mod !== 0 && (
        <span className="text-text-muted">
          {" "}
          {mod > 0 ? "+" : "−"} {Math.abs(mod)}
        </span>
      )}
    </>
  );
}
