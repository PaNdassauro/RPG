import { useCallback, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Skull, Sparkles, BookOpen } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { runDmTurn } from "@/dm/loop";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import type { ChatMessage } from "@/schemas/campaign";
import { cn } from "@/lib/cn";
import { useOverlayLayer } from "@/components/ui/overlay";

export function DeathScreen() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingDeath);
  const campaignId = useSessionStore((s) => s.campaignId);
  const character = useSessionStore((s) => s.character);
  const appendMessage = useSessionStore((s) => s.appendMessage);
  const setPendingDeath = useSessionStore((s) => s.setPendingDeath);
  const reviveToHalf = useSessionStore((s) => s.reviveToHalf);
  const endCampaign = useSessionStore((s) => s.endCampaign);

  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Not dismissible: the player must pick an ending. Still a real modal layer
  // (focus trapped, scroll locked, sits above every dialog and sheet).
  useOverlayLayer(!!pending, panelRef, { onClose: () => undefined, dismissible: false });

  const sendChoice = useCallback(
    async (text: string): Promise<void> => {
      if (!campaignId) return;
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
      await appendMessage(playerMsg);
      await runDmTurn({ playerInput: text, isFirstTurn: false });
    },
    [campaignId, appendMessage],
  );

  const handleEnd = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPendingDeath(null);
    await sendChoice(t("play.death.endingMessage"));
    await endCampaign();
    setBusy(false);
  }, [busy, sendChoice, setPendingDeath, endCampaign, t]);

  const handleTwist = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPendingDeath(null);
    await sendChoice(t("play.death.twistMessage"));
    await reviveToHalf();
    setBusy(false);
  }, [busy, sendChoice, setPendingDeath, reviveToHalf, t]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="death-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-canvas/95 backdrop-blur-sm"
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.96, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 180, damping: 22 }}
            className="mx-6 flex w-full max-w-xl flex-col items-center gap-6 outline-none rounded-md border border-danger/50 bg-surface/80 px-8 py-10 text-center shadow-[0_0_60px_-12px_rgba(214,93,93,0.5),0_0_120px_-30px_rgba(214,93,93,0.4)]"
          >
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <Skull className="h-10 w-10 text-danger/80" aria-hidden="true" />
            </motion.div>

            <div className="flex flex-col gap-2">
              <p className="font-display text-[10px] uppercase tracking-[0.5em] text-danger">
                {t("play.death.eyebrow")}
              </p>
              <h2 id={titleId} className="font-display text-3xl text-text">
                {t("play.death.title", { name: character?.name ?? "" })}
              </h2>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
                {t("play.death.body")}
              </p>
            </div>

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row">
              <ChoiceButton
                icon={<BookOpen className="h-4 w-4" />}
                title={t("play.death.endChoice")}
                hint={t("play.death.endChoiceHint")}
                onClick={handleEnd}
                disabled={busy}
                tone="muted"
              />
              <ChoiceButton
                icon={<Sparkles className="h-4 w-4" />}
                title={t("play.death.twistChoice")}
                hint={t("play.death.twistChoiceHint")}
                onClick={handleTwist}
                disabled={busy}
                tone="accent"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ChoiceButtonProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "muted" | "accent";
}

function ChoiceButton({ icon, title, hint, onClick, disabled, tone }: ChoiceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex flex-1 flex-col items-start gap-1.5 rounded-md border bg-surface/60 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "accent"
          ? "border-accent/60 hover:border-accent hover:bg-accent/10 hover:shadow-[0_0_24px_-6px_rgba(212,175,55,0.5)]"
          : "border-line/70 hover:border-text-muted hover:bg-surface",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 font-display text-xs uppercase tracking-[0.3em]",
          tone === "accent" ? "text-accent" : "text-text-muted",
        )}
      >
        {icon}
        {title}
      </div>
      <p className="text-xs leading-relaxed text-text-muted/80">{hint}</p>
    </button>
  );
}
