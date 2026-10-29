import { useEffect, useState } from "react";
import {
  Heart,
  Shield,
  Swords,
  Sparkles,
  Backpack,
  ScrollText,
  ChevronDown,
} from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { getRace, getSubrace, getClass, getBackground } from "@/data/srd";
import { getFeat } from "@/data/srd/feats";
import {
  ATTUNEMENT_CAP,
  attunedCount,
  carryCapacity,
  currentWeight,
  encumbranceLevel,
} from "@/engine/inventory";
import {
  ABILITIES,
  SKILLS,
  abilityModifier,
  type Ability,
  type Character,
  type SkillName,
} from "@/schemas/character";
import {
  allSkillModifiers,
  armorClass,
  attacks,
  characterLevel,
  characterProfBonus,
  passivePerception,
  savingThrowModifier,
  spellcasting,
  totalHitDiceMax,
  unlockedFeatures,
  type AttackEntry,
} from "@/state/sheetDerived";
import type { SrdSpell } from "@/data/srd/types";
import { SpellPicker } from "@/components/play/SpellPicker";
import { newId } from "@/lib/id";
import { useT } from "@/i18n";
import { DialogTitle, Sheet } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";
import type { ChatMessage } from "@/schemas/campaign";
import { cn } from "@/lib/cn";

type Tab = "summary" | "skills" | "attacks" | "spells" | "gear" | "story";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional pre-selected tab; resets to this each time `open` flips to true. */
  defaultTab?: Tab;
}

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

const SKILL_LABEL_PT: Record<SkillName, string> = {
  acrobatics: "Acrobacia",
  animalHandling: "Lidar com Animais",
  arcana: "Arcanismo",
  athletics: "Atletismo",
  deception: "Enganação",
  history: "História",
  insight: "Intuição",
  intimidation: "Intimidação",
  investigation: "Investigação",
  medicine: "Medicina",
  nature: "Natureza",
  perception: "Percepção",
  performance: "Atuação",
  persuasion: "Persuasão",
  religion: "Religião",
  sleightOfHand: "Prestidigitação",
  stealth: "Furtividade",
  survival: "Sobrevivência",
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function CharacterSheet({ open, onClose, defaultTab }: Props) {
  const character = useSessionStore((s) => s.character);
  const [tab, setTab] = useState<Tab>(defaultTab ?? "summary");

  useEffect(() => {
    if (open && defaultTab) setTab(defaultTab);
  }, [open, defaultTab]);

  if (!character) return null;
  const hasSpells = !!spellcasting(character);

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-full max-w-4xl">
      <Header character={character} onClose={onClose} />
      <Tabs tab={tab} setTab={setTab} hasSpells={hasSpells} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "summary" && <SummaryTab character={character} />}
        {tab === "skills" && <SkillsTab character={character} />}
        {tab === "attacks" && <AttacksTab character={character} />}
        {tab === "spells" && hasSpells && <SpellsTab character={character} />}
        {tab === "gear" && <GearTab character={character} />}
        {tab === "story" && <StoryTab character={character} />}
      </div>
    </Sheet>
  );
}

function Header({ character, onClose }: { character: Character; onClose: () => void }) {
  const t = useT();
  const race = character.raceId ? getRace(character.raceId) : null;
  const subrace = character.subraceId ? getSubrace(character.subraceId) : null;
  const klass = character.classes[0] ? getClass(character.classes[0].classId) : null;
  const level = characterLevel(character);
  const heritage = [subrace?.name, race?.name].filter(Boolean).join(" ");

  return (
    <header className="flex items-start justify-between border-b border-line/60 px-5 py-4">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
          {t("play.sheet.eyebrow")}
        </p>
        <DialogTitle className="mt-0.5 font-display text-xl text-text">{character.name}</DialogTitle>
        <p className="mt-1 text-xs text-text-muted">
          {heritage} · {klass?.name ?? "—"} · {t("play.sheet.level", { n: level })}
        </p>
      </div>
      <CloseButton onClick={onClose} />
    </header>
  );
}

