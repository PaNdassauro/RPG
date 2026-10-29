import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCharacter } from "@/test/fixtures";

vi.mock("@/db/schema", async () => await import("@/test/fakeDb"));

import { clearTables, tables } from "@/test/fakeDb";
import { importBundle } from "./campaignExport";

const campaign = {
  id: "camp-1",
  title: "T",
  characterId: "char-1",
  worldSeed: "s",
  settingId: "forgotten-realms",
  currentLocation: { name: "Here", description: "" },
  inWorldDay: 1,
  createdAt: 0,
  updatedAt: 0,
};

const message = (id: string, content: unknown) => ({
  id,
  campaignId: "camp-1",
  role: "dm",
  content,
  toolCallIds: [],
  diceRollIds: [],
  ts: 1,
});

function bundle(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    bundleVersion: 1,
    exportedAt: 1,
    campaigns: [campaign],
    characters: [makeCharacter()],
    messages: [message("m1", "hello")],
    diceRolls: [],
    encounters: [],
    ...overrides,
  });
}

beforeEach(() => {
  clearTables();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("importBundle", () => {
  it("imports a clean bundle with nothing skipped", async () => {
    const summary = await importBundle(bundle());
    expect(summary).toMatchObject({ campaigns: 1, characters: 1, messages: 1, skipped: [] });
    expect(tables.messages).toHaveLength(1);
  });

  it("one invalid record no longer rejects the whole bundle", async () => {
    const summary = await importBundle(
      bundle({ messages: [message("good", "ok"), message("bad", 42), message("good2", "ok")] }),
    );
    expect(summary.messages).toBe(2);
    expect(summary.campaigns).toBe(1);
    expect(tables.messages.map((m) => m.id)).toEqual(["good", "good2"]);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0]).toMatchObject({ table: "messages", id: "bad" });
    expect(summary.skipped[0]!.reason).toMatch(/content/);
  });

  it("reports skipped records from several tables, tolerating non-object junk", async () => {
    const summary = await importBundle(
      bundle({
        characters: [{ id: "broken-char" }],
        diceRolls: ["not an object"],
      }),
    );
    expect(summary.characters).toBe(0);
    expect(summary.skipped.map((s) => [s.table, s.id])).toEqual([
      ["characters", "broken-char"],
      ["diceRolls", null],
    ]);
    expect(tables.campaigns).toHaveLength(1);
  });

  it("still rejects a file that is not a bundle at all", async () => {
    await expect(importBundle("{}")).rejects.toThrow();
    await expect(importBundle("not json")).rejects.toThrow();
  });
});
