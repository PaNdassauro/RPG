import type { ChatMessage } from "@/schemas/campaign";

/**
 * Is `text` a retry of the player's last action? True when the newest
 * player/DM message is the player's own, with identical text: the DM never
 * answered it (the turn failed, stalled or was cancelled), so sending it again
 * must re-run the turn on the existing message, not log it a second time.
 * System lines (dice, warnings) in between don't count as an answer.
 */
export function isRetryOfLastPlayerMessage(messages: readonly ChatMessage[], text: string): boolean {
  const wanted = text.trim();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "system") continue;
    return m.role === "player" && m.content.trim() === wanted;
  }
  return false;
}
