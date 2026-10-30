import { useMemo } from "react";
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { profileFor } from "@/ai/context";
import { useT } from "@/i18n";
import { presentNpcs } from "@/lib/worldRail";
import type { CodexTarget } from "@/components/play/CodexSheet";
import { InitiativeTracker } from "@/components/play/InitiativeTracker";
import { RailLocation } from "@/components/play/RailLocation";
import { RailNearby } from "@/components/play/RailNearby";
import { RailCompanions } from "@/components/play/RailCompanions";
import { RailQuests } from "@/components/play/RailQuests";
import { RailFactions } from "@/components/play/RailFactions";
import { RailRolls } from "@/components/play/RailRolls";

interface WorldRailProps {
  /** Opens the codex, on a specific entry when the target names one. */
  onOpenCodex: (target?: CodexTarget) => void;
}

/**
 * The right rail of the play screen: the world around the player. Used by the
 * desktop column and the mobile sheet alike, so both always show the same thing.
 * Sections with nothing to show are left out, except where you are and quests.
 */
export function WorldRail({ onOpenCodex }: WorldRailProps) {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  const messages = useSessionStore((s) => s.messages);
  const diceRolls = useSessionStore((s) => s.diceRolls);
  const encounter = useSessionStore((s) => s.encounter);
  const activeProvider = useKeysStore((s) => s.activeProvider);

  const nearby = useMemo(
    () => (campaign ? presentNpcs(campaign, messages, profileFor(activeProvider)) : []),
    [campaign, messages, activeProvider],
  );
  if (!campaign) return null;

  return (
    <aside aria-label={t("play.worldRail.label")} className="flex flex-col gap-6">
      {encounter && <InitiativeTracker />}
      <RailLocation campaign={campaign} />
      <RailNearby npcs={nearby} onOpenCodex={onOpenCodex} />
      <RailCompanions companions={campaign.companions} />
      <RailQuests quests={campaign.quests} />
      <RailFactions factions={campaign.factions} />
      <RailRolls diceRolls={diceRolls} />
    </aside>
  );
}
