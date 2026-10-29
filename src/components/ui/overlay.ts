import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared behaviour for every modal layer (dialogs and sheets): a global layer
 * stack so only the topmost layer reacts to Esc / Tab, body scroll lock with
 * scrollbar compensation, focus moved in on open, trapped while open and
 * restored to the trigger on close.
 */

const layerStack: symbol[] = [];
let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

/** True while at least one dialog or sheet is open. */
export function hasOpenLayer(): boolean {
  return layerStack.length > 0;
}

function lockScroll(): void {
  if (lockCount++ > 0) return;
  const { body, documentElement } = document;
  savedOverflow = body.style.overflow;
  savedPaddingRight = body.style.paddingRight;
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function unlockScroll(): void {
  if (--lockCount > 0) return;
  lockCount = 0;
  document.body.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPaddingRight;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
}

interface LayerOptions {
  onClose: () => void;
  /** When false, Esc is swallowed (the layer stays) so busy work isn't cut off. */
  dismissible: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useOverlayLayer(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  { onClose, dismissible, initialFocusRef }: LayerOptions,
): void {
  // Latest callbacks/flags without re-running the open/close effect.
  const live = useRef({ onClose, dismissible });
  live.current = { onClose, dismissible };

  useEffect(() => {
    if (!open) return;
    const id = Symbol("layer");
    layerStack.push(id);
    lockScroll();

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isTop = () => layerStack[layerStack.length - 1] === id;

    const panel = panelRef.current;
    if (panel) {
      const target =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        tabbables(panel)[0] ??
        panel;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      const el = panelRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (live.current.dismissible) live.current.onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = tabbables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!el.contains(active) || active === el) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = panelRef.current;
      if (!isTop() || !el || !(e.target instanceof Node) || el.contains(e.target)) return;
      (tabbables(el)[0] ?? el).focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      const at = layerStack.indexOf(id);
      if (at >= 0) layerStack.splice(at, 1);
      unlockScroll();
      if (trigger && trigger.isConnected && trigger !== document.body) {
        trigger.focus({ preventScroll: true });
      }
    };
    // initialFocusRef/panelRef are stable refs; only `open` drives the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
