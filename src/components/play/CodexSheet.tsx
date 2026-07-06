import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  MapPin,
  UsersRound,
  Shield,
  Sword,
  CircleDot,
  Scroll,
  Check,
  AlertTriangle,
  CircleSlash,
  Flag,
  PawPrint,
  NotebookPen,
} from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import type {
  CompanionEntry,
  FactionEntry,
  NpcEntry,
  PlaceEntry,
  Quest,
} from "@/schemas/campaign";
import { cn } from "@/lib/cn";

type Tab = "places" | "npcs" | "quests" | "factions" | "companions" | "journal";

interface CodexSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CodexSheet({ open, onClose }: CodexSheetProps) {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  const places = campaign?.placesVisited ?? [];
  const npcs = campaign?.npcsMet ?? [];
  const quests = campaign?.quests ?? [];
  const factions = campaign?.factions ?? [];
  const companions = campaign?.companions ?? [];
  const activeQuestCount = quests.filter((q) => q.status === "active").length;
  const [tab, setTab] = useState<Tab>("places");

  // ESC closes — keyboard parity with the backdrop click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // CSS-only transitions — always rendered, just toggled. No risk of stuck DOM.
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px] transition-opacity duration-200",
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-line bg-surface/95 shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition-transform duration-300 ease-out",
          open
            ? "translate-x-0 pointer-events-auto"
            : "translate-x-full pointer-events-none",
        )}
      >
        <header className="flex items-center justify-between border-b border-line/60 px-5 py-4">
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
              {t("play.codex.eyebrow")}
            </p>
            <h2 className="mt-0.5 font-display text-lg text-text">
              {t("play.codex.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition hover:border-accent-muted hover:text-text"
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-wrap border-b border-line/60 px-5">
          <TabButton
            active={tab === "places"}
            onClick={() => setTab("places")}
            icon={<MapPin className="h-3.5 w-3.5" />}
            label={t("play.codex.placesTab")}
            count={places.length}
          />
          <TabButton
            active={tab === "npcs"}
            onClick={() => setTab("npcs")}
            icon={<UsersRound className="h-3.5 w-3.5" />}
            label={t("play.codex.charactersTab")}
            count={npcs.length}
          />
          <TabButton
            active={tab === "quests"}
            onClick={() => setTab("quests")}
            icon={<Scroll className="h-3.5 w-3.5" />}
            label={t("play.codex.questsTab")}
            count={activeQuestCount}
          />
          <TabButton
            active={tab === "factions"}
            onClick={() => setTab("factions")}
            icon={<Flag className="h-3.5 w-3.5" />}
            label={t("play.codex.factionsTab")}
            count={factions.length}
          />
          <TabButton
            active={tab === "companions"}
            onClick={() => setTab("companions")}
            icon={<PawPrint className="h-3.5 w-3.5" />}
            label={t("play.codex.companionsTab")}
            count={companions.length}
          />
          <TabButton
            active={tab === "journal"}
            onClick={() => setTab("journal")}
            icon={<NotebookPen className="h-3.5 w-3.5" />}
            label={t("play.codex.journalTab")}
            count={(campaign?.journal ?? "").length > 0 ? 1 : 0}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "places" && <PlacesList places={places} />}
          {tab === "npcs" && <NpcsList npcs={npcs} />}
          {tab === "quests" && <QuestsList quests={quests} />}
          {tab === "factions" && <FactionsList factions={factions} />}
          {tab === "companions" && <CompanionsList companions={companions} />}
          {tab === "journal" && <JournalPanel />}
        </div>
      </aside>
    </>
  );
}

