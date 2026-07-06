/**
 * Portrait sigils used during character creation and rendered everywhere a
 * character is shown (campaign cards, character crest, narration log avatar).
 * Lucide icons keep the bundle small and let the dark-fantasy palette tint
 * them via currentColor.
 */
import {
  Anchor,
  Compass,
  Crown,
  Eye,
  Feather,
  Flame,
  Hammer,
  Mountain,
  Shield,
  Skull,
  Sword,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export interface Portrait {
  id: string;
  icon: LucideIcon;
  /** English label — used as `title` / `aria-label` fallback. */
  label: string;
}

export const PORTRAITS: Portrait[] = [
  { id: "p-01", icon: Crown, label: "Sovereign" },
  { id: "p-02", icon: Sword, label: "Blademark" },
  { id: "p-03", icon: Shield, label: "Bulwark" },
  { id: "p-04", icon: Skull, label: "Reaper" },
  { id: "p-05", icon: Wand2, label: "Channeler" },
  { id: "p-06", icon: Compass, label: "Wayfarer" },
  { id: "p-07", icon: Mountain, label: "Stoneborn" },
  { id: "p-08", icon: Anchor, label: "Tideheart" },
  { id: "p-09", icon: Feather, label: "Whisper" },
  { id: "p-10", icon: Flame, label: "Ember" },
  { id: "p-11", icon: Eye, label: "Watcher" },
  { id: "p-12", icon: Hammer, label: "Forgehand" },
];

const PORTRAIT_BY_ID = new Map(PORTRAITS.map((p) => [p.id, p]));

export function getPortrait(id: string | undefined): Portrait {
  if (!id) return PORTRAITS[0]!;
  return PORTRAIT_BY_ID.get(id) ?? PORTRAITS[0]!;
}
