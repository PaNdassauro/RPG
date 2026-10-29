import { create } from "zustand";
import { db, type ApiKeyRecord, type ProviderId } from "@/db/schema";
import {
  DEFAULT_CLAUDE_MODEL,
  isKnownClaudeModel,
} from "@/ai/providers/anthropic";

const SETTINGS_KEY = "active_provider";

interface KeysState {
  records: Partial<Record<ProviderId, ApiKeyRecord>>;
  activeProvider: ProviderId | null;
  loaded: boolean;

  load: () => Promise<void>;
  saveKey: (record: ApiKeyRecord) => Promise<void>;
  removeKey: (providerId: ProviderId) => Promise<void>;
  setActiveProvider: (providerId: ProviderId | null) => Promise<void>;
}

export const useKeysStore = create<KeysState>((set) => ({
  records: {},
  activeProvider: null,
  loaded: false,

  async load() {
    const all = await db.apiKeys.toArray();
    const records: Partial<Record<ProviderId, ApiKeyRecord>> = {};
    for (const r of all) {
      const migrated = migrateRecord(r);
      if (migrated !== r) await db.apiKeys.put(migrated);
      records[migrated.providerId] = migrated;
    }
    const activeRow = await db.settings.get(SETTINGS_KEY);
    const active =
      typeof activeRow?.value === "string"
        ? (activeRow.value as ProviderId)
        : null;
    set({ records, activeProvider: active, loaded: true });
  },

  async saveKey(record) {
    await db.apiKeys.put(record);
    // Capture the previous active provider BEFORE mutating state — we need to
    // know whether to adopt the freshly-saved key as active. The previous
    // version mutated activeProvider inside the set() call, which made the
    // follow-up "if (!activeProvider)" dead code, so db.settings never got
    // the active-provider row and it reset to null on every reload.
    const prevActive = useKeysStore.getState().activeProvider;
    set((s) => ({
      records: { ...s.records, [record.providerId]: record },
    }));
    if (!prevActive) {
      await useKeysStore.getState().setActiveProvider(record.providerId);
    }
  },

  async removeKey(providerId) {
    await db.apiKeys.delete(providerId);
    set((s) => {
      const next = { ...s.records };
      delete next[providerId];
      const newActive =
        s.activeProvider === providerId ? null : s.activeProvider;
      return { records: next, activeProvider: newActive };
    });
    if (useKeysStore.getState().activeProvider === null) {
      await db.settings.delete(SETTINGS_KEY);
    }
  },

  async setActiveProvider(providerId) {
    if (providerId === null) {
      await db.settings.delete(SETTINGS_KEY);
    } else {
      await db.settings.put({
        key: SETTINGS_KEY,
        value: providerId,
        updatedAt: Date.now(),
      });
    }
    set({ activeProvider: providerId });
  },
}));

/**
 * Saved Claude model ids that are no longer offered (retired 4.x ids) move to
 * the current default. OpenAI and Ollama accept free-text model ids, so those
 * are left alone.
 */
export function migrateRecord(record: ApiKeyRecord): ApiKeyRecord {
  if (
    record.providerId === "claude" &&
    record.model !== undefined &&
    !isKnownClaudeModel(record.model)
  ) {
    return { ...record, model: DEFAULT_CLAUDE_MODEL, updatedAt: Date.now() };
  }
  return record;
}

/**
 * Configure a single Dexie watcher so any tab/window that mutates the keys
 * reflects the change here. Cheap — just reload on first access.
 */
export async function ensureKeysLoaded(): Promise<void> {
  const { loaded, load } = useKeysStore.getState();
  if (!loaded) await load();
}
