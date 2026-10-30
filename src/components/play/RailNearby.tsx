import { CircleDot, Shield, Sword, UsersRound } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { NpcEntry } from "@/schemas/campaign";
import { dispositionTier } from "@/lib/worldRail";
import type { CodexTarget } from "@/components/play/CodexSheet";
import { FOCUS_RING, RailSection } from "@/components/play/RailSection";

const KIND_STYLE: Record<NpcEntry["kind"], { text: string; Icon: typeof Shield }> = {
  ally: { text: "text-[var(--color-char-ally)]", Icon: Shield },
  foe: { text: "text-[var(--color-char-foe)]", Icon: Sword },
  neutral: { text: "text-[var(--color-char-neutral)]", Icon: CircleDot },
};

const KIND_LABEL: Record<NpcEntry["kind"], string> = {
  ally: "play.codex.kindAlly",
  foe: "play.codex.kindFoe",
  neutral: "play.codex.kindNeutral",
};

/** NPCs the recent scene names, each opening its codex entry. */
export function RailNearby({
  npcs,
  onOpenCodex,
}: {
  npcs: NpcEntry[];
  onOpenCodex: (target: CodexTarget) => void;
}) {
  const t = useT();
  if (npcs.length === 0) return null;
  return (
    <RailSection
      id="nearby"
      title={t("play.worldRail.nearby")}
      icon={<UsersRound />}
      count={npcs.length}
    >
      <ul className="flex flex-col gap-2">
        {npcs.map((npc) => {
          const { text, Icon } = KIND_STYLE[npc.kind];
          const tier = dispositionTier(npc.disposition ?? 0);
          return (
            <li key={npc.id}>
              <button
                type="button"
                onClick={() => onOpenCodex({ tab: "npcs", focusId: npc.id })}
                aria-label={t("play.worldRail.openInCodex", { name: npc.name })}
                className={cn(
                  "w-full rounded-md border border-line/60 bg-surface/50 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:border-accent-muted/60 hover:bg-surface-elevated/60",
                  FOCUS_RING,
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", text)} />
                  <span className={cn("min-w-0 truncate font-display text-[15px] leading-tight", text)}>
                    {npc.name}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs leading-snug text-text-muted">
                  <span className={cn("font-medium", text)}>{t(KIND_LABEL[npc.kind])}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={cn(
                      (tier === "friendly" || tier === "devoted") && "text-accent",
                      (tier === "hostile" || tier === "wary") && "text-danger",
                    )}
                  >
                    {t(`play.worldRail.disposition.${tier}`)}
                  </span>
                </span>
                {npc.description && (
                  <span className="mt-1.5 line-clamp-2 block text-[13px] leading-snug text-text-muted">
                    {npc.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </RailSection>
  );
}