function Tabs({
  tab,
  setTab,
  hasSpells,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  hasSpells: boolean;
}) {
  const t = useT();
  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "summary", label: t("play.sheet.tabs.summary"), icon: <Heart className="h-3.5 w-3.5" />, show: true },
    { id: "skills", label: t("play.sheet.tabs.skills"), icon: <Shield className="h-3.5 w-3.5" />, show: true },
    { id: "attacks", label: t("play.sheet.tabs.attacks"), icon: <Swords className="h-3.5 w-3.5" />, show: true },
    { id: "spells", label: t("play.sheet.tabs.spells"), icon: <Sparkles className="h-3.5 w-3.5" />, show: hasSpells },
    { id: "gear", label: t("play.sheet.tabs.gear"), icon: <Backpack className="h-3.5 w-3.5" />, show: true },
    { id: "story", label: t("play.sheet.tabs.story"), icon: <ScrollText className="h-3.5 w-3.5" />, show: true },
  ];
  return (
    <div className="flex flex-wrap border-b border-line/60 px-3">
      {tabs
        .filter((item) => item.show)
        .map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 py-3 font-display text-[10px] uppercase tracking-[0.3em] transition-colors duration-150 ease-out",
              tab === item.id ? "text-accent" : "text-text-muted hover:text-text",
            )}
          >
            {item.icon}
            {item.label}
            {tab === item.id && (
              <span className="absolute inset-x-1.5 -bottom-[1px] h-[2px] rounded-full bg-accent" />
            )}
          </button>
        ))}
    </div>
  );
}

// --- Tabs --------------------------------------------------------------

