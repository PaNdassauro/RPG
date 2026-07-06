import { create } from "zustand";
import type { Ability, SkillName } from "@/schemas/character";
import { DEFAULT_SETTING_ID, type SettingId } from "@/data/settings";

export type AbilityInputMode = "point_buy" | "standard_array" | "manual";

export interface WizardSetting {
  settingId: SettingId;
  /** Free-form world description — only used when settingId === "custom". */
  customDescription: string;
}

export interface WizardIdentity {
  name: string;
  bio: string;
  portraitId: string;
}

export interface WizardRace {
  raceId: string | null;
  subraceId: string | null;
  abilityChoiceBonuses: Partial<Record<Ability, number>>;
}

export interface WizardClass {
  classId: string | null;
  /** Single L1 class for MVP. */
  level: 1;
}

export interface WizardBackground {
  backgroundId: string | null;
}

export interface WizardAbilities {
  mode: AbilityInputMode;
  scores: Record<Ability, number>;
  /** Standard-array assignments: ability → which array slot was placed. */
  arrayAssignments: Partial<Record<Ability, number>>;
  /** Manual roll history (for show / re-roll affordance). */
  manualRolls: number[];
}

export interface WizardSkills {
  selected: SkillName[];
}

export interface WizardEquipment {
  /** index of the chosen option per starting_equipment_options entry. */
  choices: number[];
}

export type WizardStep =
  | "setting"
  | "identity"
  | "race"
  | "class"
  | "background"
  | "abilities"
  | "skills"
  | "equipment"
  | "review";

export const WIZARD_STEPS: WizardStep[] = [
  "setting",
  "identity",
  "race",
  "class",
  "background",
  "abilities",
  "skills",
  "equipment",
  "review",
];

export const STEP_TITLES: Record<WizardStep, string> = {
  setting: "World",
  identity: "Identity",
  race: "Heritage",
  class: "Calling",
  background: "Background",
  abilities: "Abilities",
  skills: "Talents",
  equipment: "Provisions",
  review: "Review",
};

const DEFAULT_SCORES: Record<Ability, number> = {
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
};

interface WizardState {
  step: WizardStep;
  setting: WizardSetting;
  identity: WizardIdentity;
  race: WizardRace;
  classChoice: WizardClass;
  background: WizardBackground;
  abilities: WizardAbilities;
  skills: WizardSkills;
  equipment: WizardEquipment;

  // ---- actions ----
  setStep: (step: WizardStep) => void;
  next: () => void;
  prev: () => void;

  setSetting: (patch: Partial<WizardSetting>) => void;
  setIdentity: (patch: Partial<WizardIdentity>) => void;
  setRace: (raceId: string | null, subraceId?: string | null) => void;
  setRaceAbilityChoice: (ability: Ability, bonus: number) => void;
  clearRaceAbilityChoice: (ability: Ability) => void;
  setClass: (classId: string | null) => void;
  setBackground: (backgroundId: string | null) => void;
  setAbilityMode: (mode: AbilityInputMode) => void;
  setAbilityScore: (ability: Ability, value: number) => void;
  setArrayAssignment: (ability: Ability, slotIndex: number | null) => void;
  setManualRolls: (rolls: number[]) => void;
  toggleSkill: (skill: SkillName) => void;
  setEquipmentChoice: (groupIndex: number, optionIndex: number) => void;

  reset: () => void;
}

const initialState = (): Omit<
  WizardState,
  | "setStep"
  | "next"
  | "prev"
  | "setSetting"
  | "setIdentity"
  | "setRace"
  | "setRaceAbilityChoice"
  | "clearRaceAbilityChoice"
  | "setClass"
  | "setBackground"
  | "setAbilityMode"
  | "setAbilityScore"
  | "setArrayAssignment"
  | "setManualRolls"
  | "toggleSkill"
  | "setEquipmentChoice"
  | "reset"
