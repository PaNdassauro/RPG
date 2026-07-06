import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { useSessionStore, type PendingReaction } from "@/state/sessionStore";
import { runDmTurn } from "@/dm/loop";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import type { ChatMessage } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

export function PendingReactionCard() {
  const t = useT();
  const pending = useSessionStore((s) => s.pendingReaction);
  const campaignId = useSessionStore((s) => s.campaignId);
  const appendMessage = useSessionStore((s) => s.appendMessage);
  const setPendingReaction = useSessionStore((s) => s.setPendingReaction);

  const respond = useCallback(
    async (use: boolean) => {
      if (!pending || !campaignId) return;
      const ts = Date.now();
      const text = use
        ? t("play.reaction.useMessage", { ability: pending.ability })
        : t("play.reaction.passMessage", { ability: pending.ability });
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
      setPendingReaction(null);
      await runDmTurn({ playerInput: text, isFirstTurn: false });
    },
    [pending, campaignId, appendMessage, setPendingReaction, t],
  );

  return (
    <AnimatePresence>
      {pending && <CardBody key={pending.id} pending={pending} respond={respond} t={t} />}
    </AnimatePresence>
  );
}

function CardBody({
  pending,
  respond,
  t,
}: {
  pending: PendingReaction;
  respond: (use: boolean) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={cn(
        "mx-auto mb-3 w-full max-w-prose rounded-md border border-danger/60 bg-surface/80 px-5 py-4 shadow-[0_0_0_1px_rgba(214,93,93,0.2),0_0_30px_-8px_rgba(214,93,93,0.5)] backdrop-blur",
      )}
    >
      <div className="flex items-start gap-3">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] uppercase tracking-[0.4em] text-danger/80">
            {t("play.reaction.requested")}
          </p>
          <p className="mt-1 font-display text-base text-text">
            {pending.ability}
          </p>
          {pending.trigger && (
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t("play.reaction.triggerLabel")}: {pending.trigger}
            </p>
          )}
          {pending.reason && (
            <p className="mt-1 text-sm leading-relaxed text-text/80">
              {pending.reason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => respond(true)}
            className={cn(
              "rounded-md border border-accent bg-accent/20 px-4 py-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-accent transition hover:bg-accent/30",
            )}
          >
            {t("play.reaction.useButton")}
          </button>
          <button
            type="button"
            onClick={() => respond(false)}
            className={cn(
              "rounded-md border border-line bg-surface px-4 py-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-text-muted transition hover:border-text-muted hover:text-text",
            )}
          >
            {t("play.reaction.passButton")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
