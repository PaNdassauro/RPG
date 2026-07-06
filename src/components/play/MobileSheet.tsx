import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  children: React.ReactNode;
}

/**
 * Lightweight slide-in sheet for mobile only. Mounted always (display
 * controlled by transform classes) so it never gets stuck mid-animation.
 */
export function MobileSheet({ open, onClose, side, title, children }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[88%] max-w-sm flex-col border-line bg-surface/95 shadow-[0_0_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition-transform duration-300 ease-out lg:hidden",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          open
            ? "translate-x-0 pointer-events-auto"
            : side === "left"
              ? "-translate-x-full pointer-events-none"
              : "translate-x-full pointer-events-none",
        )}
      >
        <header className="flex items-center justify-between border-b border-line/60 px-4 py-3">
          <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition hover:border-accent-muted hover:text-text"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
