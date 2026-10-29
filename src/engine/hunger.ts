/**
 * Travel rations and hunger. SRD: a character can go without food for
 * 3 + CON modifier days (minimum 1); at the end of each day beyond that
 * limit they suffer one level of exhaustion. A day of eating resets the count.
 */

export interface TravelHungerInput {
  rationsBefore: number;
  days: number;
  /** Consecutive days already spent without food before this trip. */
  daysWithoutFood: number;
  conMod: number;
  exhaustionLevel: number;
}

export interface TravelHungerResult {
  rationsConsumed: number;
  daysHungry: number;
  rationsAfter: number;
  /** New consecutive-hungry-days counter. */
  daysWithoutFood: number;
  exhaustionLevel: number;
  /** Levels added by this trip alone. */
  levelsAdded: number;
}

export function hungerThreshold(conMod: number): number {
  return Math.max(1, 3 + conMod);
}

export function resolveTravelHunger(input: TravelHungerInput): TravelHungerResult {
  const days = Math.max(0, Math.floor(input.days));
  const rationsConsumed = Math.min(Math.max(0, input.rationsBefore), days);
  const daysHungry = days - rationsConsumed;
  // Rations cover the first days of the trip, so any hungry days come after
  // a day of eating: the streak restarts instead of continuing from before.
  const streakBefore = rationsConsumed > 0 ? 0 : input.daysWithoutFood;
  const streakAfter = streakBefore + daysHungry;
  const threshold = hungerThreshold(input.conMod);
  // Only the days newly past the threshold count — not the whole overshoot,
  // which earlier trips already paid for.
  const levelsAdded = Math.max(0, streakAfter - threshold) - Math.max(0, streakBefore - threshold);
  return {
    rationsConsumed,
    daysHungry,
    rationsAfter: Math.max(0, input.rationsBefore) - rationsConsumed,
    daysWithoutFood: daysHungry > 0 ? streakAfter : 0,
    exhaustionLevel: Math.min(6, input.exhaustionLevel + levelsAdded),
    levelsAdded,
  };
}
