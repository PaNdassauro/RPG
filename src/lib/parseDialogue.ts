/**
 * Split a player message into alternating action / speech segments.
 *
 * Convention:
 *   • Plain text  → action  (rendered italic, slightly muted)
 *   • "Quoted text" → speech (rendered with gold accent quotes)
 *
 * Both straight ("…") and curly ("…") quote pairs are accepted. Unmatched
 * quotes are treated as action — we don't drop the user's text.
 */

export type DialogueSegment =
  | { kind: "action"; text: string }
  | { kind: "speech"; text: string };

const QUOTE_PAIRS: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["“", "”"], // curly double quotes
];

export function parseDialogue(input: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let i = 0;
  let actionBuffer = "";

  const flushAction = () => {
    if (actionBuffer.length > 0) {
      segments.push({ kind: "action", text: actionBuffer });
      actionBuffer = "";
    }
  };

  while (i < input.length) {
    const ch = input[i]!;
    const pair = QUOTE_PAIRS.find(([open]) => open === ch);
    if (pair) {
      const closeIdx = input.indexOf(pair[1], i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        flushAction();
        segments.push({ kind: "speech", text: input.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }
    actionBuffer += ch;
    i++;
  }

  flushAction();
  return segments.filter((s) => s.text.length > 0);
}
