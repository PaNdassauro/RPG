import { Fragment, type ReactNode } from "react";

export interface HighlightRegistry {
  npcs: ReadonlyArray<{ name: string; kind: "ally" | "foe" | "neutral" }>;
  places: ReadonlyArray<{ name: string }>;
}

const NPC_CLASS: Record<"ally" | "foe" | "neutral", string> = {
  ally: "font-bold text-[var(--color-char-ally)]",
  foe: "font-bold text-[var(--color-char-foe)]",
  neutral: "font-bold text-[var(--color-char-neutral)]",
};
const PLACE_CLASS = "font-bold text-[var(--color-place)]";

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap any registered NPC / place name in a colored span. Operates on a flat
 * string; the caller is responsible for not feeding pre-segmented React nodes.
 *
 * Why Unicode lookarounds: pt-BR campaigns produce names like "Tomás" or
 * "Sé do Forte" — ASCII `\b` would break the boundary. `(?<!\p{L})…(?!\p{L})`
 * forbids matching inside a longer word but still allows trailing apostrophes
 * ("Tomas's") and punctuation.
 */
export function highlightEntities(
  text: string,
  registry: HighlightRegistry,
): ReactNode[] {
  if (!text) return [text];

  const entries: Array<{ name: string; className: string }> = [];
  // NPCs registered first so an NPC named "River" wins over a place also called
  // "River" — the in-world meaning of an NPC name takes precedence.
  for (const npc of registry.npcs) {
    const trimmed = npc.name.trim();
    if (trimmed) entries.push({ name: trimmed, className: NPC_CLASS[npc.kind] });
  }
  for (const p of registry.places) {
    const trimmed = p.name.trim();
    if (trimmed) entries.push({ name: trimmed, className: PLACE_CLASS });
  }
  if (entries.length === 0) return [text];

  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });
  // Longest first so "Old Mill Gate" outranks "Mill" in the alternation.
  unique.sort((a, b) => b.name.length - a.name.length);

  const lookup = new Map<string, string>();
  for (const e of unique) lookup.set(e.name, e.className);

  const alternation = unique.map((e) => escapeForRegex(e.name)).join("|");
  const re = new RegExp(`(?<!\\p{L})(${alternation})(?!\\p{L})`, "gu");

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const matched = m[0];
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <span key={`${start}-${matched}`} className={lookup.get(matched) ?? ""}>
        {matched}
      </span>,
    );
    cursor = start + matched.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : [text];
}

/**
 * Render DM narration with **bold** markdown spans honored alongside the
 * existing NPC/place highlight pass. The DM is instructed to mark genuine
 * beats with `**…**` — a critical action, a sensory hit, a key revelation —
 * and the renderer turns those into `<strong>`. NPC and place names stay
 * auto-colored regardless, including inside a bold span.
 *
 * Matching is non-greedy and disallows newlines, so an unbalanced `**` in
 * mid-paragraph won't swallow the rest of the message.
 */
const BOLD_RE = /\*\*([^\n*][^*\n]*?)\*\*/g;

export function renderRichText(
  text: string,
  registry: HighlightRegistry,
): ReactNode[] {
  if (!text) return [text];
  if (!text.includes("**")) return highlightEntities(text, registry);
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  BOLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD_RE.exec(text)) !== null) {
    const start = m.index;
    if (start > cursor) {
      const segment = text.slice(cursor, start);
      out.push(
        <Fragment key={`p-${key++}`}>{highlightEntities(segment, registry)}</Fragment>,
      );
    }
    const inner = m[1] ?? "";
    out.push(
      <strong key={`b-${key++}`} className="font-bold text-text">
        {highlightEntities(inner, registry)}
      </strong>,
    );
    cursor = start + m[0].length;
  }
  if (cursor < text.length) {
    out.push(
      <Fragment key={`p-${key++}`}>
        {highlightEntities(text.slice(cursor), registry)}
      </Fragment>,
    );
  }
  return out.length > 0 ? out : highlightEntities(text, registry);
}