function SummaryTab({ character }: { character: Character }) {
  const ac = armorClass(character);
  const prof = characterProfBonus(character);
  const pp = passivePerception(character);
  const hitDice = character.hitDice ?? [];
  const totalHd = totalHitDiceMax(character);
  const currentHd = hitDice.reduce((s, h) => s + h.current, 0);
  const deathSaves = character.deathSaves ?? { successes: 0, failures: 0 };
  return (
    <div className="flex flex-col gap-5">
      <Section title="Vitais">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="PV" value={`${character.hp.current}/${character.hp.max}`} accent />
          <StatTile
            label="CA"
            value={ac.value}
            hint={ac.parts.map((p) => `${p.label} ${signed(p.value)}`).join(" · ")}
          />
          <StatTile label="Iniciativa" value={signed(character.initiativeBonus)} />
          <StatTile label="Deslocamento" value={`${character.speed} ft`} />
          <StatTile label="Prof." value={signed(prof)} />
          <StatTile label="Perc. passiva" value={pp} />
        </div>
        {character.hp.temp > 0 && (
          <p className="mt-2 text-xs text-accent-muted">+{character.hp.temp} PV temporários</p>
        )}
      </Section>

      <Section title="Atributos">
        <div className="grid grid-cols-3 gap-2">
          {ABILITIES.map((a) => {
            const score = character.abilities[a];
            const mod = abilityModifier(score);
            return (
              <div
                key={a}
                className="rounded-md border border-line/60 bg-surface px-3 py-2 text-center"
              >
                <p className="font-display text-[10px] uppercase tracking-[0.2em] text-text-muted">
                  {ABILITY_LABEL[a]}
                </p>
                <p className="mt-0.5 font-display text-xl text-text">{score}</p>
                <p className="font-mono text-sm text-accent">{signed(mod)}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Dados de vida">
        <p className="font-mono text-sm text-text">
          {currentHd}/{totalHd}{" "}
          <span className="text-text-muted">
            ({hitDice.map((h) => `d${h.die} ×${h.max}`).join(" · ") || "—"})
          </span>
        </p>
      </Section>

      <Section title="Salvamentos de morte">
        <div className="flex items-center gap-4">
          <DotRow label="Sucessos" count={deathSaves.successes} tone="accent" />
          <DotRow label="Falhas" count={deathSaves.failures} tone="danger" />
        </div>
      </Section>

      <Section title="Inspiração">
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-center font-display text-xs uppercase tracking-[0.3em]",
            character.inspiration
              ? "border-accent/50 bg-accent/15 text-accent"
              : "border-line bg-surface text-text-muted",
          )}
        >
          {character.inspiration ? "Disponível" : "Sem inspiração"}
        </div>
      </Section>

      <Section title="Recursos da classe">
        <FeaturesList character={character} />
      </Section>

      {character.feats.length > 0 && (
        <Section title="Talentos">
          <FeatsList character={character} />
        </Section>
      )}
    </div>
  );
}

function FeatsList({ character }: { character: Character }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {character.feats.map((f) => {
        const data = getFeat(f.featId);
        if (!data) return null;
        return (
          <li
            key={f.featId}
            className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2"
          >
            <p className="font-display text-sm text-text">
              {data.name}
              {f.choice && (
                <span className="ml-2 font-mono text-xs uppercase tracking-widest text-accent-muted">
                  ({f.choice.toUpperCase()})
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
              {data.description}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function SkillsTab({ character }: { character: Character }) {
  const saves = ABILITIES.map((a) => ({ a, m: savingThrowModifier(character, a) }));
  const skills = allSkillModifiers(character).sort((a, b) =>
    SKILL_LABEL_PT[a.skill].localeCompare(SKILL_LABEL_PT[b.skill]),
  );
  void SKILLS; // kept for typing reference
  return (
    <div className="flex flex-col gap-5">
      <Section title="Salvamentos">
        <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-6">
          {saves.map(({ a, m }) => (
            <li
              key={a}
              className="flex items-center justify-between rounded-md border border-line/60 bg-surface px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <ProfDot on={m.isProficient} />
                <span className="font-display text-xs text-text">{ABILITY_LABEL[a]}</span>
              </div>
              <span className="font-mono text-sm text-accent">{signed(m.total)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Perícias">
        <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {skills.map((s) => (
            <li
              key={s.skill}
              className="flex items-center justify-between rounded-md border border-line/60 bg-surface px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <ProfDot on={s.isProficient} expert={s.hasExpertise} />
                <span className="font-display text-xs text-text">{SKILL_LABEL_PT[s.skill]}</span>
                <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
                  {ABILITY_SHORT[s.ability]}
                </span>
              </div>
              <span className="font-mono text-sm text-accent">{signed(s.total)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AttacksTab({ character }: { character: Character }) {
  const list = attacks(character);
  return (
    <div className="flex flex-col gap-3">
      <Section title="Ataques disponíveis">
        {list.length === 0 ? (
          <Empty text="Nenhum ataque disponível" />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((a) => (
              <AttackRow key={a.id} attack={a} />
            ))}
          </ul>
        )}
      </Section>
      <p className="text-xs leading-relaxed text-text-muted/80">
        Os ataques são derivados das armas equipadas (aba Equipamento). Equipar uma arma do SRD faz
        ela aparecer aqui com to-hit e dano calculados.
      </p>
    </div>
  );
}

function AttackRow({ attack }: { attack: AttackEntry }) {
  const damageStr = `${attack.damage.dice}${signed(attack.damage.mod)} ${attack.damage.type}`;
  const rangeStr =
    attack.range.kind === "melee"
      ? `Corpo a corpo · ${attack.range.reach} ft`
      : `À distância · ${attack.range.normal}${attack.range.long ? `/${attack.range.long}` : ""} ft`;
  return (
    <li className="rounded-md border border-line/70 bg-surface/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-sm text-text">{attack.name}</span>
        <span className="font-mono text-base text-accent">{signed(attack.toHit)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-muted">
        <span className="font-mono">{damageStr}</span>
        <span className="text-text-muted/80">{rangeStr}</span>
      </div>
      {attack.properties.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {attack.properties.map((p) => (
            <span
              key={p}
              className="rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-xs uppercase tracking-widest text-text-muted/80"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function SpellsTab({ character }: { character: Character }) {
  const t = useT();
  const campaignId = useSessionStore((s) => s.campaignId);
  const spendSlot = useSessionStore((s) => s.spendSlot);
  const beginConcentration = useSessionStore((s) => s.beginConcentration);
  const endConcentration = useSessionStore((s) => s.endConcentration);
  const appendMessage = useSessionStore((s) => s.appendMessage);
  const sc = spellcasting(character);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [knownDetails, setKnownDetails] = useState<SrdSpell[]>([]);

  // Hydrate full SrdSpell records for the player's known/cantrip lists.
  useEffect(() => {
    let cancelled = false;
    const indices = [...(character.cantrips ?? []), ...(character.spellsKnown ?? [])];
    if (indices.length === 0) {
      setKnownDetails([]);
      return;
    }
    void import("@/data/srd/lazy").then(async ({ getSpellsByIndices }) => {
      const list = await getSpellsByIndices(indices);
      if (!cancelled) setKnownDetails(list);
    });
    return () => {
      cancelled = true;
    };
  }, [character.cantrips, character.spellsKnown]);

  if (!sc) return <Empty text="Sem conjuração" />;

  // atLevel: the slot level to spend (>= spell.level for an upcast), or
  // "ritual" to cast a ritual-tagged spell for free (no slot, +10 min).
  async function castSpell(spell: SrdSpell, atLevel: number | "ritual" = spell.level) {
    if (!campaignId) return;
    const ritual = atLevel === "ritual";
    const levelCast =
      spell.level === 0 ? 0 : ritual ? spell.level : typeof atLevel === "number" ? atLevel : spell.level;
    if (!ritual && levelCast > 0) {
      const ok = await spendSlot(levelCast as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9);
      if (!ok) return;
    }
    if (spell.concentration) {
      await beginConcentration({ spellName: spell.name, srdRef: spell.index });
    }
    const levelLabel =
      levelCast === 0
        ? t("play.actionPanel.cantripLabel")
        : `L${levelCast}${levelCast > spell.level ? " ↑" : ""}`;
    const ts = Date.now();
    const msg: ChatMessage = {
      id: newId(),
      campaignId,
      role: "system",
      content: t("play.actionPanel.castMessage", {
        spell: spell.name,
        level: levelLabel,
        concentration:
          (ritual ? ` · ${t("play.actionPanel.ritualTag")}` : "") +
          (spell.concentration ? ` · ${t("play.actionPanel.concentrationTag")}` : ""),
      }),
      toolCallIds: [],
      diceRollIds: [],
      ts,
    };
    await appendMessage(msg);
  }

  const slots = character.spellSlots;
  const cantripList = knownDetails.filter((s) => s.level === 0);
  const knownList = knownDetails.filter((s) => s.level >= 1);
  const hasAnySelected = knownDetails.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Section title="Conjuração">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="CD de salvamento" value={sc.saveDc} accent />
          <StatTile label="Bônus de ataque" value={signed(sc.attackBonus)} />
          <StatTile label="Atributo" value={ABILITY_SHORT[sc.ability]} />
        </div>
      </Section>

      <Section title="Concentração">
        {character.concentration ? (
          <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {character.concentration.spellName}
            </span>
            <button
              type="button"
              onClick={() => endConcentration()}
              className="rounded-sm border border-danger/40 bg-danger/5 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-danger hover:bg-danger/15"
            >
              Largar
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">
            Nada ativo. Conjurar uma magia com concentração marca aqui automaticamente.
          </p>
        )}
      </Section>

      <Section title="Espaços de magia">
        {sc.slots.length === 0 ? (
          <Empty text="Sem espaços neste nível" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sc.slots.map((s) => {
              const k = `l${s.level}` as
                | "l1" | "l2" | "l3" | "l4" | "l5" | "l6" | "l7" | "l8" | "l9";
              const used = slots ? slots[k].used : 0;
              const remaining = s.max - used;
              return (
                <li
                  key={s.level}
                  className="flex items-center justify-between gap-3 rounded-md border border-line/60 bg-surface px-3 py-1.5 font-mono text-xs"
                >
                  <span>Nível {s.level}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: s.max }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border",
                          i < remaining
                            ? "border-accent bg-accent"
                            : "border-line bg-transparent",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-accent">
                    {remaining}/{s.max}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Grimório">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-xs text-text-muted">
            Truques: {character.cantrips.length}/{sc.cantripsKnown ?? "—"} · Magias:{" "}
            {character.spellsKnown.length}/{sc.spellsKnown ?? "—"}
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-accent bg-accent/15 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-accent hover:bg-accent/25"
          >
            {hasAnySelected ? "Editar magias" : "Configurar magias"}
          </button>
        </div>

        {!hasAnySelected ? (
          <div className="rounded-md border border-line/60 bg-surface/40 px-4 py-6 text-center">
            <p className="font-display text-sm text-text">
              Sem magias selecionadas
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Abra "Configurar magias" para escolher seus truques e magias conhecidas da
              lista da sua classe.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cantripList.length > 0 && (
              <SpellRows title="Truques" spells={cantripList} onCast={castSpell} slots={slots} />
            )}
            {knownList.length > 0 && (
              <SpellRows title="Conhecidas" spells={knownList} onCast={castSpell} slots={slots} />
            )}
          </div>
        )}
      </Section>

      <SpellPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function SpellRows({
  title,
  spells,
  onCast,
  slots,
}: {
  title: string;
  spells: SrdSpell[];
  onCast: (s: SrdSpell, atLevel: number | "ritual") => void | Promise<void>;
  slots: Character["spellSlots"];
}) {
  return (
    <div>
      <p className="mb-1.5 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
        {title}
      </p>
      <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {spells.map((s) => {
          // Slot levels available to cast this spell at: its own level and
          // up (upcasting), limited to slots the character actually has left.
          const upcastLevels: number[] =
            s.level === 0
              ? []
              : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).filter((l) => {
                  if (l < s.level) return false;
                  const row = slots?.[`l${l}` as keyof NonNullable<typeof slots>];
                  return !!row && row.max > 0 && row.used < row.max;
                });
          const canCast = s.level === 0 || upcastLevels.length > 0;
          return (
            <li
              key={s.index}
              className="flex items-start justify-between gap-3 rounded-md border border-line/60 bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm text-text">
                  {s.name}
                  {s.concentration && (
                    <span className="ml-2 font-mono text-xs text-accent-muted">
                      concentração
                    </span>
                  )}
                  {s.ritual && (
                    <span className="ml-1 font-mono text-xs text-accent-muted">
                      ritual
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted/80">
                  {s.level === 0 ? "truque" : `nível ${s.level}`} · {s.school.name.toLowerCase()} ·{" "}
                  {s.casting_time}
                </p>
                {s.desc?.[0] && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
                    {s.desc[0]}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {s.level === 0 ? (
                  <button
                    type="button"
                    onClick={() => onCast(s, 0)}
                    className="rounded-md border border-accent bg-accent/15 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/25"
                  >
                    Conjurar
                  </button>
                ) : canCast ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    {upcastLevels.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => onCast(s, lvl)}
                        title={lvl > s.level ? `Conjurar em nível ${lvl} (elevado)` : `Conjurar em nível ${lvl}`}
                        className="rounded-md border border-accent bg-accent/15 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/25"
                      >
                        N{lvl}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="rounded-md border border-accent bg-accent/15 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-accent opacity-30"
                  >
                    Conjurar
                  </button>
                )}
                {s.ritual && (
                  <button
                    type="button"
                    onClick={() => onCast(s, "ritual")}
                    title="Conjurar como ritual (sem gastar espaço, +10 min)"
                    className="rounded-md border border-line px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-text-muted transition hover:border-accent-muted hover:text-text"
                  >
                    Ritual
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GearTab({ character }: { character: Character }) {
  const currency = character.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const weight = currentWeight(character);
  const cap = carryCapacity(character);
  const enc = encumbranceLevel(character);
  const attuned = attunedCount(character);
  const toggleEquipped = useSessionStore((s) => s.toggleEquipped);
  const toggleAttunement = useSessionStore((s) => s.toggleAttunement);
  return (
    <div className="flex flex-col gap-5">
      <Section title="Moedas">
        <ul className="grid grid-cols-5 gap-2">
          {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
            <li
              key={k}
              className="rounded-md border border-line/60 bg-surface px-2 py-1.5 text-center"
            >
              <p className="font-display text-[10px] uppercase tracking-widest text-text-muted">
                {k.toUpperCase()}
              </p>
              <p className="mt-0.5 font-mono text-sm text-text">{currency[k]}</p>
            </li>
          ))}
        </ul>
        {character.goldPieces > 0 && currency.gp === 0 && (
          <p className="mt-1 text-xs text-text-muted/80">
            ({character.goldPieces} po em campo legado — migre pro currency.gp ao editar)
          </p>
        )}
      </Section>

      <Section title="Carga">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Peso"
            value={`${weight.toFixed(1)} / ${cap} lb`}
            accent={enc !== "ok"}
            hint={
              enc === "ok"
                ? "Sem penalidade"
                : enc === "encumbered"
                  ? "Sobrecarregado: -10 ft de deslocamento"
                  : enc === "heavy"
                    ? "Muito sobrecarregado: -20 ft; desvantagem em testes/ataques/saves de FOR, DES, CON"
                    : "Acima do limite — você não pode se mover"
            }
          />
          <StatTile
            label="Sintonias"
            value={`${attuned} / ${ATTUNEMENT_CAP}`}
            accent={attuned >= ATTUNEMENT_CAP}
          />
        </div>
      </Section>

      <Section title="Inventário">
        {character.inventory.length === 0 ? (
          <Empty text="Mochila vazia" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {character.inventory.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line/60 bg-surface px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm text-text">
                    {item.name}
                    {item.qty > 1 && (
                      <span className="ml-1 font-mono text-xs text-text-muted">
                        ×{item.qty}
                      </span>
                    )}
                  </p>
                  {item.notes && (
                    <p className="truncate text-xs text-text-muted/80">{item.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleEquipped(item.id)}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-xs uppercase tracking-widest transition",
                      item.equipped
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text",
                    )}
                  >
                    Eq.
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAttunement(item.id)}
                    disabled={!item.attuned && attuned >= ATTUNEMENT_CAP}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-xs uppercase tracking-widest transition",
                      item.attuned
                        ? "border-accent-muted/60 bg-accent/10 text-accent-muted"
                        : "border-line bg-surface text-text-muted hover:border-accent-muted hover:text-text",
                      "disabled:cursor-not-allowed disabled:opacity-30",
                    )}
                  >
                    Sint.
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function StoryTab({ character }: { character: Character }) {
  const bg = character.backgroundId ? getBackground(character.backgroundId) : null;
  const personality = character.personality ?? { traits: [], ideals: [], bonds: [], flaws: [] };
  const senses = character.senses ?? { darkvision: null, blindsight: null, truesight: null, tremorsense: null };
  const languages = character.languages ?? [];
  return (
    <div className="flex flex-col gap-5">
      <Section title="Antecedente">
        <p className="font-display text-sm text-text">{bg?.name ?? character.backgroundId}</p>
        {bg?.feature && (
          <div className="mt-1.5">
            <p className="text-xs font-medium text-text-muted">{bg.feature.name}</p>
            {bg.feature.desc.slice(0, 2).map((d, i) => (
              <p key={i} className="mt-1 text-xs leading-relaxed text-text-muted/80">
                {d}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section title="Personalidade">
        <PersonalityBlock label="Traços" items={personality.traits} />
        <PersonalityBlock label="Ideais" items={personality.ideals} />
        <PersonalityBlock label="Vínculos" items={personality.bonds} />
        <PersonalityBlock label="Defeitos" items={personality.flaws} />
      </Section>

      <Section title="Idiomas">
        {languages.length === 0 ? (
          <Empty text="—" />
        ) : (
          <p className="font-mono text-xs text-text-muted">{languages.join(", ")}</p>
        )}
      </Section>

      <Section title="Sentidos">
        <ul className="flex flex-col gap-1 text-xs text-text-muted">
          {senses.darkvision && <li>Visão no escuro · {senses.darkvision} ft</li>}
          {senses.blindsight && <li>Visão cega · {senses.blindsight} ft</li>}
          {senses.truesight && <li>Visão verdadeira · {senses.truesight} ft</li>}
          {senses.tremorsense && <li>Sentido sísmico · {senses.tremorsense} ft</li>}
          {!senses.darkvision &&
            !senses.blindsight &&
            !senses.truesight &&
            !senses.tremorsense && <li>Sentidos comuns apenas</li>}
        </ul>
      </Section>

      {character.bio && (
        <Section title="Biografia">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-muted/90">
            {character.bio}
          </p>
        </Section>
      )}
    </div>
  );
}

function FeaturesList({ character }: { character: Character }) {
  const unlocked = unlockedFeatures(character);
  const [openId, setOpenId] = useState<string | null>(null);
  if (unlocked.length === 0) return <Empty text="Nenhum recurso ainda" />;
  return (
    <ul className="flex flex-col gap-1.5">
      {unlocked.map((u) => {
        const id = `${u.classId}-${u.level}-${u.feature.index}`;
        const open = openId === id;
        return (
          <li key={id} className="rounded-md border border-line/60 bg-surface">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-surface-elevated/30"
            >
              <div>
                <p className="font-display text-sm text-text">{u.feature.name}</p>
                <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
                  {u.classId} · N{u.level}
                </p>
              </div>
              <ChevronDown
                className={cn("h-3.5 w-3.5 text-text-muted transition", open && "rotate-180")}
              />
            </button>
            {open && (
              <div className="border-t border-line/40 px-3 py-2 text-xs leading-relaxed text-text-muted">
                {u.feature.desc.map((line, i) => (
                  <p key={i} className={i === 0 ? "" : "mt-1.5"}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --- Atoms --------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">
        {title}
      </p>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      className="rounded-md border border-line/60 bg-surface px-2 py-1.5 text-center"
    >
      <p className="font-display text-[10px] uppercase tracking-[0.3em] text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-base leading-tight",
          accent ? "text-accent" : "text-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ProfDot({ on, expert }: { on: boolean; expert?: boolean }) {
  if (expert) {
    return (
      <span
        title="Expertise"
        className="h-2 w-2 shrink-0 rounded-full bg-accent ring-2 ring-accent/40"
      />
    );
  }
  return (
    <span
      title={on ? "Proficiente" : "Não proficiente"}
      className={cn(
        "h-2 w-2 shrink-0 rounded-full border",
        on ? "border-accent bg-accent" : "border-line bg-transparent",
      )}
    />
  );
}

function DotRow({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "accent" | "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
        {label}
      </span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full border",
              i < count
                ? tone === "accent"
                  ? "border-accent bg-accent"
                  : "border-danger bg-danger"
                : "border-line bg-transparent",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PersonalityBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-xs font-medium uppercase tracking-widest text-text-muted">{label}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs leading-relaxed text-text-muted/90">
            · {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-center text-xs text-text-muted/80">{text}</p>;
}
