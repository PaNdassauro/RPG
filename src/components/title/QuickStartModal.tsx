import { useEffect, useId, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { Dialog, DialogTitle } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

interface ClassMeta {
  index: string;
  name: string;
  hit_die: number;
  savingThrows: string[];
}

const CLASS_IDS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}

export function QuickStartModal({ open, onClose, onCreated }: Props) {
  const t = useT();
  const nameId = useId();
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassMeta[] | null>(null);

  // Lazy-load SRD class data only when the modal opens, so the title screen
  // doesn't have to pull the SRD eagerly on every visit.
  useEffect(() => {
    if (!open || classes) return;
    let cancelled = false;
    void (async () => {
      const { getClass } = await import("@/data/srd");
      if (cancelled) return;
      const list: ClassMeta[] = CLASS_IDS.map((cid) => {
        const k = getClass(cid);
        if (!k) return null;
        return {
          index: k.index,
          name: k.name,
          hit_die: k.hit_die,
          savingThrows: k.saving_throws.map((s) => s.index),
        };
      }).filter((m): m is ClassMeta => m !== null);
      setClasses(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classes]);

  // Reset state whenever modal opens.
  useEffect(() => {
    if (open) {
      setName("");
      setClassId(null);
      setError(null);
      setCreating(false);
    }
  }, [open]);

  const canStart = name.trim().length > 0 && classId !== null && !creating;

  async function start() {
    if (!canStart || !classId) return;
    setCreating(true);
    setError(null);
    try {
      const { createQuickStartCampaign } = await import("@/state/quickStart");
      const { campaignId } = await createQuickStartCampaign({
        name: name.trim(),
        classId,
      });
      onCreated(campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} dismissible={!creating} className="max-w-2xl">
      <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-5">
        <div>
          <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            <Zap className="h-3 w-3" />
            {t("quickStart.eyebrow")}
          </p>
          <DialogTitle className="mt-0.5 font-display text-2xl text-text">
            {t("quickStart.title")}
          </DialogTitle>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-text-muted">
            {t("quickStart.intro")}
          </p>
        </div>
        <CloseButton onClick={onClose} disabled={creating} />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Section title={t("quickStart.nameLabel")} htmlFor={nameId}>
          <input
            id={nameId}
            type="text"
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canStart) start();
            }}
            placeholder={t("quickStart.namePlaceholder")}
            maxLength={60}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/60 focus:border-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
          />
        </Section>

        <Section title={t("quickStart.classLabel")}>
          {!classes ? (
            <p className="py-4 text-center text-xs text-text-muted/80">
              {t("common.loading")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {classes.map((k) => {
                const selected = classId === k.index;
                return (
                  <li key={k.index}>
                    <button
                      type="button"
                      onClick={() => setClassId(k.index)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition",
                        selected
                          ? "border-accent bg-accent/15"
                          : "border-line bg-surface hover:border-accent-muted/60",
                      )}
                    >
                      <span
                        className={cn(
                          "font-display text-sm",
                          selected ? "text-accent" : "text-text",
                        )}
                      >
                        {k.name}
                      </span>
                      <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
                        d{k.hit_die} · {k.savingThrows.join(" / ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <p className="text-xs leading-relaxed text-text-muted/80">
          {t("quickStart.defaultsHint")}
        </p>

        {error && (
          <p className="mt-3 text-xs text-danger">{error}</p>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-line/60 bg-canvas/30 px-6 py-3.5">
        <button
          type="button"
          onClick={() => !creating && onClose()}
          disabled={creating}
          className="font-display text-xs uppercase tracking-[0.3em] text-text-muted transition hover:text-text disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          className={cn(
            "flex items-center gap-2 rounded-md border px-5 py-2 font-display text-xs uppercase tracking-[0.3em] transition",
            canStart
              ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
              : "border-line bg-surface text-text-muted/60",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {creating ? t("quickStart.creating") : t("quickStart.startButton")}
        </button>
      </footer>
    </Dialog>
  );
}

function Section({
  title,
  htmlFor,
  children,
}: {
  title: string;
  /** When set, the title is a <label> for the input with this id. */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const titleClass =
    "mb-2 block font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted";
  return (
    <section className="mb-5 last:mb-3">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={titleClass}>
          {title}
        </label>
      ) : (
        <p className={titleClass}>{title}</p>
      )}
      {children}
    </section>
  );
}
