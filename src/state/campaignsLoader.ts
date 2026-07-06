/**
 * Lightweight, non-store helpers for working with the persisted campaign list.
 * The play screen has its own session store, but at the title / campaign-list
 * level we only need to read summary data and delete records — keep it simple.
 */
import { db } from "@/db/schema";
import type { Campaign, ChatMessage } from "@/schemas/campaign";
import type { Character } from "@/schemas/character";

export interface CampaignSummary {
  campaign: Campaign;
  character: Character | null;
  messageCount: number;
}

/** All saved campaigns, most-recently-updated first, with a basic message count. */
export async function listCampaignSummaries(): Promise<CampaignSummary[]> {
  const campaigns = await db.campaigns.toArray();
  campaigns.sort((a, b) => b.updatedAt - a.updatedAt);

  const characterIds = Array.from(new Set(campaigns.map((c) => c.characterId)));
  const characters = await db.characters.bulkGet(characterIds);
  const charMap = new Map<string, Character>();
  for (const c of characters) if (c) charMap.set(c.id, c);

  const summaries: CampaignSummary[] = [];
  for (const campaign of campaigns) {
    const messageCount = await db.messages
      .where("[campaignId+ts]")
      .between([campaign.id, 0], [campaign.id, Number.MAX_SAFE_INTEGER])
      .count();
    summaries.push({
      campaign,
      character: charMap.get(campaign.characterId) ?? null,
      messageCount,
    });
  }
  return summaries;
}

export async function getMostRecentCampaign(): Promise<Campaign | null> {
  const all = await db.campaigns.toArray();
  if (all.length === 0) return null;
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all[0] ?? null;
}

/**
 * Removes a campaign and all of its dependent records (messages, dice rolls,
 * encounters, character) — only the character if no other campaign references
 * it, which is the common case since one wizard run produces one of each.
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.campaigns, db.characters, db.messages, db.diceRolls, db.encounters],
    async () => {
      const campaign = await db.campaigns.get(campaignId);
      if (!campaign) return;

      const messages = await db.messages
        .where("campaignId")
        .equals(campaignId)
        .toArray();
      const rollIds = messages.flatMap((m: ChatMessage) => m.diceRollIds);
      if (rollIds.length > 0) await db.diceRolls.bulkDelete(rollIds);
      await db.messages.where("campaignId").equals(campaignId).delete();
      await db.encounters.where("campaignId").equals(campaignId).delete();

      await db.campaigns.delete(campaignId);

      // Drop the character only if no other campaign points at it.
      const others = await db.campaigns
        .where("characterId")
        .equals(campaign.characterId)
        .count();
      if (others === 0) await db.characters.delete(campaign.characterId);
    },
  );
}
