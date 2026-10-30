import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/schemas/campaign";
import { isRetryOfLastPlayerMessage } from "./playerMessage";

let n = 0;
const msg = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: `m${n++}`,
  campaignId: "c",
  role,
  content,
  toolCallIds: [],
  diceRollIds: [],
  ts: n,
});

describe("isRetryOfLastPlayerMessage", () => {
  it("is a retry when the DM never answered the identical last player message", () => {
    const log = [msg("dm", "Opening."), msg("player", "para onde vamos?")];
    expect(isRetryOfLastPlayerMessage(log, "para onde vamos?")).toBe(true);
    expect(isRetryOfLastPlayerMessage(log, "  para onde vamos?  ")).toBe(true);
  });

  it("is not a retry once the DM has replied: saying the same thing again is a new action", () => {
    const log = [msg("player", "attack"), msg("dm", "You swing.")];
    expect(isRetryOfLastPlayerMessage(log, "attack")).toBe(false);
  });

  it("is not a retry when the text differs", () => {
    expect(isRetryOfLastPlayerMessage([msg("player", "go north")], "go south")).toBe(false);
  });

  it("looks past system lines (warnings, dice) that are not an answer", () => {
    const log = [msg("player", "open the door"), msg("system", "⚠ something")];
    expect(isRetryOfLastPlayerMessage(log, "open the door")).toBe(true);
  });

  it("is false for an empty log", () => {
    expect(isRetryOfLastPlayerMessage([], "hello")).toBe(false);
  });
});
