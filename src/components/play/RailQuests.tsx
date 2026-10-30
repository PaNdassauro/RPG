import { useId } from "react";
import { Ban, Check, ChevronDown, Scroll, X } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Quest } from "@/schemas/campaign";
import { Collapse, FOCUS_RING, RailSection, useRailOpen } from "@/components/play/RailSection";

const STATUS_ICON = {
  completed: { Icon: Check, tone: "text-success" },
  failed: { Icon: X, tone: "text-danger" },
  abandoned: { Icon: Ban, tone: "text-text-muted" },
} as const;

/** Active quests in full; finished ones fold under a count. Always shown, with a friendly empty line. */
export function RailQuests({ quests }: { quests: Quest[] }) {
  const t = useT();
  const active = quests.filter((q) => q.status === "active");
  const finished = quests
    .filter((q) => q.status !== "active")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <RailSection
      id="quests"
      title={t("play.worldRail.quests")}
      icon={<Scroll />}
      count={active.length}
    >
      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-line/70 px-3 py-3 text-sm leading-snug text-text-muted">
          {t("play.worldRail.noQuests")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((q) => (
            <li key={q.id} className="rounded-md border border-line/60 bg-surface/50 p-3">
              <p className="font-display text-[15px] leading-tight text-text">{q.title}</p>
              {q.objective && (
                <p className="mt-1.5 text-sm leading-normal text-text-muted">{q.objective}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {finished.length > 0 && <FinishedQuests quests={finished} />}
    </RailSection>
  );
}

function FinishedQuests({ quests }: { quests: Quest[] }) {
  const t = useT();
  const [open, setOpen] = useRailOpen("quests-finished", false);
  const uid = useId();
  return (
    <div className="mt-3">
      <button
        id={`${uid}-head`}
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-body`}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-2 flex min-h-9 w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-text-muted transition-colors duration-150 ease-out hover:bg-surface-elevated/60 hover:text-text",
          FOCUS_RING,
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 ease-out",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        {t("play.worldRail.questsFinished", { n: quests.length })}
      </button>
      <Collapse open={open} id={`${uid}-body`} labelledBy={`${uid}-head`}>
        <ul className="flex flex-col gap-1.5 pt-1">
          {quests.map((q) => {
            const status = q.status === "active" ? "completed" : q.status;
            const { Icon, tone } = STATUS_ICON[status];
            return (
              <li key={q.id} className="flex items-start gap-2 px-1 text-[13px] leading-snug">
                <Icon aria-hidden="true" className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
                <span className="min-w-0 flex-1 text-text-muted">{q.title}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {t(`play.worldRail.questStatus.${status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </Collapse>
    </div>
  );
}
