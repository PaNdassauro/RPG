import { useEffect } from "react";
import { DialogTitle, Sheet } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  children: React.ReactNode;
}

/**
 * Slide-in sheet for below `lg` only: if the viewport grows past the breakpoint
 * while it is open (rotation, window resize) it closes itself, because the
 * content is already on screen in the desktop layout.
 */
export function MobileSheet({ open, onClose, side, title, children }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <Sheet open={open} onClose={onClose} side={side} className="w-[88%] max-w-sm">
      <header className="flex items-center justify-between border-b border-line/60 px-4 py-3">
        <DialogTitle className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
          {title}
        </DialogTitle>
        <CloseButton onClick={onClose} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </Sheet>
  );
}
