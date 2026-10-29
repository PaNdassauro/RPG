/**
 * Rolling-summary maintenance. Periodically condenses the older portion of
 * a campaign's narrative so the DM keeps continuity beyond the verbatim
 * window (see ./context).
 *
 *  - Fires fire-and-forget after a DM turn finalizes (caller awaits the
 *    DM stream first; this runs after the player sees the result).
 *  - Reuses the active provider's streamCompletion API; no new transport.
 *  - Uses an in-memory lock so simultaneous turns don't double-summarize.
 *  - Incremental: folds only the turns that left the window since the last
 *    summary into the existing one, and only once SUMMARY_MIN_NEW have piled up.
 *  - No-ops on the stub provider or when no provider is configured; provider
 *    errors are logged, not thrown.
 *  - Uses the cheap model when the provider is Claude.
 */
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { db } from "@/db/schema";
import { createProviderFromRecord } from "@/ai/providers";
import { CHEAP_CLAUDE_MODEL } from "@/ai/providers/anthropic";
import type { LLMProvider } from "@/ai/provider";
import { SUMMARY_MIN_NEW, windowStart } from "@/ai/context";
import { dmLanguageTag } from "@/i18n";
import type { ChatMessage } from "@/schemas/campaign";

const inFlight = new Set<string>();

export async function maybeSummarize(opts: { force?: boolean } = {}): Promise<void> {
  const session = useSessionStore.getState();
  const { campaign, messages } = session;
  if (!campaign) return;
  const campaignId = campaign.id;

  const narrative = messages.filter(
    (m) => m.role === "dm" || m.role === "player",
  );
  const done = campaign.summaryThroughTurn ?? 0;
  // Fold in only the turns that left the prompt's verbatim window (all of
  // them when forced), and only once enough have piled up to be worth a call.
  const through = opts.force ? narrative.length : windowStart(narrative.length);
  const fresh = through - done;
  if (fresh <= 0) return;
  if (!opts.force && fresh < SUMMARY_MIN_NEW) return;
  if (inFlight.has(campaignId)) return;

  const picked = pickProvider();
  if (!picked) return;

  inFlight.add(campaignId);
  try {
    const summary = await runSummary(
      picked.provider,
      narrative.slice(done, through),
      campaign.rollingSummary ?? "",
      picked.model,
    );
    const text = summary.trim();
    if (text.length === 0) {
      console.warn("[summarizer] empty summary; keeping the previous one");
      return;
    }
    if (useSessionStore.getState().campaign?.id === campaignId) {
      await useSessionStore.getState().updateRollingSummary(text, through);
    } else {
      // The player moved to another campaign while we were summarizing.
      await db.campaigns.update(campaignId, {
        rollingSummary: text,
        summaryThroughTurn: through,
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    // Best-effort: a failure must not disrupt play, but it must not vanish.
    console.error("[summarizer] failed to update the rolling summary", err);
  } finally {
    inFlight.delete(campaignId);
  }
}

/** Active provider plus the cheap model to use for summaries (Claude only). */
function pickProvider(): { provider: LLMProvider; model: string | undefined } | null {
  const keys = useKeysStore.getState();
  const active = keys.activeProvider;
  if (!active) return null;
  const record = keys.records[active];
  if (!record) return null;
  const provider = createProviderFromRecord(record);
  if (!provider) return null;
  return {
    provider,
    model: record.providerId === "claude" ? CHEAP_CLAUDE_MODEL : undefined,
  };
}

async function runSummary(
  provider: LLMProvider,
  toSummarize: ChatMessage[],
  existingSummary: string,
  model: string | undefined,
): Promise<string> {
  const language = dmLanguageTag();
  const system = `You are summarizing a one-on-one D&D 5e campaign so a future dungeon master can pick it up cold. Output a single dense paragraph in ${language}.

Goals:
- Preserve all named NPCs, locations, factions, items, and clues — do NOT omit names.
- Capture the through-line: what the player has been doing and why.
- Note unresolved threads (a debt owed, a question unanswered, a quest active).
- Keep the tone neutral and chronicling — this is a campaign log, not prose.

Constraints:
- One paragraph, 120–250 words.
- No bullet lists, no headings, no quotes.
- Reply only with the summary text. No preamble, no markdown.

If a previous summary is provided, fold it into the new one — do not lose facts.`;

  const transcript = toSummarize
    .map((m) => `${m.role === "dm" ? "DM" : "Player"}: ${m.content.trim()}`)
    .join("\n\n");

  const userContent = `${
    existingSummary ? `# Previous summary\n${existingSummary}\n\n` : ""
  }# New events to fold in\n${transcript}`;

  let out = "";
  for await (const ev of provider.streamCompletion({
    system,
    messages: [{ role: "user", content: userContent }],
    tools: [],
    ...(model ? { model } : {}),
  })) {
    if (ev.kind === "text" && ev.delta) out += ev.delta;
    if (ev.kind === "error") throw new Error(ev.message);
    if (ev.kind === "done") {
      if (ev.reason !== "stop") {
        throw new Error(`summary stream ended with reason "${ev.reason}"`);
      }
      break;
    }
  }
  return out;
}
