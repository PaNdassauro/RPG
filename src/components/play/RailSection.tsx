import { useId, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseOpenState, RAIL_STORAGE_KEY } from "@/lib/worldRail";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const DURATION_MS = 200;

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

/**
 * Open/closed memory shared by every mounted rail (desktop column and mobile
 * sheet), persisted to localStorage. Storage can throw (private windows,
 * blocked site data), so every access is guarded and the rail still works.
 */
let remembered: Record<string, boolean> | null = null;
const listeners = new Set<() => void>();

function readRemembered(): Record<string, boolean> {
  if (remembered === null) {
    try {
      remembered = parseOpenState(window.localStorage.getItem(RAIL_STORAGE_KEY));
    } catch {
      remembered = {};
    }
  }
  return remembered;
}

function setRemembered(id: string, open: boolean): void {
  remembered = { ...readRemembered(), [id]: open };
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // Not persisted; the in-memory state still drives this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** [open, setOpen] for one named section; `defaultOpen` applies until the player chooses. */
export function useRailOpen(id: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => readRemembered()[id] ?? defaultOpen,
    () => defaultOpen,
  );
  return [open, (next) => setRemembered(id, next)];
}

/** Height-animated disclosure body (grid 0fr to 1fr). Hidden content leaves the tab order. */
export function Collapse({
  open,
  id,
  labelledBy,
  children,
}: {
  open: boolean;
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      className="grid transition-[grid-template-rows]"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transitionDuration: `${DURATION_MS}ms`,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      {/* The 4px of padding (pulled back by the negative margin) keeps focus rings from being clipped. */}
      <div
        className="-m-1 min-h-0 overflow-hidden p-1"
        style={{
          visibility: open ? "visible" : "hidden",
          transition: open ? "none" : `visibility 0s linear ${DURATION_MS}ms`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface RailSectionProps {
  /** Stable id: names the persisted open state. */
  id: string;
  title: string;
  icon: ReactNode;
  /** Shown beside the title when set. */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsible rail section: gold eyebrow-style title, count, chevron, animated body. */
export function RailSection({
  id,
  title,
  icon,
  count,
  defaultOpen = true,
  children,
}: RailSectionProps) {
  const [open, setOpen] = useRailOpen(id, defaultOpen);
  const uid = useId();
  const headId = `${uid}-head`;
  const bodyId = `${uid}-body`;
  return (
    <section>
      <h3 id={headId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className={cn(
            "group -mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 ease-out hover:bg-surface-elevated/60",
            FOCUS_RING,
          )}
        >
          <span className="text-accent-muted [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
            {icon}
          </span>
          <span className="font-display text-[13px] uppercase leading-none tracking-[0.15em] text-accent-muted">
            {title}
          </span>
          {count !== undefined && (
            <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-xs leading-none text-text-muted">
              {count}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ease-out",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </h3>
      <Collapse open={open} id={bodyId} labelledBy={headId}>
        <div className="pt-1">{children}</div>
      </Collapse>
    </section>
  );
}
