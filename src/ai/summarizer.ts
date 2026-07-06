/**
 * Rolling-summary maintenance. Periodically condenses the older portion of
 * a campaign's narrative so the DM keeps continuity beyond the 24-turn
 * verbatim window.
 *
 *  - Fires fire-and-forget after a DM turn finalizes (caller awaits the
 *    DM stream first; this runs after the player sees the result).
 *  - Reuses the active provider's streamCompletion API; no new transport.
 *  - Uses an in-memory lock so simultaneous turns don't double-summarize.
 *  - Quietly no-ops on stub provider, missing provider, or provider error.
 *  - Keeps the DM's pacing in mind: the latest `KEEP_VERBATIM` narrative
 *    turns are not summarized (the prompt window covers them verbatim).
 */
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { createAnthropicProvider } from "@/ai/providers/anthropic";
import { createOpenAIProvider } from "@/ai/providers/openai";
import type { LLMProvider } from "@/ai/provider";
import { dmLanguageTag } from "@/i18n";
import type { ChatMessage } from "@/schemas/campaign";

/** Summarize when narrative count exceeds this. */
const SUMMARY_TRIGGER = 30;
/** Latest turns kept out of the summary (the prompt sends these verbatim). */
const KEEP_VERBATIM = 18;

const inFlight = new Set<string>();

export async function maybeSummarize(opts: { force?: boolean } = {}): Promise<void> {
  const session = useSessionStore.getState();
  const { campaign, messages } = session;
  if (!campaign) return;

  const narrative = messages.filter(
    (m) => m.role === "dm" || m.role === "player",
  );
  if (!opts.force && narrative.length <= SUMMARY_TRIGGER) return;

  const through = opts.force
    ? narrative.length
    : narrative.length - KEEP_VERBATIM;
  if (!opts.force && through <= (campaign.summaryThroughTurn ?? 0)) return;
  if (inFlight.has(campaign.id)) return;

  const provider = pickProvider();
  if (!provider) return;

  const toSummarize = narrative.slice(0, through);
  inFlight.add(campaign.id);
  try {
    const summary = await runSummary(
      provider,
      toSummarize,
      campaign.rollingSummary ?? "",
    );
    if (summary && summary.trim().length > 0) {
      await useSessionStore
        .getState()
        .updateRollingSummary(summary.trim(), through);
    }
  } catch {
    // Summarization is best-effort. A failure shouldn't disrupt play.
  } finally {
    inFlight.delete(campaign.id);
  }
}

function pickProvider(): LLMProvider | null {
  const keys = useKeysStore.getState();
  const active = keys.activeProvider;
  if (!active) return null;
  const record = keys.records[active];
  if (!record) return null;
  if (record.providerId === "claude") {
    return createAnthropicProvider({ apiKey: record.key, model: record.model });
  }
  if (record.providerId === "openai") {
    return createOpenAIProvider({
      apiKey: record.key,
      model: record.model,
      ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
    });
  }
  return null;
}

async function runSummary(
  provider: LLMProvider,
  toSummarize: ChatMessage[],
  existingSummary: string,
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
  })) {
    if (ev.kind === "text" && ev.delta) out += ev.delta;
    if (ev.kind === "error") throw new Error(ev.message);
    if (ev.kind === "done") break;
  }
  return out;
}
