import type { AttackRollResult, DiceRollResult, DieRoll, RollMode } from "./types";

const EXPRESSION_REGEX = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

export interface ParsedExpression {
  count: number;
  sides: number;
  modifier: number;
}

export function parseExpression(expression: string): ParsedExpression {
  const match = expression.match(EXPRESSION_REGEX);
  if (!match) {
    throw new Error(`Invalid dice expression: "${expression}"`);
  }
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const sign = match[3] === "-" ? -1 : 1;
  const modifier = match[4] ? sign * Number(match[4]) : 0;

  if (count < 1 || count > 100) throw new Error("Dice count must be 1-100");
  if (sides < 2 || sides > 1000) throw new Error("Dice sides must be 2-1000");

  return { count, sides, modifier };
}

export function rollDie(sides: number): number {
  if (sides < 2) throw new Error("Die must have at least 2 sides");
  // Rejection sampling for an unbiased uniform integer in [1, sides].
  const range = 2 ** 32;
  const limit = range - (range % sides);
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0]!;
  } while (n >= limit);
  return (n % sides) + 1;
}

export function rollExpression(expression: string): DiceRollResult {
  const { count, sides, modifier } = parseExpression(expression);
  const rolls: DieRoll[] = Array.from({ length: count }, () => ({
    sides,
    value: rollDie(sides),
  }));
  const subtotal = rolls.reduce((sum, r) => sum + r.value, 0);

  const isD20Single = sides === 20 && count === 1;
  return {
    expression,
    mode: null,
    rolls,
    kept: rolls,
    modifier,
    total: subtotal + modifier,
    isCritical: isD20Single && rolls[0]!.value === 20,
    isFumble: isD20Single && rolls[0]!.value === 1,
  };
}

export function rollWithMode(expression: string, mode: RollMode): DiceRollResult {
  if (!mode) return rollExpression(expression);

  const { sides, modifier } = parseExpression(expression);
  if (sides !== 20) {
    throw new Error("Advantage / disadvantage only applies to d20 rolls");
  }
  const a: DieRoll = { sides: 20, value: rollDie(20) };
  const b: DieRoll = { sides: 20, value: rollDie(20) };
  const kept = mode === "adv"
    ? (a.value >= b.value ? a : b)
    : (a.value <= b.value ? a : b);

  return {
    expression,
    mode,
    rolls: [a, b],
    kept: [kept],
    modifier,
    total: kept.value + modifier,
    isCritical: kept.value === 20,
    isFumble: kept.value === 1,
  };
}

export function rollAttack(args: {
  bonus: number;
  targetAC: number;
  mode?: RollMode;
}): AttackRollResult {
  const expr = `1d20${args.bonus >= 0 ? "+" : ""}${args.bonus}`;
  const attack = args.mode ? rollWithMode(expr, args.mode) : rollExpression(expr);
  const naturalRoll = attack.kept[0]!.value;
  const crit = naturalRoll === 20;
  const fumble = naturalRoll === 1;
  const hit = crit || (!fumble && attack.total >= args.targetAC);
  return { attack, hit, crit, targetAC: args.targetAC };
}

export function rollDamage(expression: string, opts: { crit?: boolean } = {}): DiceRollResult {
  const { count, sides, modifier } = parseExpression(expression);
  // 5e crit: roll the dice twice, modifier added once.
  const totalCount = opts.crit ? count * 2 : count;
  const rolls: DieRoll[] = Array.from({ length: totalCount }, () => ({
    sides,
    value: rollDie(sides),
  }));
  const subtotal = rolls.reduce((sum, r) => sum + r.value, 0);
  return {
    expression,
    mode: null,
    rolls,
    kept: rolls,
    modifier,
    total: subtotal + modifier,
    isCritical: false,
    isFumble: false,
  };
}

export function formatExpression(expression: string, mode: RollMode = null): string {
  const { count, sides, modifier } = parseExpression(expression);
  const base = `${count}d${sides}`;
  const mod = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`;
  const suffix = mode === "adv" ? " (adv)" : mode === "dis" ? " (dis)" : "";
  return `${base}${mod}${suffix}`;
}

export type { RollMode };
