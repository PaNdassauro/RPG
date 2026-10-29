/**
 * Long-term memory maintenance (see ./memory). Writes chapters for the turns
 * that left the verbatim window (see ./context) and folds old chapters into arcs.
 *
 *  - Fires fire-and-forget after a DM turn finalizes (caller awaits the
 *    DM stream first; this runs after the player sees the result).
 *  - Reuses the active provider's streamCompletion API; no new transport.
 *  - Uses an in-memory lock so simultaneous turns don't double-summarize.
 *  - Append-only: each chapter is written from the raw text of its span, one
 *    call per chapter, and persisted as soon as it exists, so a failure midway
 *    keeps the progress made. The rest is picked up on a later turn.
 *  - No-ops on the stub provider or when no provider is configured; provider
 *    errors are logged, not thrown.
 *  - Chapters and arcs are the permanent record, so Claude uses its default
 *    (Sonnet) model rather than a cheap one.
 */
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { db } from "@/db/schema";
import { createProviderFromRecord } from "@/ai/providers";
import { DEFAULT_CLAUDE_MODEL } from "@/ai/providers/anthropic";
import type { LLMProvider } from "@/ai/provider";
import { narrativeCosts, profileFor, windowStart } from "@/ai/context";
import {
  applyMemoryUpdate,
  arcFoldCandidates,
  chunkSpans,
  MAX_CHAPTERS_PER_RUN,
  spanTranscript,
  turnRange,
  type MemoryUpdate,
} from "@/ai/memory";
import { dmLanguageTag } from "@/i18n";
import { newId } from "@/lib/id";
import type { Arc, Chapter } from "@/schemas/campaign";

const inFlight = new Set<string>();

export async function maybeSummarize(opts: { force?: boolean } = {}): Promise<void> {
  const session = useSessionStore.getState();
  const { campaign, messages } = session;
  if (!campaign) return;
  const campaignId = campaign.id;

  const costs = narrativeCosts(messages);
  const profile = profileFor(useKeysStore.getState().activeProvider);
  const done = campaign.summaryThroughTurn ?? 0;
  // Chronicle the turns that left the prompt's verbatim window (all of them
  // when forced).
  const through = opts.force ? costs.length : windowStart(costs, profile);
  const spans = chunkSpans(done, through);
  const needsFold = arcFoldCandidates(campaign.chapters ?? []).length > 0;
  if (spans.length === 0 && !needsFold) return;
  if (inFlight.has(campaignId)) return;

  const picked = pickProvider();
  if (!picked) return;

  inFlight.add(campaignId);
  try {
    const chapters: Chapter[] = [...(campaign.chapters ?? [])];
    // A forced run is the player waiting on the recap: it goes to the end.
    for (const span of opts.force ? spans : spans.slice(0, MAX_CHAPTERS_PER_RUN)) {
      const text = (
        await runChapter(
          picked.provider,
          spanTranscript(messages, span.from, span.to),
          chapters[chapters.length - 1]?.text,
          picked.model,
        )
      ).trim();
      if (text.length === 0) {
        console.warn("[summarizer] empty chapter; will retry on a later turn");
        return;
      }
      const chapter: Chapter = {
        id: newId(),
        fromTurn: span.from,
        toTurn: span.to,
        text,
        createdAt: Date.now(),
      };
      await persist(campaignId, { chapters: [chapter] });
      chapters.push(chapter);
    }

    for (let fold = arcFoldCandidates(chapters); fold.length > 0; fold = arcFoldCandidates(chapters)) {
      const text = (await runArc(picked.provider, fold, picked.model)).trim();
      if (text.length === 0) {
        console.warn("[summarizer] empty arc; will retry on a later turn");
        return;
      }
      const arc: Arc = {
        id: newId(),
        fromTurn: fold[0]!.fromTurn,
        toTurn: fold[fold.length - 1]!.toTurn,
        text,
        createdAt: Date.now(),
      };
      const chapterIds = fold.map((c) => c.id);
      await persist(campaignId, { arc: { arc, chapterIds } });
      for (let i = 0; i < chapters.length; i++) {
        if (chapterIds.includes(chapters[i]!.id)) chapters[i] = { ...chapters[i]!, arcId: arc.id };
      }
    }
  } catch (err) {
    // Best-effort: a failure must not disrupt play, but it must not vanish.
    console.error("[summarizer] failed to update the campaign memory", err);
  } finally {
    inFlight.delete(campaignId);
  }
}

/** Write to the open campaign through the store; to the stored record if the player moved on. */
async function persist(campaignId: string, update: MemoryUpdate): Promise<void> {
  const store = useSessionStore.getState();
  if (store.campaign?.id === campaignId) {
    await store.appendMemory(update);
    return;
  }
  const stored = await db.campaigns.get(campaignId);
  if (!stored) return;
  await db.campaigns.put(applyMemoryUpdate(stored, update));
}

/** Active provider plus the model to use for memory (Claude's default; others keep their own). */
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
    model: record.providerId === "claude" ? DEFAULT_CLAUDE_MODEL : record.model,
  };
}

async function runChapter(
  provider: LLMProvider,
  transcript: string,
  previousChapter: string | undefined,
  model: string | undefined,
): Promise<string> {
  const language = dmLanguageTag();
  const system = `You are the chronicler of a one-on-one D&D 5e campaign. Write the next chapter of its permanent record so a future dungeon master can pick the story up cold. Write in ${language}.

Goals:
- Keep every named NPC, place, faction and item. Never drop a name.
- Keep promises made, debts owed, clues found and unresolved threads.
- Say what happened and what changed, in order. Recall matters more than polish.

Constraints:
- One paragraph, 100–150 words, in a plain chronicle voice.
- No bullet lists, no headings, no quotes, no preamble.
- Reply only with the chapter text.${
    previousChapter
      ? "\n- The previous chapter is given for continuity only. Do not repeat or rewrite it."
      : ""
  }`;

  const userContent = `${
    previousChapter ? `# Previous chapter (read-only context)\n${previousChapter}\n\n` : ""
  }# Events to chronicle\n${transcript}`;
  return runCompletion(provider, system, userContent, model);
}

async function runArc(
  provider: LLMProvider,
  chapters: Chapter[],
  model: string | undefined,
): Promise<string> {
  const language = dmLanguageTag();
  const system = `You are the chronicler of a one-on-one D&D 5e campaign. Fold the chapters below into a single arc of its permanent record. Write in ${language}.

Goals:
- Keep every named NPC, place, faction and item that still matters. Never drop a name.
- Keep promises, debts, clues and threads that are still open; compress what is settled.
- Tell the through-line in order: what the player did, why, and what it led to.

Constraints:
- One paragraph, 150–250 words, in a plain chronicle voice.
- No bullet lists, no headings, no quotes, no preamble.
- Reply only with the arc text.`;

  const userContent = `# Chapters to fold\n${chapters
    .map((c) => `[turns ${turnRange(c.fromTurn, c.toTurn)}] ${c.text.trim()}`)
    .join("\n\n")}`;
  return runCompletion(provider, system, userContent, model);
}

async function runCompletion(
  provider: LLMProvider,
  system: string,
  userContent: string,
  model: string | undefined,
): Promise<string> {
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
        throw new Error(`memory stream ended with reason "${ev.reason}"`);
      }
      break;
    }
  }
  return out;
}