> => ({
  step: "setting",
  setting: { settingId: DEFAULT_SETTING_ID, customDescription: "" },
  identity: { name: "", bio: "", portraitId: "p-01" },
  race: { raceId: null, subraceId: null, abilityChoiceBonuses: {} },
  classChoice: { classId: null, level: 1 },
  background: { backgroundId: null },
  abilities: {
    mode: "standard_array",
    scores: { ...DEFAULT_SCORES },
    arrayAssignments: {},
    manualRolls: [],
  },
  skills: { selected: [] },
  equipment: { choices: [] },
});

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initialState(),

  setStep: (step) => set({ step }),

  next: () => {
    const idx = WIZARD_STEPS.indexOf(get().step);
    const nextStep = WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)];
    if (nextStep) set({ step: nextStep });
  },

  prev: () => {
    const idx = WIZARD_STEPS.indexOf(get().step);
    const prevStep = WIZARD_STEPS[Math.max(idx - 1, 0)];
    if (prevStep) set({ step: prevStep });
  },

  setSetting: (patch) =>
    set((s) => ({ setting: { ...s.setting, ...patch } })),

  setIdentity: (patch) =>
    set((s) => ({ identity: { ...s.identity, ...patch } })),

  setRace: (raceId, subraceId) =>
    set((s) => ({
      race: {
        raceId,
        subraceId: subraceId ?? null,
        // Clear choice bonuses if the race itself changed.
        abilityChoiceBonuses:
          s.race.raceId === raceId ? s.race.abilityChoiceBonuses : {},
      },
    })),

  setRaceAbilityChoice: (ability, bonus) =>
    set((s) => ({
      race: {
        ...s.race,
        abilityChoiceBonuses: {
          ...s.race.abilityChoiceBonuses,
          [ability]: bonus,
        },
      },
    })),

  clearRaceAbilityChoice: (ability) =>
    set((s) => {
      const next = { ...s.race.abilityChoiceBonuses };
      delete next[ability];
      return { race: { ...s.race, abilityChoiceBonuses: next } };
    }),

  setClass: (classId) =>
    set((s) => ({
      classChoice: { ...s.classChoice, classId },
      // Clearing skills if class changed — class limits skill choices.
      skills: s.classChoice.classId === classId ? s.skills : { selected: [] },
      equipment: s.classChoice.classId === classId ? s.equipment : { choices: [] },
    })),

  setBackground: (backgroundId) =>
    set({ background: { backgroundId } }),

  setAbilityMode: (mode) =>
    set((s) => ({
      abilities: {
        ...s.abilities,
        mode,
        // Reset scores to default when switching modes (except manual keeps rolls).
        scores: { ...DEFAULT_SCORES },
        arrayAssignments: {},
      },
    })),

  setAbilityScore: (ability, value) =>
    set((s) => ({
      abilities: {
        ...s.abilities,
        scores: { ...s.abilities.scores, [ability]: value },
      },
    })),

  setArrayAssignment: (ability, slotIndex) =>
    set((s) => {
      const next = { ...s.abilities.arrayAssignments };
      if (slotIndex == null) delete next[ability];
      else {
        // Remove this slotIndex from any other ability.
        for (const key of Object.keys(next) as Ability[]) {
          if (next[key] === slotIndex) delete next[key];
        }
        next[ability] = slotIndex;
      }
      return {
        abilities: { ...s.abilities, arrayAssignments: next },
      };
    }),

  setManualRolls: (rolls) =>
    set((s) => ({ abilities: { ...s.abilities, manualRolls: rolls } })),

  toggleSkill: (skill) =>
    set((s) => {
      const has = s.skills.selected.includes(skill);
      return {
        skills: {
          selected: has
            ? s.skills.selected.filter((k) => k !== skill)
            : [...s.skills.selected, skill],
        },
      };
    }),

  setEquipmentChoice: (groupIndex, optionIndex) =>
    set((s) => {
      const next = [...s.equipment.choices];
      next[groupIndex] = optionIndex;
      return { equipment: { choices: next } };
    }),

  reset: () => set(initialState()),
}));
