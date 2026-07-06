/**
 * Campaign settings the DM can run a session inside. The user-facing
 * content (name, tagline, blurb, themes, dmSeed) lives in the i18n
 * dictionaries — this module only owns the static metadata (id, icon,
 * recommended flag) and provides a typed accessor.
 */
import type { LucideIcon } from "lucide-react";
import { Flame, Castle, Mountain } from "lucide-react";
import { t, tList } from "@/i18n";

export type SettingId = "ashfall" | "forgotten-realms" | "custom";

export interface CampaignSetting {
  id: SettingId;
  name: string;
  tagline: string;
  blurb: string;
  themes: string[];
  /** Paragraph merged into the DM system prompt — locale-aware. */
  dmSeed: string;
  icon: LucideIcon;
  recommended?: boolean;
}

interface SettingMeta {
  id: SettingId;
  /** Key path under `settingsContent` in the i18n dictionaries. */
  dictKey: "ashfall" | "forgottenRealms" | "custom";
  icon: LucideIcon;
  recommended?: boolean;
}

const META: SettingMeta[] = [
  { id: "ashfall", dictKey: "ashfall", icon: Flame, recommended: true },
  { id: "forgotten-realms", dictKey: "forgottenRealms", icon: Castle },
  { id: "custom", dictKey: "custom", icon: Mountain },
];

const META_BY_ID = new Map(META.map((m) => [m.id, m]));

function withTranslations(meta: SettingMeta): CampaignSetting {
  const k = `settingsContent.${meta.dictKey}`;
  const result: CampaignSetting = {
    id: meta.id,
    name: t(`${k}.name`),
    tagline: t(`${k}.tagline`),
    blurb: t(`${k}.blurb`),
    themes: tList(`${k}.themes`),
    dmSeed: t(`${k}.dmSeed`),
    icon: meta.icon,
  };
  if (meta.recommended) result.recommended = true;
  return result;
}

export function listSettings(): CampaignSetting[] {
  return META.map(withTranslations);
}

export function getSetting(id: SettingId): CampaignSetting | undefined {
  const meta = META_BY_ID.get(id);
  return meta ? withTranslations(meta) : undefined;
}

export const DEFAULT_SETTING_ID: SettingId = "ashfall";
