import { useId, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { useT } from "@/i18n";
import type { Campaign } from "@/schemas/campaign";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/play/RailSection";
import { formatTenday, formatWorldDate, locationDescription } from "@/lib/worldRail";

/** Longer than this and the description folds to four lines with a "read more". */
const LONG_DESCRIPTION = 150;

/** "Where you are": place name, what it is like, and the in-world date. Always visible. */
export function RailLocation({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const name = campaign.currentLocation.name.trim() || t("play.worldRail.unknownPlace");
  const description = locationDescription(campaign);
  const tenday = formatTenday(campaign.inWorldDay, t);
  const headId = useId();
  const [expanded, setExpanded] = useState(false);
  const isLong = description.length > LONG_DESCRIPTION;
  return (
    <section
      aria-labelledby={headId}
      className="rounded-lg border border-line/70 bg-surface/60 p-4 shadow-[inset_0_1px_0_rgba(236,228,212,0.04)]"
    >
      <h3
        id={headId}
        className="m-0 flex items-center gap-2 font-display text-[13px] uppercase leading-none tracking-[0.15em] text-accent-muted"
      >
        <MapPin aria-hidden="true" className="h-4 w-4" />
        {t("play.worldRail.whereYouAre")}
      </h3>
      <p className="mt-3 text-balance font-display text-xl leading-tight text-text">{name}</p>

      <div className="mt-3 flex items-start gap-2">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <p className="text-sm leading-snug text-text">
            {formatWorldDate(campaign.inWorldDay, t)}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-text-muted">
            {t("play.worldRail.journeyDay", { n: campaign.inWorldDay })}
            {tenday && ` · ${tenday}`}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        {description ? (
          <>
            <p
              className={cn(
                "font-narration text-base leading-relaxed text-pretty text-text/90",
                isLong && !expanded && "line-clamp-4",
              )}
            >
              {description}
            </p>
            {isLong && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className={cn(
                  "-mb-2 mt-1 rounded-sm py-2 text-[13px] text-accent-muted transition-colors duration-150 ease-out hover:text-accent",
                  FOCUS_RING,
                )}
              >
                {t(expanded ? "play.worldRail.readLess" : "play.worldRail.readMore")}
              </button>
            )}
          </>
        ) : (
          <p className="text-[13px] leading-snug text-text-muted">
            {t("play.worldRail.noDescription")}
          </p>
        )}
      </div>
    </section>
  );
}
