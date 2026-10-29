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

export interface SkippedRecord {
  table: "campaigns" | "characters" | "messages" | "diceRolls" | "encounters";
  /** The record's id when it has one. */
  id: string | null;
  /** Human-readable Zod issues for why it was left out. */
  reason: string;
}

export interface ImportSummary {
  campaigns: number;
  characters: number;
  messages: number;
  diceRolls: number;
  encounters: number;
  /** Records that failed validation and were not imported. */
  skipped: SkippedRecord[];
}

/** The outer shape only; each record is validated on its own below. */
const EnvelopeSchema = z.object({
  bundleVersion: z.literal(BUNDLE_VERSION),
  exportedAt: z.number().int(),
  campaigns: z.array(z.unknown()),
  characters: z.array(z.unknown()),
  messages: z.array(z.unknown()),
  diceRolls: z.array(z.unknown()),
  encounters: z.array(z.unknown()),
});

/** Keep the records that pass `schema`; list the others instead of failing the import. */
function validRecords<T>(
  table: SkippedRecord["table"],
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  records: unknown[],
  skipped: SkippedRecord[],
): T[] {
  const ok: T[] = [];
  for (const record of records) {
    const parsed = schema.safeParse(record);
    if (parsed.success) {
      ok.push(parsed.data);
      continue;
    }
    const id =
      typeof record === "object" && record !== null && "id" in record && typeof record.id === "string"
        ? record.id
        : null;
    const reason = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    console.warn(`[campaignExport] skipping invalid ${table} record ${id ?? "(no id)"}: ${reason}`);
    skipped.push({ table, id, reason });
  }
  return ok;
}

/**
 * Parse + validate a JSON string. Throws if the file isn't JSON or the bundle
 * envelope is wrong. Individual records that fail validation are skipped and
 * reported in `skipped` — one bad message no longer rejects the whole backup.
 * Performs an upsert (put) across all tables — existing records with the
 * same ids are overwritten. Returns counts imported.
 */
export async function importBundle(raw: string): Promise<ImportSummary> {
  const envelope = EnvelopeSchema.parse(JSON.parse(raw));
  const skipped: SkippedRecord[] = [];
  const bundle = {
    campaigns: validRecords("campaigns", CampaignSchema, envelope.campaigns, skipped),
    characters: validRecords("characters", CharacterSchema, envelope.characters, skipped),
    messages: validRecords("messages", ChatMessageSchema, envelope.messages, skipped),
    diceRolls: validRecords("diceRolls", DiceRollRecordSchema, envelope.diceRolls, skipped),
    encounters: validRecords("encounters", EncounterStateSchema, envelope.encounters, skipped),
  };
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
    skipped,
  };
}
