import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { hasOpenLayer } from "@/components/ui/overlay";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** Runs when the item is chosen. Ignored when `to` is set. */
  onSelect?: () => void;
  /** Renders the item as a router link instead of a button. */
  to?: string;
}

interface Props {
  /** Accessible name of the trigger button. */
  label: string;
  items: ActionMenuItem[];
  className?: string;
}

const ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left font-body text-sm text-text-muted outline-none hover:bg-surface-elevated hover:text-text focus-visible:bg-surface-elevated focus-visible:text-text";

/**
 * Overflow menu for header actions that don't fit on small screens. Closes on
 * Esc / outside press / selection and hands focus back to the trigger before
 * running the action, so a sheet opened from here restores focus to the
 * trigger rather than to a menu item that no longer exists. Menu items change
 * instantly (no hover transition); the panel scales in from the trigger corner.
 */
export function ActionMenu({ label, items, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hasOpenLayer()) {
        e.preventDefault();
        close(true);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % nodes.length;
    else if (e.key === "ArrowUp") next = (at - 1 + nodes.length) % nodes.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = nodes.length - 1;
    else if (e.key === "Tab") close(false);
    if (next >= 0) {
      e.preventDefault();
      nodes[next]?.focus();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition-colors duration-150 ease-out hover:border-accent-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-md border border-line bg-surface-elevated p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
        >
          {items.map((item) =>
            item.to ? (
              <Link
                key={item.key}
                to={item.to}
                role="menuitem"
                tabIndex={-1}
                className={ITEM_CLASS}
              >
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  item.onSelect?.();
                }}
                className={ITEM_CLASS}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </motion.div>
      )}
    </div>
  );
}
