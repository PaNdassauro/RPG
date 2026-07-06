import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { getClass, getSubclass } from "@/data/srd";
import { FEATS } from "@/data/srd/feats";
import {
  ABILITIES,
  abilityModifier,
  type Ability,
} from "@/schemas/character";
import {
  averageHitDieGain,
  characterLevel,
  featuresForClassLevel,
  getClassLevelInfo,
  isAsiLevel,
  isSubclassPickLevel,
} from "@/state/sheetDerived";
import { cn } from "@/lib/cn";

const ABILITY_LABEL: Record<Ability, string> = {
  str: "Força",
  dex: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  wis: "Sabedoria",
  cha: "Carisma",
};

const ABILITY_SHORT: Record<Ability, string> = {
  str: "FOR",
  dex: "DES",
  con: "CON",
  int: "INT",
  wis: "SAB",
  cha: "CAR",
};

type AsiMode = "plusTwo" | "plusOneTwice" | "feat";

interface AsiDraft {
  mode: AsiMode;
  // plusTwo: one ability target
  plusTwoTarget: Ability | null;
  // plusOneTwice: two distinct abilities
  plusOneA: Ability | null;
  plusOneB: Ability | null;
  // feat: chosen feat id (+ optional ability for Resilient)
  featId: string | null;
  featChoice: Ability | null;
}

const EMPTY_ASI: AsiDraft = {
  mode: "plusTwo",
  plusTwoTarget: null,
  plusOneA: null,
  plusOneB: null,
  featId: null,
  featChoice: null,
};

/** SRD multiclass prerequisites (5e PHB). */
const MULTICLASS_PREREQS: Record<string, Partial<Record<Ability, number>>> = {
  barbarian: { str: 13 },
  bard: { cha: 13 },
  cleric: { wis: 13 },
  druid: { wis: 13 },
  fighter: { str: 13 }, // OR dex 13 — we allow either by checking the higher
  monk: { dex: 13, wis: 13 },
  paladin: { str: 13, cha: 13 },
  ranger: { dex: 13, wis: 13 },
  rogue: { dex: 13 },
  sorcerer: { cha: 13 },
  warlock: { cha: 13 },
  wizard: { int: 13 },
};

const ALL_CLASS_IDS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

function meetsMulticlass(
  abilities: Record<Ability, number>,
  classId: string,
): boolean {
  const req = MULTICLASS_PREREQS[classId];
  if (!req) return true;
  // Fighter exception: STR OR DEX.
  if (classId === "fighter") {
    return abilities.str >= 13 || abilities.dex >= 13;
  }
  for (const [ab, min] of Object.entries(req)) {
    if (abilities[ab as Ability] < min!) return false;
  }
  return true;
}

