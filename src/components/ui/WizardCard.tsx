import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface WizardCardProps {
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A pickable Card used across the character-creation wizard. Selected state is
 * a gold border + subtle gold inner glow; the rest stays in the dark surface.
 */
export function WizardCard({
  selected,
  onClick,
  disabled,
  className,
  children,
}: WizardCardProps) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!selected}
      className={cn(
        "group relative w-full rounded-md border bg-surface p-4 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        interactive && "cursor-pointer hover:border-accent-muted hover:bg-surface-elevated",
        selected
          ? "border-accent shadow-[0_0_0_1px_rgba(212,175,55,0.5),0_0_24px_-8px_rgba(212,175,55,0.6)]"
          : "border-line",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
