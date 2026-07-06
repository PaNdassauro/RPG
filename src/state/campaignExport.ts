/**
 * Whole-database export/import. Bundles every campaign with its character,
 * messages, dice rolls, and encounters into a single JSON file so the player
 * can move saves between devices or back them up before a destructive change.
 *
 * Validation: Zod-checked on import. Malformed bundles are rejected with a
 * structured error so the UI can show a meaningful message.
 */
import { z } from "zod";
import { db } from "@/db/schema";
import { CampaignSchema, ChatMessageSchema, DiceRollRecordSchema, EncounterStateSchema } from "@/schemas/campaign";
import { CharacterSchema } from "@/schemas/character";

const BUNDLE_VERSION = 1;

const BundleSchema = z.object({
  bundleVersion: z.literal(BUNDLE_VERSION),
  exportedAt: z.number().int(),
  campaigns: z.array(CampaignSchema),
  characters: z.array(CharacterSchema),
  messages: z.array(ChatMessageSchema),
  diceRolls: z.array(DiceRollRecordSchema),
  encounters: z.array(EncounterStateSchema),
});
export type CampaignBundle = z.infer<typeof BundleSchema>;

export async function exportAllCampaigns(): Promise<CampaignBundle> {
  const [campaigns, characters, messages, diceRolls, encounters] = await Promise.all([
    db.campaigns.toArray(),
    db.characters.toArray(),
    db.messages.toArray(),
    db.diceRolls.toArray(),
    db.encounters.toArray(),
  ]);
  return {
    bundleVersion: BUNDLE_VERSION,
    exportedAt: Date.now(),
    campaigns,
    characters,
    messages,
    diceRolls,
    encounters,
  };
}

export function downloadBundle(bundle: CampaignBundle, filename?: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `rpg-campaigns-${new Date(bundle.exportedAt).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportSummary {
  campaigns: number;
  characters: number;
  messages: number;
  diceRolls: number;
  encounters: number;
}

/**
 * Parse + validate a JSON string. Throws ZodError if malformed.
 * Performs an upsert (put) across all tables — existing records with the
 * same ids are overwritten. Returns counts inserted/updated.
 */
export async function importBundle(raw: string): Promise<ImportSummary> {
  const parsedJson = JSON.parse(raw);
  const bundle = BundleSchema.parse(parsedJson);
  await db.transaction(
    "rw",
    [db.campaigns, db.characters, db.messages, db.diceRolls, db.encounters],
    async () => {
      if (bundle.characters.length) await db.characters.bulkPut(bundle.characters);
      if (bundle.campaigns.length) await db.campaigns.bulkPut(bundle.campaigns);
      if (bundle.messages.length) await db.messages.bulkPut(bundle.messages);
      if (bundle.diceRolls.length) await db.diceRolls.bulkPut(bundle.diceRolls);
      if (bundle.encounters.length) await db.encounters.bulkPut(bundle.encounters);
    },
  );
  return {
    campaigns: bundle.campaigns.length,
    characters: bundle.characters.length,
    messages: bundle.messages.length,
    diceRolls: bundle.diceRolls.length,
    encounters: bundle.encounters.length,
  };
}
