import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Zap } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

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

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, creating]);

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
    <AnimatePresence>
      {open && (
        <motion.div
          key="qs-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 p-4 backdrop-blur-sm"
          onClick={() => !creating && onClose()}
        >
          <motion.div
            key="qs-card"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.4, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_0_80px_-20px_rgba(212,170,71,0.4)]"
          >
            <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-5">
              <div>
                <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
                  <Zap className="h-3 w-3" />
                  {t("quickStart.eyebrow")}
                </p>
                <h2 className="mt-0.5 font-display text-2xl text-text">
                  {t("quickStart.title")}
                </h2>
                <p className="mt-1 max-w-prose text-xs leading-relaxed text-text-muted">
                  {t("quickStart.intro")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !creating && onClose()}
                disabled={creating}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition hover:border-accent-muted hover:text-text disabled:opacity-50"
                aria-label={t("common.cancel")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Section title={t("quickStart.nameLabel")}>
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canStart) start();
                  }}
                  placeholder={t("quickStart.namePlaceholder")}
                  maxLength={60}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/40 focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
                />
              </Section>

              <Section title={t("quickStart.classLabel")}>
                {!classes ? (
                  <p className="py-4 text-center text-xs text-text-muted/60">
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
                            <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                              d{k.hit_die} · {k.savingThrows.join(" / ")}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <p className="text-[11px] leading-relaxed text-text-muted/70">
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
                    : "border-line bg-surface text-text-muted/40",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {creating ? t("quickStart.creating") : t("quickStart.startButton")}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-3">
      <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
        {title}
      </p>
      {children}
    </section>
  );
}