export function LevelUpModal() {
  const pending = useSessionStore((s) => s.pendingLevelUp);
  const character = useSessionStore((s) => s.character);
  const apply = useSessionStore((s) => s.applyLevelUp);
  const cancel = useSessionStore((s) => s.cancelLevelUp);

  const [asi, setAsi] = useState<AsiDraft>(EMPTY_ASI);
  const [subclassId, setSubclassId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [chosenClassId, setChosenClassId] = useState<string | null>(null);

  const open = !!pending && !!character;
  if (!open || !pending || !character) {
    return (
      <AnimatePresence>
        {/* placeholder so AnimatePresence doesn't choke between renders */}
      </AnimatePresence>
    );
  }

  // Player can choose to level the DM-suggested class OR switch to multiclass.
  const effectiveClassId = chosenClassId ?? pending.classId;
  const klass = getClass(effectiveClassId);
  if (!klass) return null;

  const currentClassEntry = character.classes.find((c) => c.classId === effectiveClassId);
  const isMulticlassPick = !currentClassEntry;
  const meetsPrereqs = !isMulticlassPick || meetsMulticlass(character.abilities, effectiveClassId);
  const newLevel = (currentClassEntry?.level ?? 0) + 1;
  const newTotalLevel = characterLevel(character) + 1;
  const lvlEntry = getClassLevelInfo(effectiveClassId, newLevel);
  const isAsi = isAsiLevel(newLevel);
  const needsSubclass =
    !currentClassEntry?.subclassId && isSubclassPickLevel(effectiveClassId, newLevel);
  const subclassOptions = useMemo(
    () =>
      klass.subclasses
        .map((ref) => getSubclass(ref.index))
        .filter((s): s is NonNullable<typeof s> => !!s),
    [klass],
  );
  const features = featuresForClassLevel(effectiveClassId, newLevel);
  const conMod = abilityModifier(character.abilities.con);
  const hpGain = Math.max(1, averageHitDieGain(klass.hit_die, conMod));

  const featPickValid =
    asi.featId !== null &&
    (asi.featId !== "resilient" || asi.featChoice !== null) &&
    // Don't allow re-picking same feat twice.
    !character.feats.some((f) => f.featId === asi.featId);
  const asiValid = !isAsi
    ? true
    : asi.mode === "plusTwo"
      ? asi.plusTwoTarget !== null &&
        character.abilities[asi.plusTwoTarget] + 2 <= 20
      : asi.mode === "plusOneTwice"
        ? asi.plusOneA !== null &&
          asi.plusOneB !== null &&
          asi.plusOneA !== asi.plusOneB &&
          character.abilities[asi.plusOneA] + 1 <= 20 &&
          character.abilities[asi.plusOneB] + 1 <= 20
        : featPickValid;
  const subclassValid = !needsSubclass || subclassId !== null;
  const canConfirm = asiValid && subclassValid && meetsPrereqs && !applying;

  function onConfirm() {
    if (!canConfirm || !pending) return;
    setApplying(true);
    const asiInput =
      isAsi && asi.mode === "plusTwo" && asi.plusTwoTarget
        ? [{ ability: asi.plusTwoTarget, amount: 2 }]
        : isAsi && asi.mode === "plusOneTwice" && asi.plusOneA && asi.plusOneB
          ? [
              { ability: asi.plusOneA, amount: 1 },
              { ability: asi.plusOneB, amount: 1 },
            ]
          : null;
    const featInput =
      isAsi && asi.mode === "feat" && asi.featId
        ? { featId: asi.featId, ...(asi.featChoice ? { choice: asi.featChoice } : {}) }
        : undefined;
    void apply({
      classId: effectiveClassId,
      asi: asiInput,
      ...(featInput ? { feat: featInput } : {}),
      ...(needsSubclass && subclassId ? { subclassId } : {}),
    }).then(() => {
      setAsi(EMPTY_ASI);
      setSubclassId(null);
      setChosenClassId(null);
      setApplying(false);
    });
  }

  function onClose() {
    if (applying) return;
    cancel();
    setAsi(EMPTY_ASI);
    setSubclassId(null);
    setChosenClassId(null);
  }

  return (
    <AnimatePresence>
      <motion.div
        key="lu-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          key="lu-card"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.4, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_0_80px_-20px_rgba(212,170,71,0.4)]"
        >
          <header className="border-b border-line/60 bg-canvas/40 px-6 py-5">
            <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
              <Sparkles className="h-3 w-3" />
              Subindo de nível
            </p>
            <h2 className="mt-1 font-display text-2xl text-text">
              {klass.name} · Nível {newLevel}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-text-muted">
              Total de personagem: {newTotalLevel}
            </p>
            {pending.narration && (
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-text-muted italic">
                "{pending.narration}"
              </p>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Class picker (multiclass) */}
            <Section title="Classe a evoluir">
              <div className="flex flex-wrap gap-1.5">
                {ALL_CLASS_IDS.map((cid) => {
                  const owned = character.classes.some((c) => c.classId === cid);
                  const k = getClass(cid);
                  if (!k) return null;
                  const isSel = effectiveClassId === cid;
                  const ok = owned || meetsMulticlass(character.abilities, cid);
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setChosenClassId(cid)}
                      disabled={!ok}
                      className={cn(
                        "rounded-md border px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.2em] transition",
                        isSel
                          ? "border-accent bg-accent/15 text-accent"
                          : owned
                            ? "border-line bg-surface text-text hover:border-accent-muted"
                            : ok
                              ? "border-line/60 bg-surface text-text-muted hover:border-accent-muted"
                              : "border-line/40 bg-surface/50 text-text-muted/30 cursor-not-allowed",
                      )}
                      title={
                        !ok
                          ? "Pré-requisito de multiclasse não atendido"
                          : owned
                            ? "Sua classe"
                            : "Multiclasse"
                      }
                    >
                      {k.name}
                      {owned && (
                        <span className="ml-1 text-text-muted">
                          L{character.classes.find((c) => c.classId === cid)?.level ?? 0}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {!meetsPrereqs && (
                <p className="mt-2 text-[11px] text-danger/80">
                  Atributos insuficientes para multiclasse em {klass.name}.
                </p>
              )}
            </Section>

            {/* HP gain */}
            <Section title="Pontos de vida">
              <p className="text-sm text-text">
                <span className="font-mono text-accent">+{hpGain} PV</span>{" "}
                <span className="text-text-muted">
                  (média de d{klass.hit_die} = {Math.floor(klass.hit_die / 2) + 1} + CON{" "}
                  {conMod >= 0 ? `+${conMod}` : conMod})
                </span>
              </p>
              <p className="mt-1 text-[11px] text-text-muted/70">
                Novo máximo: {character.hp.max} → {character.hp.max + hpGain}
              </p>
            </Section>

            {/* ASI */}
            {isAsi && (
              <Section title="Aumento de atributo">
                <p className="mb-2 text-xs text-text-muted">
                  Escolha +2 em um atributo OU +1 em dois atributos diferentes (máx. 20).
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <ModeButton
                    active={asi.mode === "plusTwo"}
                    onClick={() => setAsi({ ...EMPTY_ASI, mode: "plusTwo" })}
                  >
                    +2 num atributo
                  </ModeButton>
                  <ModeButton
                    active={asi.mode === "plusOneTwice"}
                    onClick={() => setAsi({ ...EMPTY_ASI, mode: "plusOneTwice" })}
                  >
                    +1 em dois
                  </ModeButton>
                  <ModeButton
                    active={asi.mode === "feat"}
                    onClick={() => setAsi({ ...EMPTY_ASI, mode: "feat" })}
                  >
                    Talento
                  </ModeButton>
                </div>
                {asi.mode === "plusTwo" && (
                  <AbilityPicker
                    label=""
                    abilities={character.abilities}
                    selected={asi.plusTwoTarget}
                    bonus={2}
                    onPick={(a) => setAsi({ ...asi, plusTwoTarget: a })}
                  />
                )}
                {asi.mode === "plusOneTwice" && (
                  <div className="flex flex-col gap-3">
                    <AbilityPicker
                      label="Primeiro atributo (+1)"
                      abilities={character.abilities}
                      selected={asi.plusOneA}
                      bonus={1}
                      onPick={(a) => setAsi({ ...asi, plusOneA: a })}
                      excluded={asi.plusOneB}
                    />
                    <AbilityPicker
                      label="Segundo atributo (+1)"
                      abilities={character.abilities}
                      selected={asi.plusOneB}
                      bonus={1}
                      onPick={(a) => setAsi({ ...asi, plusOneB: a })}
                      excluded={asi.plusOneA}
                    />
                  </div>
                )}
                {asi.mode === "feat" && (
                  <FeatPicker
                    selectedId={asi.featId}
                    selectedChoice={asi.featChoice}
                    alreadyOwned={character.feats.map((f) => f.featId)}
                    onPick={(id) => setAsi({ ...asi, featId: id, featChoice: null })}
                    onPickChoice={(ab) => setAsi({ ...asi, featChoice: ab })}
                  />
                )}
              </Section>
            )}

            {/* Subclass picker */}
            {needsSubclass && (
              <Section title="Escolha sua subclasse">
                <ul className="flex flex-col gap-2">
                  {subclassOptions.map((sc) => (
                    <li key={sc.index}>
                      <button
                        type="button"
                        onClick={() => setSubclassId(sc.index)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition",
                          subclassId === sc.index
                            ? "border-accent bg-accent/10"
                            : "border-line bg-surface hover:border-accent-muted/60",
                        )}
                      >
                        <ChevronRight
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 shrink-0 transition",
                            subclassId === sc.index ? "text-accent" : "text-text-muted",
                          )}
                        />
                        <div>
                          <p className="font-display text-sm text-text">{sc.name}</p>
                          {sc.subclass_flavor && (
                            <p className="text-[11px] text-text-muted">{sc.subclass_flavor}</p>
                          )}
                          {sc.desc[0] && (
                            <p className="mt-1 text-[11px] leading-relaxed text-text-muted/80">
                              {sc.desc[0]}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* New features */}
            {features.length > 0 && (
              <Section title="Novos recursos">
                <ul className="flex flex-col gap-2">
                  {features.map((f) => (
                    <li key={f.index} className="rounded-md border border-line/60 bg-surface px-3 py-2">
                      <p className="font-display text-sm text-text">{f.name}</p>
                      {f.desc.slice(0, 2).map((d, i) => (
                        <p key={i} className="mt-1 text-[11px] leading-relaxed text-text-muted">
                          {d}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Spellcasting delta */}
            {lvlEntry?.spellcasting && (
              <Section title="Conjuração">
                <SpellcastingDelta level={newLevel} classId={effectiveClassId} />
              </Section>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-line/60 bg-canvas/30 px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="font-display text-xs uppercase tracking-[0.3em] text-text-muted transition hover:text-text disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className={cn(
                "rounded-md border px-5 py-2 font-display text-xs uppercase tracking-[0.3em] transition",
                canConfirm
                  ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
                  : "border-line bg-surface text-text-muted/40",
              )}
            >
              {applying ? "Aplicando…" : "Confirmar"}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
        {title}
      </p>
      {children}
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.3em] transition",
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-surface text-text-muted hover:border-accent-muted/60",
      )}
    >
      {children}
    </button>
  );
}

function AbilityPicker({
  label,
  abilities,
  selected,
  bonus,
  onPick,
  excluded,
}: {
  label: string;
  abilities: Record<Ability, number>;
  selected: Ability | null;
  bonus: number;
  onPick: (a: Ability) => void;
  excluded?: Ability | null;
}) {
  return (
    <div>
      {label && (
        <p className="mb-1.5 font-display text-[9px] uppercase tracking-widest text-text-muted">
          {label}
        </p>
      )}
      <ul className="grid grid-cols-3 gap-1.5">
        {ABILITIES.map((a) => {
          const isExcluded = excluded === a;
          const isPicked = selected === a;
          const cur = abilities[a];
          const after = Math.min(20, cur + bonus);
          const wouldOverflow = cur + bonus > 20;
          const disabled = isExcluded || wouldOverflow;
          return (
            <li key={a}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(a)}
                className={cn(
                  "flex w-full flex-col items-center rounded-md border px-2 py-1.5 transition",
                  isPicked
                    ? "border-accent bg-accent/15"
                    : disabled
                      ? "border-line/40 bg-surface/50 opacity-40"
                      : "border-line bg-surface hover:border-accent-muted/60",
                )}
              >
                <span className="font-display text-[9px] uppercase tracking-widest text-text-muted">
                  {ABILITY_LABEL[a]}
                </span>
                <span className="font-mono text-sm text-text">
                  {cur}
                  {!disabled && (
                    <span className={cn("ml-1", isPicked ? "text-accent" : "text-accent-muted")}>
                      → {after}
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted/70">
                  {ABILITY_SHORT[a]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeatPicker({
  selectedId,
  selectedChoice,
  alreadyOwned,
  onPick,
  onPickChoice,
}: {
  selectedId: string | null;
  selectedChoice: Ability | null;
  alreadyOwned: string[];
  onPick: (id: string) => void;
  onPickChoice: (a: Ability) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {FEATS.map((f) => {
        const owned = alreadyOwned.includes(f.id);
        const picked = selectedId === f.id;
        return (
          <li key={f.id}>
            <button
              type="button"
              disabled={owned}
              onClick={() => onPick(f.id)}
              className={cn(
                "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition",
                picked
                  ? "border-accent bg-accent/10"
                  : owned
                    ? "border-line/40 bg-surface/40 opacity-40"
                    : "border-line bg-surface hover:border-accent-muted/60",
              )}
            >
              <span className="font-display text-sm text-text">{f.name}</span>
              <span className="text-[11px] leading-relaxed text-text-muted">
                {f.description}
              </span>
            </button>
            {picked && f.id === "resilient" && (
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {ABILITIES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onPickChoice(a)}
                    className={cn(
                      "rounded-md border px-2 py-1 font-display text-[10px] uppercase tracking-widest transition",
                      selectedChoice === a
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-surface text-text-muted hover:border-accent-muted",
                    )}
                  >
                    {ABILITY_LABEL[a]}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SpellcastingDelta({ classId, level }: { classId: string; level: number }) {
  const cur = getClassLevelInfo(classId, level);
  const prev = level > 1 ? getClassLevelInfo(classId, level - 1) : null;
  if (!cur?.spellcasting) return null;
  const sc = cur.spellcasting;
  const prevSc = prev?.spellcasting;
  const deltas: { label: string; from: number; to: number }[] = [];
  for (let i = 1; i <= 9; i++) {
    const k = `spell_slots_level_${i}` as keyof typeof sc;
    const to = (sc[k] as number | undefined) ?? 0;
    const from = (prevSc?.[k] as number | undefined) ?? 0;
    if (to > 0 || from > 0) deltas.push({ label: `Nível ${i}`, from, to });
  }
  if (deltas.length === 0) return <p className="text-xs text-text-muted">Sem mudança</p>;
  return (
    <ul className="flex flex-col gap-1">
      {deltas.map((d) => (
        <li
          key={d.label}
          className={cn(
            "flex items-center justify-between rounded-md border bg-surface px-3 py-1.5 font-mono text-xs",
            d.to > d.from ? "border-accent/40" : "border-line/60",
          )}
        >
          <span>{d.label}</span>
          <span className="text-text-muted">
            {d.from} → <span className={d.to > d.from ? "text-accent" : ""}>{d.to}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
