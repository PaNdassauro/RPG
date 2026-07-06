export type RollMode = "adv" | "dis" | null;

export interface DieRoll {
  sides: number;
  value: number;
}

export interface DiceRollResult {
  expression: string;
  mode: RollMode;
  rolls: DieRoll[];
  kept: DieRoll[];
  modifier: number;
  total: number;
  isCritical: boolean;
  isFumble: boolean;
}

export interface AttackRollResult {
  attack: DiceRollResult;
  hit: boolean;
  crit: boolean;
  targetAC: number;
}
