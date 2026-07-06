import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Search } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { spellsForClass } from "@/data/srd/lazy";
import { getClassLevel } from "@/data/srd";
import type { SrdSpell } from "@/data/srd/types";
import { spellcasting } from "@/state/sheetDerived";
import { cn } from "@/lib/cn";

interface SpellPickerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Spell selection modal. Lets the player choose cantrips and known/prepared
 * spells from the SRD list filtered to their primary spellcasting class.
 *
 * Caps come from the SRD class level table (`cantrips_known`, `spells_known`).
 * For prepared casters (cleric/druid/wizard) `spells_known` is null in SRD —
 * we approximate the prepared count as `lvl + abilityMod` (RAW for cleric).
 */
export function SpellPicker({ open, onClose }: SpellPickerProps) {
  const t = useT();
  const character = useSessionStore((s) => s.character);
  const setKnownSpells = useSessionStore((s) => s.setKnownSpells);

  const sc = character ? spellcasting(character) : null;
  const primaryClass = character?.classes.find((c) =>
    [
      "bard",
      "cleric",
      "druid",
      "paladin",
      "ranger",
      "sorcerer",
      "warlock",
      "wizard",
    ].includes(c.classId),
  );

  // Caps from SRD class table; "prepared" fallback for full casters.
  const caps = useMemo(() => {
    if (!character || !primaryClass) {
      return { cantripsKnown: 0, spellsKnown: 0, maxSpellLevel: 0 };
    }
    const lvlEntry = getClassLevel(primaryClass.classId, primaryClass.level);
    const spc = lvlEntry?.spellcasting;
    let cantripsKnown = spc?.cantrips_known ?? 0;
    let spellsKnown = spc?.spells_known ?? 0;
    // Full prepared casters (cleric/druid/wizard) approximate: ability mod +
    // level, min 1. We use the spellcasting ability already derived.
    if (
      ["cleric", "druid", "wizard"].includes(primaryClass.classId) &&
      sc &&
      !spellsKnown
    ) {
      spellsKnown = Math.max(1, sc.abilityMod + primaryClass.level);
    }
    // Highest slot level the player has access to.
    let maxSpellLevel = 0;
    if (spc) {
      for (let l = 9; l >= 1; l--) {
        const k = `spell_slots_level_${l}` as keyof typeof spc;
        if ((spc[k] ?? 0) > 0) {
          maxSpellLevel = l;
          break;
        }
      }
    }
    return { cantripsKnown, spellsKnown, maxSpellLevel };
  }, [character, primaryClass, sc]);

  const [allSpells, setAllSpells] = useState<SrdSpell[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedCantrips, setPickedCantrips] = useState<Set<string>>(new Set());
  const [pickedSpells, setPickedSpells] = useState<Set<string>>(new Set());

  // Load on open. Cheap repeat: lazy module caches the JSON.
  useEffect(() => {
    if (!open || !primaryClass) return;
    setLoading(true);
    void spellsForClass(primaryClass.classId).then((list) => {
      setAllSpells(list);
      setLoading(false);
    });
  }, [open, primaryClass]);

  // Pre-fill from current character selection.
  useEffect(() => {
    if (!open || !character) return;
    setPickedCantrips(new Set(character.cantrips ?? []));
    setPickedSpells(new Set(character.spellsKnown ?? []));
  }, [open, character]);

  const lowerQuery = query.trim().toLowerCase();
  const cantrips = useMemo(
    () =>
      allSpells
        .filter((s) => s.level === 0)
        .filter((s) =>
          !lowerQuery || s.name.toLowerCase().includes(lowerQuery),
        ),
    [allSpells, lowerQuery],
  );
  const leveled = useMemo(
    () =>
      allSpells
        .filter((s) => s.level >= 1 && s.level <= caps.maxSpellLevel)
        .filter((s) =>
          !lowerQuery || s.name.toLowerCase().includes(lowerQuery),
        ),
    [allSpells, caps.maxSpellLevel, lowerQuery],
  );

  function toggleCantrip(idx: string) {
    setPickedCantrips((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < caps.cantripsKnown) next.add(idx);
      return next;
    });
  }
  function toggleSpell(idx: string) {
    setPickedSpells((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < caps.spellsKnown) next.add(idx);
      return next;
    });
  }

  async function onSave() {
    await setKnownSpells({
      cantrips: Array.from(pickedCantrips),
      spellsKnown: Array.from(pickedSpells),
    });
    onClose();
  }

  if (!open) return null;
  if (!character || !primaryClass || (!caps.cantripsKnown && !caps.spellsKnown)) {
    // Non-caster or class with no L1 spellcasting (paladin/ranger at L1) — surface a friendly message.
    return (
      <Backdrop onClose={onClose}>
        <p className="text-sm text-text-muted">
          {t("play.spellPicker.notACaster")}
        </p>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <header className="flex items-center justify-between border-b border-line/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="font-display text-base text-text">
            {t("play.spellPicker.title")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="border-b border-line/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("play.spellPicker.searchPlaceholder")}
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted/40 focus:outline-none"
          />
          <span className="font-mono text-[10px] text-text-muted">
            {pickedCantrips.size}/{caps.cantripsKnown} · {pickedSpells.size}/{caps.spellsKnown}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 text-sm">
        {loading ? (
          <p className="text-text-muted">{t("play.spellPicker.loading")}</p>
        ) : (
          <>
            {caps.cantripsKnown > 0 && (
              <SpellGroup
                title={t("play.spellPicker.cantripsHeading", {
                  picked: pickedCantrips.size,
                  cap: caps.cantripsKnown,
                })}
                spells={cantrips}
                picked={pickedCantrips}
                onToggle={toggleCantrip}
                atCap={pickedCantrips.size >= caps.cantripsKnown}
              />
            )}
            {caps.spellsKnown > 0 && (
              <SpellGroup
                title={t("play.spellPicker.spellsHeading", {
                  picked: pickedSpells.size,
                  cap: caps.spellsKnown,
                })}
                spells={leveled}
                picked={pickedSpells}
                onToggle={toggleSpell}
                atCap={pickedSpells.size >= caps.spellsKnown}
              />
            )}
          </>
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line/60 bg-surface/95 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line bg-surface px-4 py-2 font-display text-[11px] uppercase tracking-widest text-text-muted hover:border-accent-muted hover:text-text"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md border border-accent bg-accent/15 px-4 py-2 font-display text-[11px] uppercase tracking-widest text-accent hover:bg-accent/25"
        >
          {t("play.spellPicker.save")}
        </button>
      </footer>
    </Backdrop>
  );
}

function SpellGroup({
  title,
  spells,
  picked,
  onToggle,
  atCap,
}: {
  title: string;
  spells: SrdSpell[];
  picked: Set<string>;
  onToggle: (idx: string) => void;
  atCap: boolean;
}) {
  if (spells.length === 0) return null;
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
        {title}
      </h3>
      <ul className="grid grid-cols-1 gap-1.5">
        {spells.map((s) => {
          const isPicked = picked.has(s.index);
          const lock = !isPicked && atCap;
          return (
            <li key={s.index}>
              <button
                type="button"
                disabled={lock}
                onClick={() => onToggle(s.index)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition",
                  isPicked
                    ? "border-accent bg-accent/10 text-text"
                    : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text",
                  lock && "cursor-not-allowed opacity-40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm">
                    {s.name}
                    {s.concentration && (
                      <span className="ml-2 font-mono text-[10px] text-accent-muted">
                        · concentration
                      </span>
                    )}
                    {s.ritual && (
                      <span className="ml-1 font-mono text-[10px] text-accent-muted">
                        · ritual
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-text-muted/70">
                    {s.school.name} · {s.casting_time} · {s.range} · {s.duration}
                  </p>
                  {s.desc?.[0] && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-muted">
                      {s.desc[0]}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-sm border",
                    isPicked
                      ? "border-accent bg-accent/30"
                      : "border-line bg-surface",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-[2px] px-4"
      >
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-line bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)]"
        >
          {children}
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
