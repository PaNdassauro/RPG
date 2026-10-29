import { X } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

interface Props {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/** Square icon button used in every dialog/sheet header. */
export function CloseButton({ onClick, disabled, className }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("common.close")}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition-colors duration-150 ease-out hover:border-accent-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] disabled:opacity-50 lg:h-8 lg:w-8",
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
