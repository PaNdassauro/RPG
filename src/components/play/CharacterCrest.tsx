import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { Camera, Sparkles, Star, X } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { getRace, getSubrace, getClass } from "@/data/srd";
import { getPortrait } from "@/data/portraits";
import { ABILITIES, abilityModifier, type Ability } from "@/schemas/character";
import { armorClass, spellcasting } from "@/state/sheetDerived";
import { encumbranceLevel } from "@/engine/inventory";
import { progressToNext, xpToNext } from "@/engine/xp";
import { useT } from "@/i18n";

export function CharacterCrest() {
  const t = useT();
  const ABILITY_LABEL: Record<Ability, string> = {
    str: "STR",
    dex: "DEX",
    con: "CON",
    int: "INT",
    wis: "WIS",
    cha: "CHA",
  };
  const character = useSessionStore((s) => s.character);
  const endConcentration = useSessionStore((s) => s.endConcentration);
  const spendInspiration = useSessionStore((s) => s.spendInspiration);
  const setPortraitData = useSessionStore((s) => s.setPortraitData);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { hpFx, consumeHpFx } = useSessionStore(
    useShallow((s) => ({ hpFx: s.hpFx, consumeHpFx: s.consumeHpFx })),
  );
  if (!character) return null;
  const sc = spellcasting(character);
  const portraitDataUrl = character.portraitId?.startsWith("data:")
    ? character.portraitId
    : null;

  const race = character.raceId ? getRace(character.raceId) : null;
  const subrace = character.subraceId ? getSubrace(character.subraceId) : null;
  const klass = character.classes[0] ? getClass(character.classes[0].classId) : null;
  const level = character.classes.reduce((sum, c) => sum + c.level, 0);

  const heritage = [subrace?.name, race?.name].filter(Boolean).join(" · ");
  const calling = klass?.name ?? "—";

  const hp = character.hp;
  const hpPct = hp.max > 0 ? Math.max(0, hp.current) / hp.max : 0;
  const hpColor =
    hpPct > 0.5
      ? "var(--color-accent)"
      : hpPct > 0.25
        ? "#d49a37"
        : "var(--color-danger)";

  // Flash a brief overlay color on the HP bar whenever the most recent FX fires.
  const lastFx = hpFx[hpFx.length - 1] ?? null;

  // Lucide icon fallback if no uploaded image.
  const portrait = getPortrait(portraitDataUrl ? undefined : character.portraitId);
  const PortraitIcon = portrait.icon;

  async function onPortraitFile(file: File) {
    // Constrain to ~1MB and to a sensible square crop via canvas. Skip canvas
    // for simplicity here — modern phones produce <2MB; toast warn on huge.
    if (file.size > 4 * 1024 * 1024) {
      // eslint-disable-next-line no-console
      console.warn("Portrait too big — skipped");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      await setPortraitData(dataUrl);
    };
    reader.readAsDataURL(file);
  }
  const xpInfo = xpToNext(character.xp, level);
  const xpProgress = progressToNext(character.xp, level);

  return (
    <aside className="sticky top-6 flex w-full flex-col gap-5 rounded-md border border-line bg-surface/40 p-5 backdrop-blur">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-accent-muted/40 bg-canvas/60 text-accent transition hover:border-accent"
          title={t("play.crest.uploadPortrait")}
        >
          {portraitDataUrl ? (
            <img src={portraitDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <PortraitIcon className="h-7 w-7" />
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-canvas/80 py-0.5 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-3 w-3 text-accent" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPortraitFile(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            {t("play.crest.hero")}
          </p>
          <h3 className="mt-0.5 font-display text-xl text-text leading-tight">
            {character.name}
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {heritage} · {calling} · L{level}
          </p>
        </div>
      </div>

      {level < 20 && (
        <section>
          <div className="mb-1 flex items-center justify-between font-mono text-xs text-text-muted">
            <span>{t("play.crest.xp")}</span>
            <span className="text-text">
              {character.xp.toLocaleString()} ·{" "}
              <span className="text-text-muted">
                +{xpInfo.needed.toLocaleString()} → L{level + 1}
              </span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("play.crest.xp")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(xpProgress * 100)}
            className="h-1.5 overflow-hidden rounded-full border border-line bg-surface"
          >
            {/* scaleX instead of width: transform-only, no layout per frame. */}
            <motion.div
              initial={false}
              animate={{ scaleX: xpProgress }}
              style={{ transformOrigin: "left" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full w-full bg-accent-muted"
            />
          </div>
        </section>
      )}

      <section>
        <div className="mb-1.5 flex items-center justify-between font-mono text-xs text-text-muted">
          <span>{t("play.crest.hp")}</span>
          <motion.span
            key={hp.current}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-text"
          >
            {hp.current} / {hp.max}
            {hp.temp > 0 && (
              <span className="ml-1 text-accent-muted">+{hp.temp}</span>
            )}
          </motion.span>
        </div>
        <div
          role="progressbar"
          aria-label={t("play.crest.hp")}
          aria-valuemin={0}
          aria-valuemax={hp.max}
          aria-valuenow={hp.current}
          className="relative h-2 overflow-hidden rounded-full border border-line bg-surface"
        >
          <motion.div
            initial={false}
            animate={{ scaleX: hpPct, backgroundColor: hpColor }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="h-full w-full"
          />
          <AnimatePresence>
            {lastFx && (
              <motion.div
                key={lastFx.id}
                aria-hidden
                initial={{ opacity: 0.65 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className={
                  lastFx.kind === "damage"
                    ? "pointer-events-none absolute inset-0 bg-danger/70 mix-blend-screen"
                    : "pointer-events-none absolute inset-0 bg-accent/70 mix-blend-screen"
                }
              />
            )}
          </AnimatePresence>
        </div>

        <FloatingNumbers fx={hpFx} consume={consumeHpFx} />
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("play.crest.ac")} value={armorClass(character).value} accent />
        <Stat label={t("play.crest.speed")} value={`${character.speed}ft`} />
        <Stat
          label={t("play.crest.init")}
          value={signed(character.initiativeBonus)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={t("play.crest.rations")}
          value={character.rations}
          accent={(character.rations ?? 0) <= 0}
        />
        <Stat
          label={t("play.crest.gold")}
          value={character.currency?.gp ?? character.goldPieces ?? 0}
        />
      </div>

      <section>
        <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
          {t("play.crest.abilities")}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ABILITIES.map((a) => {
            const score = character.abilities[a];
            const mod = abilityModifier(score);
            return (
              <div
                key={a}
                className="flex items-center justify-between rounded-md border border-line/60 bg-surface px-2.5 py-1.5"
              >
                <div>
                  <p className="font-display text-[10px] uppercase tracking-[0.2em] text-text-muted">
                    {ABILITY_LABEL[a]}
                  </p>
                  <p className="font-display text-sm text-text">{score}</p>
                </div>
                <span className="font-mono text-sm text-accent">{signed(mod)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {character.conditions.length > 0 && (
        <section>
          <p className="mb-1.5 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
            {t("play.crest.conditions")}
          </p>
          <div className="flex flex-wrap gap-1">
            {character.conditions.map((c) => {
              const timer = character.conditionTimers.find((tt) => tt.index === c);
              return (
                <span
                  key={c}
                  className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-0.5 font-mono text-xs text-danger"
                  title={timer?.source}
                >
                  {c}
                  {timer && (
                    <span className="ml-1 opacity-70">
                      {timer.rounds}r
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {(() => {
        const enc = encumbranceLevel(character);
        if (enc === "ok") return null;
        const label =
          enc === "over"
            ? t("play.crest.overloaded")
            : enc === "heavy"
              ? t("play.crest.heavilyEncumbered")
              : t("play.crest.encumbered");
        return (
          <div
            className="flex items-center gap-1.5 rounded-sm border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-xs text-danger"
            title={label}
          >
            <span className="truncate">{label}</span>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2">
        {sc && (
          <span
            className="rounded-sm border border-accent-muted/40 bg-accent/5 px-2 py-0.5 font-mono text-xs text-accent-muted"
            title={t("play.crest.spellDcHint")}
          >
            {t("play.crest.spellDc", { dc: sc.saveDc })} ·{" "}
            {t("play.crest.spellAtk", {
              atk: sc.attackBonus >= 0 ? `+${sc.attackBonus}` : sc.attackBonus,
            })}
          </span>
        )}
        <button
          type="button"
          onClick={() => character.inspiration && spendInspiration()}
          disabled={!character.inspiration}
          className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-xs uppercase tracking-widest transition ${
            character.inspiration
              ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
              : "border-line bg-surface text-text-muted/60"
          }`}
          title={
            character.inspiration
              ? t("play.crest.inspirationSpend")
              : t("play.crest.inspirationNone")
          }
        >
          <Star
            className={`h-3 w-3 ${character.inspiration ? "fill-accent" : ""}`}
          />
          {character.inspiration
            ? t("play.crest.inspirationLabel")
            : t("play.crest.inspirationEmpty")}
        </button>
      </div>

      {character.concentration && (
        <section>
          <p className="mb-1.5 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
            {t("play.crest.concentration")}
          </p>
          <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-[12px] text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {character.concentration.spellName}
            </span>
            <button
              type="button"
              onClick={() => endConcentration()}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition-colors duration-150 ease-out hover:border-danger/50 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97]"
              title={t("play.crest.endConcentration")}
              aria-label={t("play.crest.endConcentration")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}

function FloatingNumbers({
  fx,
  consume,
}: {
  fx: ReturnType<typeof useSessionStore.getState>["hpFx"];
  consume: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none relative h-0">
      <AnimatePresence>
        {fx.map((f) => (
          <FloatingNumber key={f.id} fx={f} consume={consume} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FloatingNumber({
  fx,
  consume,
}: {
  fx: ReturnType<typeof useSessionStore.getState>["hpFx"][number];
  consume: (id: string) => void;
}) {
  useEffect(() => {
    const handle = setTimeout(() => consume(fx.id), 1400);
    return () => clearTimeout(handle);
  }, [fx.id, consume]);

  const sign = fx.kind === "damage" ? "−" : "+";
  const color = fx.kind === "damage" ? "text-danger" : "text-accent";
  return (
    <motion.span
      initial={{ opacity: 0, y: -2, scale: 0.8 }}
      animate={{ opacity: 1, y: -22, scale: 1 }}
      exit={{ opacity: 0, y: -38 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.4, 1] }}
      className={`absolute right-0 top-0 font-display text-base drop-shadow-[0_0_6px_rgba(0,0,0,0.6)] ${color}`}
    >
      {sign}
      {fx.amount}
    </motion.span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-md border border-line/60 bg-surface px-2 py-1.5 text-center">
      <p className="font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display text-base leading-tight ${accent ? "text-accent" : "text-text"}`}
      >
        {value}
      </p>
    </div>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
