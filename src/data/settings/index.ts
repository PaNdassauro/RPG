/**
 * The campaign world. Every campaign runs in the Forgotten Realms; the
 * user-facing content (name, themes, dmSeed) lives in the i18n dictionaries
 * under `settingsContent.forgottenRealms` so it tracks the active locale.
 *
 * Campaigns still persist a `settingId` string. Saves created before the app
 * went Forgotten-Realms-only may carry a legacy id ("ashfall", "custom");
 * those resolve to the Forgotten Realms too.
 */
import { t, tList } from "@/i18n";

export const FORGOTTEN_REALMS_ID = "forgotten-realms";

export interface CampaignSetting {
  name: string;
  themes: string[];
  /** Paragraph merged into the DM system prompt — locale-aware. */
  dmSeed: string;
}

export function getWorld(): CampaignSetting {
  const k = "settingsContent.forgottenRealms";
  return {
    name: t(`${k}.name`),
    themes: tList(`${k}.themes`),
    dmSeed: t(`${k}.dmSeed`),
  };
}
