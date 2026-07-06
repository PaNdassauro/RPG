/**
 * Curated subset of canonical 5e feats. Each entry carries the rules text
 * and a small `effects` block the engine can act on. We track only effects
 * the engine currently mechanizes (HP, AC, attack mods, prof grants); the
 * narrative text covers the rest for the player and DM.
 */
import type { Ability, Condition } from "@/schemas/character";

export interface FeatEffect {
  /** Flat HP bump on acquisition. */
  hpBonus?: number;
  /** Initiative bonus. */
  initBonus?: number;
  /** AC bonus while wearing no armor. */
  unarmoredAcBonus?: number;
  /** Add to known languages. */
  languages?: number;
  /** Grants proficiency in saves. */
  saveProfs?: Ability[];
  /** Cannot be surprised; can't be made prone (Alert, etc.). */
  immuneConditions?: Condition[];
  /** Toggleable -5 to hit / +10 damage rider (GWM / SS). */
  powerAttack?: "melee-heavy" | "ranged";
  /** Reduces ranged disadvantage from cover/long range. */
  ignoreCover?: boolean;
  /** Sneak Attack synergy / advantage gate (not modeled mechanically). */
  notes?: string;
}

export interface Feat {
  id: string;
  name: string;
  description: string;
  /** Ability prereq (score ≥ value). */
  prereq?: { ability: Ability; min: number };
  effect: FeatEffect;
}

export const FEATS: Feat[] = [
  {
    id: "alert",
    name: "Alerta",
    description:
      "Você ganha +5 em iniciativa. Não pode ser surpreendido enquanto estiver consciente. Inimigos ocultos não ganham vantagem em ataques contra você.",
    effect: { initBonus: 5, notes: "Imune a surpresa" },
  },
  {
    id: "lucky",
    name: "Sortudo",
    description:
      "Você tem 3 pontos de sorte por descanso longo. Pode gastar 1 ponto para rolar 1d20 extra em ataque, teste ou salvamento (seu ou contra você) e escolher qual dado usar.",
    effect: { notes: "3 pontos de sorte por dia (rastreie narrativamente)" },
  },
  {
    id: "resilient",
    name: "Resiliente",
    description:
      "Escolha um atributo: +1 nele (máx. 20) e ganhe proficiência em testes de resistência desse atributo.",
    effect: { saveProfs: [] /* asks for choice at pick-time */ },
  },
  {
    id: "tough",
    name: "Resistente",
    description:
      "Seu máximo de PV aumenta em 2 por nível de personagem (aplicado retroativamente). A cada novo nível, ganhe +2 PV.",
    effect: { hpBonus: 0, notes: "Aplica 2 × nível atual no momento da escolha" },
  },
  {
    id: "great-weapon-master",
    name: "Mestre de Armas Pesadas",
    description:
      "Ao acertar uma criatura com ataque pesado corpo-a-corpo, você pode usar bônus de ataque. Antes de atacar com arma pesada, opcionalmente -5 no ataque para +10 no dano.",
    effect: { powerAttack: "melee-heavy" },
  },
  {
    id: "sharpshooter",
    name: "Atirador de Elite",
    description:
      "Ataques à distância ignoram cobertura parcial/cobertura de 3/4. Ignora desvantagem por longa distância. Opcionalmente -5 no ataque para +10 no dano.",
    effect: { powerAttack: "ranged", ignoreCover: true },
  },
  {
    id: "polearm-master",
    name: "Mestre de Astes",
    description:
      "Após Ataque com glaive/halberd/quarterstaff/pike, ataque bônus com a outra ponta (1d4 contundente). Inimigos que entram em seu alcance provocam ataque de oportunidade.",
    effect: { notes: "Ataque bônus 1d4; OA estendido ao entrar no alcance" },
  },
  {
    id: "sentinel",
    name: "Sentinela",
    description:
      "Ataques de oportunidade impostos zeram a velocidade do alvo. Você ainda dá OA mesmo se o inimigo Desengajar. Quando uma criatura adjacente ataca outra criatura (não você), você pode usar reação para atacá-la.",
    effect: { notes: "OA zera velocidade; ignora Desengajar" },
  },
  {
    id: "war-caster",
    name: "Conjurador de Guerra",
    description:
      "Vantagem em testes de resistência de Constituição contra perda de concentração. Pode conjurar com armas/escudo equipados. Pode usar reação para conjurar magia (em vez de só OA) contra criatura saindo do alcance.",
    effect: { notes: "Vantagem em CON para concentração; OA pode ser feitiço" },
  },
  {
    id: "mobile",
    name: "Móvel",
    description:
      "+10 ft de deslocamento. Investida não custa movimento extra em terreno difícil. Se você atacar uma criatura corpo-a-corpo no turno, não provoca ataque de oportunidade dela neste turno.",
    effect: { notes: "+10 ft de deslocamento; imune a OA do alvo atacado" },
  },
];

export function getFeat(id: string): Feat | undefined {
  return FEATS.find((f) => f.id === id);
}
