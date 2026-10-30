import { useEffect, useId, useRef, useState } from "react";
import { Dices, Send, Sword, Zap, Flag, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "@/state/sessionStore";
import { runDmTurn } from "@/dm/loop";
import { DiceTray } from "./DiceTray";
import { newId } from "@/lib/id";
import { isRetryOfLastPlayerMessage } from "@/lib/playerMessage";
import { watchElapsed } from "@/lib/watchElapsed";
import { useT } from "@/i18n";
import type { ChatMessage } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

/** A turn this slow gets a "Cancel" control; the provider watchdog gives up on its own after 45 s of silence. */
const CANCEL_AFTER_MS = 20_000;

/** True once the current turn has been running for `thresholdMs`; false while idle. */
function useBusyPast(since: number | null, thresholdMs: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    setPast(false);
    if (since === null) return;
    return watchElapsed(since, thresholdMs, () => setPast(true));
  }, [since, thresholdMs]);
  return since !== null && past;
}

interface ActionBarProps {
  onSubmit: (text: string) => Promise<void> | void;
  disabled?: boolean;
}

export function ActionBar({ onSubmit, disabled }: ActionBarProps) {
  const t = useT();
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendMessage = useSessionStore((s) => s.appendMessage);
  const streaming = useSessionStore((s) => s.streaming);
  const thinking = useSessionStore((s) => s.thinking);
  const storeBusy = useSessionStore((s) => s.busy);
  const busySince = useSessionStore((s) => s.busySince);
  const turnError = useSessionStore((s) => s.turnError);
  const abortTurn = useSessionStore((s) => s.abortTurn);
  const encounter = useSessionStore((s) => s.encounter);
  const { actionEconomy, consumeAction, resetActionEconomy } = useSessionStore(
    useShallow((s) => ({
      actionEconomy: s.actionEconomy,
      consumeAction: s.consumeAction,
      resetActionEconomy: s.resetActionEconomy,
    })),
  );
  const [value, setValue] = useState("");
  const [diceOpen, setDiceOpen] = useState(false);
  const [pendingSlots, setPendingSlots] = useState<{
    action: boolean;
    bonus: boolean;
  }>({ action: false, bonus: false });
  const taRef = useRef<HTMLTextAreaElement>(null);
  const diceTriggerRef = useRef<HTMLButtonElement>(null);
  const diceTrayId = useId();
  // Synchronous guard: Cmd/Ctrl+Enter can fire twice before React re-renders
  // with the cleared textarea or the store's `busy` flag.
  const submittingRef = useRef(false);

  // The textarea stays editable while the DM answers (you can draft your next
  // move); only submitting is gated on the DM turn being idle.
  const busy = !!disabled || storeBusy || streaming || thinking;
  const inCombat = !!encounter;
  const slowTurn = useBusyPast(storeBusy ? busySince : null, CANCEL_AFTER_MS);

  function appendTagged(slot: "action" | "bonus", label: string) {
    if (busy) return;
    if (actionEconomy[slot]) return;
    setPendingSlots((s) => ({ ...s, [slot]: true }));
    setValue((v) => {
      const tag = `[${label}] `;
      if (v.startsWith(tag) || v.includes(`\n${tag}`)) return v;
      return v.length === 0 ? tag : `${v.replace(/\s+$/, "")}\n${tag}`;
    });
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
    });
  }

  async function handleSubmit() {
    const text = value.trim();
    if (!text || busy || !campaignId || submittingRef.current) return;
    submittingRef.current = true;
    setValue("");
    if (inCombat) {
      if (pendingSlots.action) consumeAction("action");
      if (pendingSlots.bonus) consumeAction("bonus");
      setPendingSlots({ action: false, bonus: false });
    }
    const ts = Date.now();
    const playerMsg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "player",
      content: text,
      toolCallIds: [],
      diceRollIds: [],
      ts,
    };
    try {
      // A retry of an unanswered action re-runs the turn on the message that
      // is already in the log instead of logging the same words twice.
      if (!isRetryOfLastPlayerMessage(useSessionStore.getState().messages, text)) {
        await appendMessage(playerMsg);
      }
      await onSubmit(text);
    } finally {
      submittingRef.current = false;
    }
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function handleFinishTurn() {
    if (busy || !campaignId || submittingRef.current) return;
    submittingRef.current = true;
    const remainder = value.trim();
    setValue("");
    setPendingSlots({ action: false, bonus: false });
    resetActionEconomy();
    const endText = t("play.combat.endTurnMessage");
    const content = remainder.length > 0 ? `${remainder}\n${endText}` : endText;
    const ts = Date.now();
    const playerMsg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "player",
      content,
      toolCallIds: [],
      diceRollIds: [],
      ts,
    };
    try {
      if (!isRetryOfLastPlayerMessage(useSessionStore.getState().messages, content)) {
        await appendMessage(playerMsg);
      }
      await runDmTurn({ playerInput: content, isFirstTurn: false });
    } finally {
      submittingRef.current = false;
    }
    requestAnimationFrame(() => taRef.current?.focus());
  }

  return (
    <div className="border-t border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex max-w-prose flex-col gap-2 px-1 py-3">
        <div className="relative flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {inCombat ? (
              <>
                <AmmoChip
                  icon={<Sword className="h-3.5 w-3.5" />}
                  label={t("play.combat.actionChip")}
                  used={actionEconomy.action}
                  pending={pendingSlots.action}
                  onClick={() => appendTagged("action", t("play.combat.actionTag"))}
                  disabled={busy}
                />
                <AmmoChip
                  icon={<Zap className="h-3.5 w-3.5" />}
                  label={t("play.combat.bonusChip")}
                  used={actionEconomy.bonus}
                  pending={pendingSlots.bonus}
                  onClick={() => appendTagged("bonus", t("play.combat.bonusTag"))}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <QuickAction
                  label={t("play.quickActions.lookAround")}
                  onClick={() => setValue(t("play.quickActions.lookAroundFill"))}
                  disabled={busy}
                />
                <QuickAction
                  label={t("play.quickActions.listen")}
                  onClick={() => setValue(t("play.quickActions.listenFill"))}
                  disabled={busy}
                />
                <QuickAction
                  label={t("play.quickActions.search")}
                  onClick={() => setValue(t("play.quickActions.searchFill"))}
                  disabled={busy}
                />
              </>
            )}
          </div>
          <div className="relative">
            <button
              ref={diceTriggerRef}
              type="button"
              onClick={() => setDiceOpen((v) => !v)}
              aria-expanded={diceOpen}
              aria-controls={diceTrayId}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1 font-display text-[10px] uppercase tracking-widest transition-colors duration-150 ease-out active:scale-[0.97]",
                FOCUS,
                diceOpen
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-accent",
              )}
            >
              <Dices className="h-3.5 w-3.5" aria-hidden="true" />
              {t("play.diceButton")}
            </button>
            <DiceTray
              id={diceTrayId}
              open={diceOpen}
              onClose={() => setDiceOpen(false)}
              triggerRef={diceTriggerRef}
            />
          </div>
        </div>

        {slowTurn ? (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-text-muted"
          >
            <span>{t("play.turn.slowHint")}</span>
            <button
              type="button"
              onClick={() => abortTurn()}
              title={t("play.turn.cancelTitle")}
              className={cn(
                "flex min-h-8 items-center gap-1.5 rounded-md border border-danger/60 bg-danger/10 px-2.5 font-display text-[10px] uppercase tracking-widest text-danger transition-colors duration-150 ease-out hover:bg-danger/20 active:scale-[0.97]",
                FOCUS,
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t("play.turn.cancel")}
            </button>
          </div>
        ) : turnError ? (
          <p
            role="alert"
            className="rounded-md border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs text-danger"
          >
            {turnError}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              busy
                ? t("play.actionPlaceholderBusy")
                : inCombat
                  ? t("play.actionPlaceholderCombat")
                  : t("play.actionPlaceholder")
            }
            rows={2}
            aria-label={t("play.actionLabel")}
            className={cn(
              "flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-base leading-relaxed text-text placeholder:text-text-muted/60 focus:border-accent-muted sm:text-sm",
              FOCUS,
            )}
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || value.trim().length === 0}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md border border-accent-muted/60 bg-accent/15 text-accent transition-colors duration-150 ease-out hover:bg-accent/25 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS,
              )}
              title={t("play.sendTitle")}
              aria-label={t("play.sendTitle")}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
            {inCombat && (
              <button
                type="button"
                onClick={handleFinishTurn}
                disabled={busy}
                className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-danger/60 bg-danger/10 px-2.5 font-display text-[10px] uppercase tracking-[0.25em] text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={t("play.combat.finishTurnTitle")}
              >
                <Flag className="h-3.5 w-3.5" />
                {t("play.combat.finishTurn")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-9 rounded-md border border-line bg-surface px-3 font-body text-xs text-text-muted transition-colors duration-150 ease-out hover:border-accent-muted hover:text-text active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        FOCUS,
      )}
    >
      {label}
    </button>
  );
}

interface AmmoChipProps {
  icon: React.ReactNode;
  label: string;
  used: boolean;
  pending: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Available = solid filled pip + crisp text + gold border on hover.
 * Pending (queued for current submission) = gold filled pip + glow.
 * Used (consumed this turn) = hollow pip, muted text, no hover.
 */
function AmmoChip({ icon, label, used, pending, onClick, disabled }: AmmoChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || used}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.25em] transition-colors duration-150 ease-out",
        FOCUS,
        used
          ? "border-line/60 bg-surface text-text-muted/80"
          : pending
            ? "border-accent bg-accent/20 text-accent shadow-[0_0_12px_-2px_rgba(212,175,55,0.5)]"
            : "border-line bg-surface text-text hover:border-accent-muted",
        "disabled:cursor-not-allowed",
      )}
    >
      <Pip used={used} pending={pending} />
      {icon}
      {label}
    </button>
  );
}

function Pip({ used, pending }: { used: boolean; pending: boolean }) {
  if (used) {
    return (
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full border border-text-muted/80"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        pending ? "bg-accent shadow-[0_0_6px_rgba(212,175,55,0.7)]" : "bg-accent",
      )}
    />
  );
}
