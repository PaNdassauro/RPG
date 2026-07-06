import { useLocaleStore, LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/i18n";
import { cn } from "@/lib/cn";

interface LanguageToggleProps {
  variant?: "panel" | "inline";
  className?: string;
}

export function LanguageToggle({ variant = "panel", className }: LanguageToggleProps) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const inline = variant === "inline";

  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-line p-1",
        inline ? "bg-surface/40" : "bg-surface",
        className,
      )}
      role="radiogroup"
    >
      {SUPPORTED_LOCALES.map((id) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => void setLocale(id as Locale)}
            className={cn(
              "rounded-sm px-3 py-1 font-display text-[10px] uppercase tracking-[0.3em] transition",
              active
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-text",
            )}
          >
            {LOCALE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
