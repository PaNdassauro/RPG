import Dexie, { type EntityTable } from "dexie";
import type { Character } from "@/schemas/character";
import type {
  Campaign,
  ChatMessage,
  DiceRollRecord,
  EncounterState,
} from "@/schemas/campaign";

export interface SettingsRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export type ProviderId = "claude" | "openai" | "gemini" | "ollama";

export interface ApiKeyRecord {
  providerId: ProviderId;
  /**
   * Plaintext API key. Stored in IndexedDB only — never sent anywhere except
   * directly to the provider it belongs to. The Settings UI surfaces this risk
   * to the user and recommends not using on shared devices.
   */
  key: string;
  /** Optional non-default model override per provider. */
  model?: string;
  /** Optional ollama base URL (defaults to http://localhost:11434). */
  baseUrl?: string;
  updatedAt: number;
}

class RPGDatabase extends Dexie {
  campaigns!: EntityTable<Campaign, "id">;
  characters!: EntityTable<Character, "id">;
  messages!: EntityTable<ChatMessage, "id">;
  diceRolls!: EntityTable<DiceRollRecord, "id">;
  encounters!: EntityTable<EncounterState, "id">;
  apiKeys!: EntityTable<ApiKeyRecord, "providerId">;
  settings!: EntityTable<SettingsRecord, "key">;

  constructor() {
    super("rpg");
    this.version(1).stores({
      campaigns: "id, characterId, updatedAt",
      characters: "id, name, updatedAt",
      messages: "id, [campaignId+ts], campaignId, ts",
      diceRolls: "id, ts",
      encounters: "id, campaignId, mode, updatedAt",
      apiKeys: "providerId",
      settings: "key",
    });
  }
}

export const db = new RPGDatabase();
