/**
 * One-click character creation: pick a class + name; everything else is
 * filled with sensible defaults so the player can start playing immediately.
 *
 * Defaults:
 *  - Race: human (no subrace pick required)
 *  - Background: acolyte (works for any class lore-wise; players can rename
 *    in story later)
 *  - Setting: the Forgotten Realms (the only world)
 *  - Ability scores: standard array assigned to the class's primary stat
 *  - Skills: first N from the class's proficiency_choices.from.options
 *  - Equipment: the first option of each class equipment choice, plus the
 *    background kit (the DM can grant more in the opening scene)
 */
import { newId } from "@/lib/id";
import { db } from "@/db/schema";
import { finalizeCharacter, type WizardSnapshot } from "@/state/finalizeCharacter";
import { getClass } from "@/data/srd";
import { FORGOTTEN_REALMS_ID } from "@/data/settings";
import type { Ability, SkillName } from "@/schemas/character";
import type { Campaign } from "@/schemas/campaign";

/** SRD class → primary ability, in priority order. */
const PRIMARY_ABILITY: Record<string, Ability[]> = {
  barbarian: ["str", "con", "dex"],
  bard: ["cha", "dex", "con"],
  cleric: ["wis", "con", "str"],
  druid: ["wis", "con", "dex"],
  fighter: ["str", "con", "dex"],
  monk: ["dex", "wis", "con"],
  paladin: ["str", "cha", "con"],
  ranger: ["dex", "wis", "con"],
  rogue: ["dex", "cha", "con"],
  sorcerer: ["cha", "con", "dex"],
  warlock: ["cha", "con", "dex"],
  wizard: ["int", "con", "dex"],
};

/** Standard array, descending: assign to primary→secondary→… */
const STANDARD_ARRAY_DESCENDING = [15, 14, 13, 12, 10, 8];
const ALL_ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

function pickDefaultSkills(classId: string): SkillName[] {
  const klass = getClass(classId);
  if (!klass) return [];
  const choice = klass.proficiency_choices?.[0];
  if (!choice) return [];
  const opts = (choice.from.options ?? []) as {
    item?: { index: string };
    choice?: unknown;
  }[];
  const skills: SkillName[] = [];
  for (const opt of opts) {
    if (skills.length >= choice.choose) break;
    const idx = opt.item?.index;
    if (!idx?.startsWith("skill-")) continue;
    const skill = idx.replace(/^skill-/, "") as SkillName;
    // SRD uses kebab-case; map back to camel for our internal names.
    const camel = skill.replace(/-([a-z])/g, (_, c: string) =>
      c.toUpperCase(),
    ) as SkillName;
    skills.push(camel);
  }
  return skills;
}

function buildAbilities(classId: string): Record<Ability, number> {
  const priorityRaw = PRIMARY_ABILITY[classId] ?? ["str", "con", "dex"];
  const priority = [
    ...priorityRaw,
    ...ALL_ABILITIES.filter((a) => !priorityRaw.includes(a)),
  ];
  const scores: Record<Ability, number> = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  priority.forEach((ab, i) => {
    scores[ab] = STANDARD_ARRAY_DESCENDING[i] ?? 10;
  });
  return scores;
}

export interface QuickStartInput {
  name: string;
  classId: string;
  /** Optional portrait override; defaults to first portrait. */
  portraitId?: string;
}

export async function createQuickStartCampaign(
  input: QuickStartInput,
): Promise<{ campaignId: string }> {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Name required");
  const klass = getClass(input.classId);
  if (!klass) throw new Error(`Unknown class: ${input.classId}`);

  const abilities = buildAbilities(input.classId);
  const skills = pickDefaultSkills(input.classId);

  const snapshot: WizardSnapshot = {
    identity: {
      name: trimmedName,
      bio: "",
      portraitId: input.portraitId ?? "p-01",
    },
    race: { raceId: "human", subraceId: null, abilityChoiceBonuses: {} },
    classChoice: { classId: input.classId, level: 1 },
    background: { backgroundId: "acolyte" },
    abilities: {
      mode: "manual",
      scores: abilities,
      arrayAssignments: {},
      manualRolls: [],
    },
    skills: { selected: skills },
    equipment: { choices: [] },
  };

  const character = finalizeCharacter(snapshot);
  const now = Date.now();
  const campaignId = newId();
  const campaign: Campaign = {
    id: campaignId,
    title: `${trimmedName}'s Tale`,
    characterId: character.id,
    worldSeed: newId(),
    settingId: FORGOTTEN_REALMS_ID,
    currentLocation: { name: "An Unknown Threshold", description: "" },
    inWorldDay: 1,
    quests: [],
    factions: [],
    companions: [],
    pinnedFacts: [],
    placesVisited: [],
    npcsMet: [],
    rollingSummary: "",
    summaryThroughTurn: 0,
    journal: "",
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", db.characters, db.campaigns, async () => {
    await db.characters.put(character);
    await db.campaigns.put(campaign);
  });

  return { campaignId };
}
