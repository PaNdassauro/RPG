import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Scroll, X, RefreshCw } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RecapModal({ open, onClose }: Props) {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  const forceRecap = useSessionStore((s) => s.forceRecap);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await forceRecap();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AnimatePresence>
      {open && campaign && (
        <motion.div
          key="recap-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            key="recap-card"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.4, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_0_80px_-20px_rgba(212,170,71,0.4)]"
          >
            <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-4">
              <div>
                <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
                  <Scroll className="h-3 w-3" />
                  {t("play.recap.eyebrow")}
                </p>
                <h2 className="mt-0.5 font-display text-xl text-text">
                  {t("play.recap.title")}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-text-muted">
                  {campaign.summaryThroughTurn ?? 0} {t("play.recap.turnsCovered")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition hover:border-accent-muted hover:text-text"
                aria-label={t("common.cancel")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {campaign.rollingSummary ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                  {campaign.rollingSummary}
                </p>
              ) : (
                <p className="py-12 text-center text-sm text-text-muted/60">
                  {t("play.recap.empty")}
                </p>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-line/60 bg-canvas/30 px-6 py-3">
              <p className="text-[11px] text-text-muted/70">
                {t("play.recap.hint")}
              </p>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-accent-muted bg-accent/10 px-4 py-1.5 font-display text-[10px] uppercase tracking-[0.3em] text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <RefreshCw
                  className={cn("h-3 w-3", refreshing && "animate-spin")}
                />
                {refreshing ? t("play.recap.regenerating") : t("play.recap.regenerate")}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
