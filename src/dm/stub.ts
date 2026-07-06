/**
 * Stand-in DM service. Streams templated narration so we can validate the
 * play screen end-to-end before wiring real LLM providers. Same async-iterable
 * shape as `LLMProvider.streamCompletion` so swapping it out later is a noop
 * for callers. Narration text comes from the i18n dictionaries so it tracks
 * the player's chosen language.
 */
import type { CampaignSetting } from "@/data/settings";
import type { Character } from "@/schemas/character";
import { tList } from "@/i18n";

export interface StubStreamEvent {
  kind: "text" | "done";
  delta?: string;
}

interface StubArgs {
  setting: CampaignSetting;
  character: Character;
  /** Empty string for the opening narration. */
  playerInput: string;
  /** True when no DM messages exist yet — emit the opening scene. */
  isFirstTurn: boolean;
}

export async function* stubDmTurn(args: StubArgs): AsyncIterable<StubStreamEvent> {
  await delay(700);
  const text = args.isFirstTurn
    ? openingNarration(args.setting, args.character)
    : continuationNarration(args.setting, args.character, args.playerInput);

  for (const chunk of chunkize(text)) {
    yield { kind: "text", delta: chunk };
    await delay(28 + Math.random() * 24);
  }
  yield { kind: "done" };
}

function chunkize(text: string): string[] {
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function openingNarration(setting: CampaignSetting, character: Character): string {
  const pool = tList(`stubDm.openings.${setting.id}`);
  const list = pool.length > 0 ? pool : tList("stubDm.openings.ashfall");
  return pick(list).replace(/\{name\}/g, character.name);
}

function continuationNarration(
  setting: CampaignSetting,
  character: Character,
  input: string,
): string {
  const pool = tList(`stubDm.reflections.${setting.id}`);
  const list = pool.length > 0 ? pool : tList("stubDm.reflections.ashfall");
  const echo = input.trim().length > 0 ? `"${truncate(input, 80)}"` : "—";
  return pick(list)
    .replace(/\{name\}/g, character.name)
    .replace(/\{echo\}/g, echo);
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]!;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
