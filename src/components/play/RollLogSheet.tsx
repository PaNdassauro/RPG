import { useMemo } from "react";
import { Dices } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { DialogTitle, Sheet } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RollLogSheet({ open, onClose }: Props) {
  const t = useT();
  const diceRolls = useSessionStore((s) => s.diceRolls);
  const messages = useSessionStore((s) => s.messages);

  const ordered = useMemo(() => {
    const list = Object.values(diceRolls);
    return list.sort((a, b) => b.ts - a.ts);
  }, [diceRolls]);

  const messageById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of messages) {
      for (const rid of m.diceRollIds) map[rid] = m.content;
    }
    return map;
  }, [messages]);

  return (
    <Sheet open={open} onClose={onClose} side="left" className="w-full max-w-2xl">
      <header className="flex items-start justify-between border-b border-line/60 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            <Dices className="h-3 w-3" aria-hidden="true" />
            {t("play.rollLog.eyebrow")}
          </p>
          <DialogTitle className="mt-0.5 font-display text-xl text-text">
            {t("play.rollLog.title")}
          </DialogTitle>
          <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted">
            {ordered.length} {t("play.rollLog.totalRolls")}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {ordered.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted/80">
            {t("play.rollLog.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border bg-surface px-3 py-2",
                  r.isCritical
                    ? "border-accent/60"
                    : r.isFumble
                      ? "border-danger/60"
                      : "border-line/60",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[11px] uppercase tracking-widest text-text-muted">
                    {r.purpose ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-lg",
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
                <div className="mt-1 flex items-center justify-between font-mono text-xs text-text-muted/80">
                  <span>
                    {r.expression}
                    {r.mode && ` (${r.mode})`}
                    {r.dc != null && (
                      <span className="ml-2 text-text-muted/80">
                        vs {r.dc}
                      </span>
                    )}
                  </span>
                  <span className="text-text-muted/80">
                    {new Date(r.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {messageById[r.id] && (
                  <p className="mt-1.5 text-xs leading-relaxed text-text-muted/80">
                    {messageById[r.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
