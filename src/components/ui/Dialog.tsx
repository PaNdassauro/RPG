import { createContext, useContext, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useOverlayLayer } from "@/components/ui/overlay";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

const TitleIdContext = createContext<string | undefined>(undefined);

/** Heading that names the surrounding Dialog/Sheet (wired via aria-labelledby). */
export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const id = useContext(TitleIdContext);
  return (
    <h2 id={id} className={className}>
      {children}
    </h2>
  );
}

interface LayerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name when the layer has no <DialogTitle>. */
  ariaLabel?: string;
  /** false: Esc and backdrop clicks are ignored (e.g. while saving). Default true. */
  dismissible?: boolean;
  /** Element to focus on open. Defaults to `[data-autofocus]`, then the first tabbable. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Classes for the panel itself. */
  className?: string;
  children: ReactNode;
}

/**
 * Centered modal. role="dialog" + aria-modal, focus trapped and restored,
 * scroll locked, Esc closes only the topmost layer. Mounts content only while
 * open, so a closed dialog never sits in the tab order.
 * Enter: scale .95→1 + fade, ease-out ~200ms. Exit is faster. Modals keep a
 * centered transform-origin because they aren't anchored to a trigger.
 */
export function Dialog({
  open,
  onClose,
  ariaLabel,
  dismissible = true,
  initialFocusRef,
  className,
  children,
}: LayerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayLayer(open, panelRef, { onClose, dismissible, initialFocusRef });

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: "easeOut" } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: "easeOut" } }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (dismissible && e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: "easeOut" } }}
            className={cn(
              "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_0_80px_-20px_rgba(212,175,55,0.4)] outline-none",
              className,
            )}
          >
            <TitleIdContext.Provider value={titleId}>{children}</TitleIdContext.Provider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface SheetProps extends LayerProps {
  side: "left" | "right";
}

/**
 * Edge-anchored drawer built on the same layer behaviour as Dialog. Slides in
 * from its edge (ease-drawer ~300ms), leaves faster. Unmounted while closed.
 */
export function Sheet({
  open,
  onClose,
  side,
  ariaLabel,
  dismissible = true,
  initialFocusRef,
  className,
  children,
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useOverlayLayer(open, panelRef, { onClose, dismissible, initialFocusRef });
  const offscreen = side === "left" ? "-100%" : "100%";

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            aria-hidden="true"
            onMouseDown={() => dismissible && onClose()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: "easeOut" } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
            className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px]"
          />
          <motion.aside
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : titleId}
            tabIndex={-1}
            initial={{ x: offscreen }}
            animate={{ x: 0, transition: { duration: 0.3, ease: EASE_DRAWER } }}
            exit={{ x: offscreen, transition: { duration: 0.2, ease: EASE_DRAWER } }}
            className={cn(
              "fixed inset-y-0 z-50 flex flex-col border-line bg-surface/95 backdrop-blur outline-none",
              side === "left"
                ? "left-0 border-r shadow-[12px_0_40px_-12px_rgba(0,0,0,0.6)]"
                : "right-0 border-l shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.6)]",
              className,
            )}
          >
            <TitleIdContext.Provider value={titleId}>{children}</TitleIdContext.Provider>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