function FactionsList({ factions }: { factions: FactionEntry[] }) {
  const t = useT();
  if (factions.length === 0) return <Empty text={t("play.codex.noFactions")} />;
  const sorted = [...factions].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((f) => {
        const repTone =
          f.reputation >= 50
            ? "border-accent/50 bg-accent/10 text-accent"
            : f.reputation >= 10
              ? "border-accent-muted/40 bg-accent/5 text-accent-muted"
              : f.reputation <= -50
                ? "border-danger/40 bg-danger/10 text-danger"
                : f.reputation <= -10
                  ? "border-danger/30 bg-danger/5 text-danger/80"
                  : "border-line bg-surface text-text-muted";
        return (
          <li
            key={f.id}
            className="rounded-md border border-line/70 bg-surface/40 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Flag className="h-3.5 w-3.5 shrink-0 text-accent-muted" />
              <h3 className="font-display text-base text-text">{f.name}</h3>
              <span
                className={cn(
                  "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                  repTone,
                )}
              >
                {f.reputation >= 0 ? `+${f.reputation}` : f.reputation}
              </span>
            </div>
            {f.description && (
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {f.description}
              </p>
            )}
            <div className="mt-2 h-1 overflow-hidden rounded-full border border-line bg-surface">
              <div
                className={cn(
                  "h-full",
                  f.reputation >= 0 ? "bg-accent" : "bg-danger",
                )}
                style={{ width: `${Math.abs(f.reputation)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CompanionsList({ companions }: { companions: CompanionEntry[] }) {
  const t = useT();
  if (companions.length === 0) return <Empty text={t("play.codex.noCompanions")} />;
  const sorted = [...companions].sort((a, b) => b.addedAt - a.addedAt);
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((c) => (
        <li
          key={c.id}
          className="rounded-md border border-line/70 bg-surface/40 px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <PawPrint className="h-3.5 w-3.5 shrink-0 text-accent-muted" />
            <h3 className="font-display text-base text-text">{c.name}</h3>
            <span className="ml-auto rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
              {t(`play.codex.companionKind.${c.kind}`)}
            </span>
          </div>
          {c.description && (
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {c.description}
            </p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] text-text-muted">
            <span>HP {c.hpCurrent}/{c.hpMax}</span>
            <span>CA {c.ac}</span>
            <span>Inic. {c.initiativeBonus >= 0 ? `+${c.initiativeBonus}` : c.initiativeBonus}</span>
          </div>
          {c.attack && (
            <p className="mt-1 font-mono text-[11px] text-accent-muted">
              {c.attack.name}: {c.attack.toHit >= 0 ? `+${c.attack.toHit}` : c.attack.toHit} ·{" "}
              {c.attack.damage} {c.attack.damageType}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-3 font-display text-[11px] uppercase tracking-[0.3em] transition",
        active
          ? "text-accent"
          : "text-text-muted hover:text-text",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[10px] text-text-muted/70">{count}</span>
      {active && (
        <motion.span
          layoutId="codex-tab-underline"
          className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-accent"
        />
      )}
    </button>
  );
}

function PlacesList({ places }: { places: PlaceEntry[] }) {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  if (places.length === 0) {
    return <Empty text={t("play.codex.noPlaces")} />;
  }
  // Travelogue: oldest at top, newest at bottom, connected by a vertical line.
  // The current location gets a pulsing dot.
  const chronological = [...places].sort((a, b) => a.addedAt - b.addedAt);
  const currentKey = campaign?.currentLocation.name.trim().toLowerCase();
  return (
    <div className="relative pl-6">
      <div className="absolute bottom-2 left-2 top-2 w-px bg-accent-muted/30" />
      <ul className="flex flex-col gap-4">
        {chronological.map((p) => {
          const isCurrent = currentKey && p.key === currentKey;
          return (
            <li key={p.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full border",
                  isCurrent
                    ? "border-accent bg-accent shadow-[0_0_12px_2px_rgba(212,175,55,0.5)] animate-pulse"
                    : "border-accent-muted bg-surface",
                )}
              />
              <div className="flex items-center gap-2">
                <MapPin
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isCurrent ? "text-accent" : "text-accent-muted",
                  )}
                />
                <h3
                  className={cn(
                    "font-display text-base font-semibold text-[var(--color-place)]",
                    isCurrent && "drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]",
                  )}
                >
                  {p.name}
                </h3>
                {isCurrent && (
                  <span className="ml-auto rounded-sm border border-accent bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
                    {t("play.codex.here")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {p.description}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NpcsList({ npcs }: { npcs: NpcEntry[] }) {
  const t = useT();
  if (npcs.length === 0) {
    return <Empty text={t("play.codex.noNpcs")} />;
  }
  const sorted = [...npcs].sort((a, b) => b.addedAt - a.addedAt);
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((n) => (
        <li
          key={n.id}
          className="rounded-md border border-line/70 bg-surface/40 px-4 py-3 transition hover:border-accent-muted/60"
        >
          <div className="flex items-center gap-2">
            <KindIcon kind={n.kind} />
            <h3
              className={cn("font-display text-base font-semibold", npcNameClass(n.kind))}
            >
              {n.name}
            </h3>
            <KindTag kind={n.kind} />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {n.description}
          </p>
          <DispositionBar disposition={n.disposition ?? 0} />
        </li>
      ))}
    </ul>
  );
}

function DispositionBar({ disposition }: { disposition: number }) {
  const t = useT();
  const d = Math.max(-2, Math.min(2, disposition));
  const labelKey =
    d === -2
      ? "play.codex.disposition.hostile"
      : d === -1
        ? "play.codex.disposition.wary"
        : d === 1
          ? "play.codex.disposition.friendly"
          : d === 2
            ? "play.codex.disposition.devoted"
            : "play.codex.disposition.neutral";
  const tone =
    d > 0
      ? "text-accent"
      : d < 0
        ? "text-danger"
        : "text-text-muted";
  return (
    <div className="mt-2 flex items-center gap-2">
      <p className={cn("font-mono text-[10px] uppercase tracking-widest", tone)}>
        {t(labelKey)}
      </p>
      <div className="flex flex-1 items-center justify-between gap-0.5">
        {[-2, -1, 0, 1, 2].map((step) => {
          const filled = (step <= 0 && d <= step) || (step >= 0 && d >= step);
          return (
            <span
              key={step}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                filled
                  ? step < 0
                    ? "bg-danger/70"
                    : step > 0
                      ? "bg-accent"
                      : "bg-text-muted/60"
                  : "bg-line/40",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: NpcEntry["kind"] }) {
  if (kind === "ally")
    return <Shield className="h-3.5 w-3.5 shrink-0 text-[var(--color-char-ally)]" />;
  if (kind === "foe")
    return <Sword className="h-3.5 w-3.5 shrink-0 text-[var(--color-char-foe)]" />;
  return <CircleDot className="h-3.5 w-3.5 shrink-0 text-[var(--color-char-neutral)]" />;
}

function npcNameClass(kind: NpcEntry["kind"]): string {
  if (kind === "ally") return "text-[var(--color-char-ally)]";
  if (kind === "foe") return "text-[var(--color-char-foe)]";
  return "text-[var(--color-char-neutral)]";
}

function KindTag({ kind }: { kind: NpcEntry["kind"] }) {
  const t = useT();
  const map: Record<NpcEntry["kind"], { label: string; className: string }> = {
    ally: {
      label: t("play.codex.kindAlly"),
      className: "border-accent/40 bg-accent/10 text-accent",
    },
    foe: {
      label: t("play.codex.kindFoe"),
      className: "border-danger/40 bg-danger/10 text-danger",
    },
    neutral: {
      label: t("play.codex.kindNeutral"),
      className: "border-line bg-surface text-text-muted",
    },
  };
  const { label, className } = map[kind];
  return (
    <span
      className={cn(
        "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        className,
      )}
    >
      {label}
    </span>
  );
}

function QuestsList({ quests }: { quests: Quest[] }) {
  const t = useT();
  if (quests.length === 0) {
    return <Empty text={t("play.codex.noQuests")} />;
  }
  // Active first, then most-recently-updated within each status group.
  const order: Record<Quest["status"], number> = {
    active: 0,
    completed: 1,
    failed: 2,
    abandoned: 3,
  };
  const sorted = [...quests].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.updatedAt - a.updatedAt;
  });
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((q) => {
        const closed = q.status !== "active";
        return (
          <li
            key={q.id}
            className={cn(
              "rounded-md border bg-surface/40 px-4 py-3 transition",
              closed
                ? "border-line/50 opacity-70"
                : "border-line/70 hover:border-accent-muted/60",
            )}
          >
            <div className="flex items-center gap-2">
              <QuestStatusIcon status={q.status} />
              <h3
                className={cn(
                  "font-display text-base",
                  closed ? "text-text-muted line-through" : "text-text",
                )}
              >
                {q.title}
              </h3>
              <QuestStatusTag status={q.status} />
            </div>
            {q.objective && (
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {q.objective}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function QuestStatusIcon({ status }: { status: Quest["status"] }) {
  if (status === "completed")
    return <Check className="h-3.5 w-3.5 shrink-0 text-accent" />;
  if (status === "failed")
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger/80" />;
  if (status === "abandoned")
    return <CircleSlash className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
  return <Scroll className="h-3.5 w-3.5 shrink-0 text-accent-muted" />;
}

function QuestStatusTag({ status }: { status: Quest["status"] }) {
  const t = useT();
  const map: Record<Quest["status"], { label: string; className: string }> = {
    active: {
      label: t("play.codex.questActive"),
      className: "border-accent-muted/40 bg-accent/10 text-accent-muted",
    },
    completed: {
      label: t("play.codex.questCompleted"),
      className: "border-accent/50 bg-accent/15 text-accent",
    },
    failed: {
      label: t("play.codex.questFailed"),
      className: "border-danger/40 bg-danger/10 text-danger",
    },
    abandoned: {
      label: t("play.codex.questAbandoned"),
      className: "border-line bg-surface text-text-muted",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={cn(
        "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        className,
      )}
    >
      {label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="font-display text-[10px] uppercase tracking-[0.4em] text-text-muted/50">
        {text}
      </p>
    </div>
  );
}

function JournalPanel() {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  const updateJournal = useSessionStore((s) => s.updateJournal);
  const initial = campaign?.journal ?? "";
  const [draft, setDraft] = useState(initial);
  const timer = useRef<number | null>(null);

  // Resync when campaign changes underneath us.
  useEffect(() => {
    setDraft(campaign?.journal ?? "");
  }, [campaign?.id, campaign?.journal]);

  // Debounced autosave: 600ms after last keypress.
  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (draft === (campaign?.journal ?? "")) return;
    timer.current = window.setTimeout(() => {
      void updateJournal(draft);
    }, 600);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [draft, updateJournal, campaign?.journal]);

  const saved = draft === (campaign?.journal ?? "");

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
          {t("play.codex.journalEyebrow")}
        </p>
        <p className="font-mono text-[10px] text-text-muted/60">
          {saved ? t("play.codex.journalSaved") : t("play.codex.journalUnsaved")}
        </p>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("play.codex.journalPlaceholder")}
        spellCheck
        className="flex-1 min-h-[60vh] resize-none rounded-md border border-line bg-surface-elevated px-3 py-2 font-mono text-sm leading-relaxed text-text placeholder:text-text-muted/40 focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
      />
      <p className="text-[11px] leading-relaxed text-text-muted/60">
        {t("play.codex.journalHint")}
      </p>
    </div>
  );
}
