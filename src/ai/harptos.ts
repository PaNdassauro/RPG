/**
 * Calendar of Harptos (Forgotten Realms): 12 months of 30 days in three
 * tendays, with five annual festival days between months (plus Shieldmeet
 * after Midsummer every fourth year). Pure helpers that turn the campaign's
 * day counter into an in-world date for the DM prompt.
 */

/** Campaign day 1 is 1 Ches, 1492 DR. */
export const CAMPAIGN_START_YEAR = 1492;
const START_MONTH_INDEX = 2; // Ches

const MONTHS = [
  "Hammer",
  "Alturiak",
  "Ches",
  "Tarsakh",
  "Mirtul",
  "Kythorn",
  "Flamerule",
  "Eleasis",
  "Eleint",
  "Marpenoth",
  "Uktar",
  "Nightal",
] as const;

/** Festival that follows each month (index = month index), if any. */
const FESTIVAL_AFTER: Partial<Record<number, string>> = {
  0: "Midwinter",
  3: "Greengrass",
  6: "Midsummer",
  8: "Highharvestide",
  10: "Feast of the Moon",
};

type Slot =
  | { kind: "day"; month: string; day: number }
  | { kind: "festival"; name: string };

export interface HarptosDate {
  year: number;
  /** Set on festival days (no month/day/tenday). */
  festival: string | null;
  month: string | null;
  day: number | null;
  /** 1–3 for ordinary days, null on festival days. */
  tenday: number | null;
}

export function isShieldmeetYear(year: number): boolean {
  return year % 4 === 0;
}

function yearSlots(year: number): Slot[] {
  const slots: Slot[] = [];
  MONTHS.forEach((month, mi) => {
    for (let day = 1; day <= 30; day++) slots.push({ kind: "day", month, day });
    const festival = FESTIVAL_AFTER[mi];
    if (festival) slots.push({ kind: "festival", name: festival });
    if (mi === 6 && isShieldmeetYear(year)) slots.push({ kind: "festival", name: "Shieldmeet" });
  });
  return slots;
}

/** Zero-based slot offset of 1 Ches within a year (30 Hammer + Midwinter + 30 Alturiak). */
const START_OFFSET = 30 + 1 + 30 * (START_MONTH_INDEX - 1);

/** Convert the campaign's `inWorldDay` (1-based) to a Harptos date. */
export function harptosDate(inWorldDay: number): HarptosDate {
  const dayIndex = Math.max(1, Math.floor(inWorldDay)) - 1;
  let year = CAMPAIGN_START_YEAR;
  let offset = START_OFFSET + dayIndex;
  for (;;) {
    const slots = yearSlots(year);
    if (offset < slots.length) {
      const slot = slots[offset]!;
      return slot.kind === "festival"
        ? { year, festival: slot.name, month: null, day: null, tenday: null }
        : {
            year,
            festival: null,
            month: slot.month,
            day: slot.day,
            tenday: Math.ceil(slot.day / 10),
          };
    }
    offset -= slots.length;
    year += 1;
  }
}

/** e.g. "1 Ches 1492 DR (tenday 1)" or "Greengrass 1492 DR". */
export function formatHarptosDate(inWorldDay: number): string {
  const d = harptosDate(inWorldDay);
  return d.festival
    ? `${d.festival}, ${d.year} DR`
    : `${d.day} ${d.month} ${d.year} DR (tenday ${d.tenday})`;
}
