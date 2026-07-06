import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dices, ChevronDown, Sparkles, Search, X } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { DiceRoll } from "@/components/dice/DiceRoll";
import { parseDialogue } from "@/lib/parseDialogue";
import { parseDmMarkup } from "@/lib/parseDmMarkup";
import {
  highlightEntities,
  renderRichText,
  type HighlightRegistry,
} from "@/lib/highlightEntities";
import { useT } from "@/i18n";
import type { ChatMessage, DiceRollRecord } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

type EventRail = "damage" | "heal" | "milestone" | null;

function detectEventRail(parsed: ReturnType<typeof parseDmMarkup>): EventRail {
  if (parsed.damages.length > 0) return "damage";
  if (parsed.heals.length > 0) return "heal";
  if (
    parsed.xpAwards.length > 0 ||
    parsed.levelUp ||
    parsed.quests.some((q) => q.status === "completed")
  ) {
    return "milestone";
  }
  return null;
}

const EVENT_RAIL_CLASS: Record<NonNullable<EventRail>, string> = {
  damage: "bg-[var(--color-danger)]/40",
  heal: "bg-[var(--color-success)]/40",
  milestone: "bg-[var(--color-event)]/40",
};

export function NarrationLog() {
  const t = useT();
  const messages = useSessionStore((s) => s.messages);
  const draftDm = useSessionStore((s) => s.draftDm);
  const thinking = useSessionStore((s) => s.thinking);
  const streaming = useSessionStore((s) => s.streaming);
  const diceRolls = useSessionStore((s) => s.diceRolls);
  const character = useSessionStore((s) => s.character);
  const campaign = useSessionStore((s) => s.campaign);

  const registry = useMemo<HighlightRegistry>(
    () => ({
      npcs: campaign?.npcsMet ?? [],
      places: campaign?.placesVisited ?? [],
    }),
    [campaign?.npcsMet, campaign?.placesVisited],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Ctrl/Cmd+F opens the search bar without browser's native dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearch("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const lowerQuery = search.trim().toLowerCase();
  const filteredMessages = useMemo(() => {
    if (!lowerQuery) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(lowerQuery));
  }, [messages, lowerQuery]);

  // Track scroll position; pause auto-scroll when user scrolls up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distance < 32;
      setPinnedToBottom(atBottom);
      if (atBottom) setHasNew(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll on new content if pinned; otherwise mark "new content" for the jump button.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedToBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      setHasNew(true);
    }
  }, [messages, draftDm, thinking, pinnedToBottom]);

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setHasNew(false);
  }

  return (
    <div className="relative flex h-full flex-col">
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-1/2 top-2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-md border border-line bg-surface/95 px-3 py-1.5 shadow backdrop-blur"
          >
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("play.narrationLog.searchPlaceholder")}
              className="w-56 bg-transparent text-sm text-text placeholder:text-text-muted/40 focus:outline-none"
            />
            <span className="font-mono text-[10px] text-text-muted/70">
              {lowerQuery
                ? t("play.narrationLog.searchHits", { n: filteredMessages.length })
                : t("play.narrationLog.searchKbd")}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearch("");
              }}
              className="text-text-muted hover:text-text"
              aria-label="close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-1 py-6"
      >
        <div className="mx-auto flex max-w-prose flex-col gap-6">
          {filteredMessages.length === 0 && !thinking && !streaming && (
            <p className="text-center text-xs uppercase tracking-[0.3em] text-text-muted/50">
              {lowerQuery
                ? t("play.narrationLog.searchNone")
                : t("play.narrationLog.worldQuiet")}
            </p>
          )}

          {filteredMessages.map((m) => (
            <Message
              key={m.id}
              message={m}
              characterInitial={character?.name?.[0]?.toUpperCase() ?? "?"}
              diceRolls={diceRolls}
              registry={registry}
            />
          ))}

          {thinking && !lowerQuery && <ThinkingPulse text={t("play.narrationLog.dmThinking")} />}
          {draftDm && !lowerQuery && <DmDraft text={draftDm} />}
        </div>
      </div>

      <AnimatePresence>
        {hasNew && !pinnedToBottom && (
          <motion.button
            type="button"
            onClick={jumpToBottom}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-accent-muted/60 bg-accent/15 px-4 py-1.5 font-display text-[10px] uppercase tracking-[0.3em] text-accent shadow-lg backdrop-blur transition hover:bg-accent/25"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {t("play.narrationLog.jumpButton")}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MessageProps {
  message: ChatMessage;
  characterInitial: string;
  diceRolls: Record<string, DiceRollRecord>;
  registry: HighlightRegistry;
}

function Message({ message, characterInitial, diceRolls, registry }: MessageProps) {
  if (message.role === "dm")
    return <DmMessage text={message.content} registry={registry} animateGlow />;
  if (message.role === "player")
    return (
      <PlayerMessage
        text={message.content}
        initial={characterInitial}
        registry={registry}
      />
    );
  if (message.role === "system")
    return (
      <SystemMessage
        text={message.content}
        diceRollIds={message.diceRollIds}
        diceRolls={diceRolls}
      />
    );
  return null;
}

function DmMessage({
  text,
  registry,
  animateGlow,
}: {
  text: string;
  registry: HighlightRegistry;
  animateGlow?: boolean;
}) {
  const parsed = parseDmMarkup(text);
  const cleaned = parsed.cleaned;
  const eventRail = detectEventRail(parsed);
  return (
    <article className="relative">
      {animateGlow && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="pointer-events-none absolute -left-3 top-0 h-full w-[2px] rounded-full bg-[var(--color-gold)]/70 shadow-[0_0_18px_2px_rgba(212,175,55,0.55)]"
        />
      )}
      {eventRail && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -left-1.5 top-0 h-full w-[2px] rounded-full",
            EVENT_RAIL_CLASS[eventRail],
          )}
        />
      )}
      <p className="whitespace-pre-line font-display text-[15px] leading-relaxed text-text">
        {renderRichText(cleaned, registry)}
      </p>
    </article>
  );
}

