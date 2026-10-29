import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { rollExpression } from "@/engine/dice";
import { useSessionStore } from "@/state/sessionStore";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import { cn } from "@/lib/cn";
import { CloseButton } from "@/components/ui/CloseButton";
import { hasOpenLayer } from "@/components/ui/overlay";

const QUICK_DICE = [
  { label: "d4", expr: "1d4" },
  { label: "d6", expr: "1d6" },
  { label: "d8", expr: "1d8" },
  { label: "d10", expr: "1d10" },
  { label: "d12", expr: "1d12" },
  { label: "d20", expr: "1d20" },
  { label: "d100", expr: "1d100" },
];

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

interface DiceTrayProps {
  /** Id the trigger points at with aria-controls. */
  id: string;
  open: boolean;
  onClose: () => void;
  /** The button that toggles the tray: excluded from outside-press and refocused on Esc. */
  triggerRef: RefObject<HTMLElement | null>;
}

export function DiceTray({ id, open, onClose, triggerRef }: DiceTrayProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState("2d6+1");
  const [error, setError] = useState<string | null>(null);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendDiceRoll = useSessionStore((s) => s.appendDiceRoll);

  // Esc and a press outside close the popover (Esc yields to any open dialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || hasOpenLayer()) return;
      e.preventDefault();
      triggerRef.current?.focus();
      onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, triggerRef]);

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
          ref={panelRef}
          id={id}
          role="group"
          aria-label={t("play.diceTray.title")}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: "easeOut" } }}
          style={{ transformOrigin: "bottom right" }}
          className="absolute bottom-full right-0 z-20 mb-2 w-[min(300px,calc(100vw-2rem))] rounded-md border border-accent-muted/40 bg-surface/95 p-4 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center justify-between">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-accent-muted">
              {t("play.diceTray.title")}
            </p>
            <CloseButton onClick={onClose} className="h-8 w-8" />
          </header>

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {QUICK_DICE.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => roll(d.expr, d.label)}
                className={cn(
                  "min-h-9 rounded-md border border-line bg-surface-elevated px-2 py-1.5 font-mono text-xs text-text transition-colors duration-150 ease-out hover:border-accent-muted hover:bg-surface active:scale-[0.97]",
                  FOCUS,
                )}
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
              aria-label={t("play.diceTray.expressionLabel")}
              aria-invalid={error ? true : undefined}
              className={cn(
                "min-w-0 flex-1 rounded-md border bg-surface-elevated px-2 py-1.5 font-mono text-base text-text sm:text-sm",
                FOCUS,
                error
                  ? "border-danger/60"
                  : "border-line focus:border-accent-muted",
              )}
            />
            <button
              type="button"
              onClick={() => roll(custom, custom)}
              className={cn(
                "min-h-9 rounded-md border border-accent-muted/60 bg-accent/15 px-3 font-display text-xs uppercase tracking-widest text-accent transition-colors duration-150 ease-out hover:bg-accent/25 active:scale-[0.97]",
                FOCUS,
              )}
            >
              {t("play.diceTray.rollButton")}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 font-mono text-xs text-danger">{error}</p>
          )}
          <p className="mt-3 font-mono text-xs text-text-muted/80">
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
      <p className="text-center text-xs uppercase tracking-[0.3em] text-text-muted/80">
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
            <p className="mt-0.5 text-xs text-text-muted/80">
              {r.purpose ?? "manual"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
