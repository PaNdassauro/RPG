import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { rollExpression } from "@/engine/dice";
import { useSessionStore } from "@/state/sessionStore";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

const QUICK_DICE = [
  { label: "d4", expr: "1d4" },
  { label: "d6", expr: "1d6" },
  { label: "d8", expr: "1d8" },
  { label: "d10", expr: "1d10" },
  { label: "d12", expr: "1d12" },
  { label: "d20", expr: "1d20" },
  { label: "d100", expr: "1d100" },
];

interface DiceTrayProps {
  open: boolean;
  onClose: () => void;
}

export function DiceTray({ open, onClose }: DiceTrayProps) {
  const t = useT();
  const [custom, setCustom] = useState("2d6+1");
  const [error, setError] = useState<string | null>(null);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);

  async function roll(expr: string, label?: string) {
    if (!campaignId) return;
    setError(null);
    try {
      const result = rollExpression(expr);
      const ts = Date.now();
      const rollRecord: DiceRollRecord = {
        id: newId(),
        expression: result.expression,
        mode: null,
        rolls: result.rolls,
        kept: result.kept,
        modifier: result.modifier,
        total: result.total,
        isCritical: result.isCritical,
        isFumble: result.isFumble,
        purpose: label ?? "manual",
        dc: null,
        ts,
      };
      const sysMsg: ChatMessage = {
        id: newId(),
        campaignId,
        role: "system",
        content: label
          ? t("play.diceTray.manualPrefix", { label })
          : t("play.diceTray.manual"),
        toolCallIds: [],
        diceRollIds: [rollRecord.id],
        ts,
      };
      await appendDiceRoll(sysMsg, rollRecord);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bad expression");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className="absolute bottom-full right-0 mb-2 w-[300px] rounded-md border border-accent-muted/40 bg-surface/95 p-4 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center justify-between">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("play.diceTray.title")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {QUICK_DICE.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => roll(d.expr, d.label)}
                className="rounded-md border border-line bg-surface-elevated px-2 py-1.5 font-mono text-xs text-text transition hover:border-accent-muted hover:bg-surface"
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-1.5">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  roll(custom, custom);
                }
              }}
              placeholder="2d6+1"
              className={cn(
                "flex-1 rounded-md border bg-surface-elevated px-2 py-1.5 font-mono text-xs text-text focus:outline-none",
                error
                  ? "border-danger/60"
                  : "border-line focus:border-accent-muted",
              )}
            />
            <button
              type="button"
              onClick={() => roll(custom, custom)}
              className="rounded-md border border-accent-muted/60 bg-accent/15 px-3 font-display text-[11px] uppercase tracking-widest text-accent hover:bg-accent/25"
            >
              {t("play.diceTray.rollButton")}
            </button>
          </div>
          {error && (
            <p className="mt-2 font-mono text-[10px] text-danger">{error}</p>
          )}
          <p className="mt-3 font-mono text-[10px] text-text-muted/60">
            {t("play.diceTray.hint")}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RecentRollsRail() {
  const t = useT();
  const messages = useSessionStore((s) => s.messages);
  const diceRolls = useSessionStore((s) => s.diceRolls);

  const recent = messages
    .filter((m) => m.diceRollIds.length > 0)
    .slice(-4)
    .reverse();

  if (recent.length === 0) {
    return (
      <p className="text-center text-[10px] uppercase tracking-[0.3em] text-text-muted/40">
        {t("play.recentRolls.none")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {recent.map((m) => {
        const r = diceRolls[m.diceRollIds[0]!];
        if (!r) return null;
        return (
          <li
            key={m.id}
            className="rounded-md border border-line/60 bg-surface px-3 py-2 font-mono text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{r.expression}</span>
              <span
                className={cn(
                  "text-base",
                  r.isCritical
                    ? "text-accent"
                    : r.isFumble
                      ? "text-danger"
                      : "text-text",
                )}
              >
                {r.total}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-text-muted/60">
              {r.purpose ?? "manual"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