function DmDraft({ text }: { text: string }) {
  // Token-by-token reveal — strip markup live so a half-formed [CHECK ...]
  // doesn't flash through the narration mid-stream. Bold markers (`**`) are
  // stripped during streaming and re-applied when the message finalizes; this
  // avoids the asterisks blinking visibly as tokens arrive.
  const cleaned = parseDmMarkup(text).cleaned.replace(/\*\*/g, "");
  const tokens = cleaned.split(/(\s+)/);
  return (
    <article className="relative">
      <motion.div
        aria-hidden
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="pointer-events-none absolute -left-3 top-0 h-full w-[2px] rounded-full bg-[var(--color-gold)]/70 shadow-[0_0_18px_2px_rgba(212,175,55,0.55)]"
      />
      <p className="whitespace-pre-line font-display text-[15px] leading-relaxed text-text">
        {tokens.map((t, i) => (
          <motion.span
            key={`${i}-${t.length}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            {t}
          </motion.span>
        ))}
      </p>
    </article>
  );
}

function PlayerMessage({
  text,
  initial,
  registry,
}: {
  text: string;
  initial: string;
  registry: HighlightRegistry;
}) {
  const segments = parseDialogue(text);
  return (
    <article className="ml-6 flex gap-3 border-l-2 border-accent-muted/60 pl-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-muted/60 bg-accent/10 font-display text-xs text-accent">
        {initial}
      </div>
      <p className="whitespace-pre-line text-[14px] leading-relaxed text-text/90">
        {segments.map((seg, i) =>
          seg.kind === "speech" ? (
            <span key={i} className="text-text">
              <span className="font-display text-[var(--color-gold)]" aria-hidden>
                “
              </span>
              <span>{seg.text}</span>
              <span className="font-display text-[var(--color-gold)]" aria-hidden>
                ”
              </span>
            </span>
          ) : (
            <span key={i} className="italic text-text-muted/80">
              {highlightEntities(seg.text, registry)}
            </span>
          ),
        )}
      </p>
    </article>
  );
}

interface SystemMessageProps {
  text: string;
  diceRollIds: string[];
  diceRolls: Record<string, DiceRollRecord>;
}

function SystemMessage({ text, diceRollIds, diceRolls }: SystemMessageProps) {
  const rolls = diceRollIds.map((id) => diceRolls[id]).filter(Boolean) as DiceRollRecord[];
  const Icon = rolls.length > 0 ? Dices : Sparkles;

  return (
    <article
      className={cn(
        "flex items-start gap-3 rounded-md border border-line/70 bg-surface/60 px-4 py-3 font-mono text-xs text-text-muted",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-muted" />
      <div className="flex-1">
        {text && <p className="text-text-muted">{text}</p>}
        {rolls.map((r) => (
          <div key={r.id} className="mt-2">
            <DiceRoll
              result={{
                expression: r.expression,
                mode: r.mode,
                rolls: r.rolls,
                kept: r.kept,
                modifier: r.modifier,
                total: r.total,
                isCritical: r.isCritical,
                isFumble: r.isFumble,
              }}
              dc={r.dc}
              autoPlay
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function ThinkingPulse({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="font-display text-sm italic text-accent-muted"
    >
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        {text}
      </motion.span>
    </motion.div>
  );
}
