import { useState } from "react";
import { Scroll, RefreshCw } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { Dialog, DialogTitle } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

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

  if (!campaign) return null;

  return (
    <Dialog open={open} onClose={onClose} className="max-h-[80dvh] max-w-2xl">
      <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-4">
        <div>
          <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            <Scroll className="h-3 w-3" />
            {t("play.recap.eyebrow")}
          </p>
          <DialogTitle className="mt-0.5 font-display text-xl text-text">
            {t("play.recap.title")}
          </DialogTitle>
          <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted">
            {campaign.summaryThroughTurn ?? 0} {t("play.recap.turnsCovered")}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {campaign.rollingSummary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
            {campaign.rollingSummary}
          </p>
        ) : (
          <p className="py-12 text-center text-sm text-text-muted/80">
            {t("play.recap.empty")}
          </p>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-line/60 bg-canvas/30 px-6 py-3">
        <p className="text-xs text-text-muted/80">
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
    </Dialog>
  );
}
