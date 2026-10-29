import { describe, expect, it } from "vitest";
import { formatHarptosDate, harptosDate, isShieldmeetYear } from "./harptos";

describe("Calendar of Harptos", () => {
  it("starts on 1 Ches 1492 DR", () => {
    expect(formatHarptosDate(1)).toBe("1 Ches 1492 DR (tenday 1)");
  });

  it("counts tendays within a month", () => {
    expect(harptosDate(10).tenday).toBe(1);
    expect(harptosDate(11).tenday).toBe(2);
    expect(harptosDate(21).tenday).toBe(3);
    expect(formatHarptosDate(30)).toBe("30 Ches 1492 DR (tenday 3)");
  });

  it("rolls into the next month", () => {
    expect(formatHarptosDate(31)).toBe("1 Tarsakh 1492 DR (tenday 1)");
  });

  it("inserts festival days between months", () => {
    expect(formatHarptosDate(60)).toBe("30 Tarsakh 1492 DR (tenday 3)");
    expect(formatHarptosDate(61)).toBe("Greengrass, 1492 DR");
    expect(formatHarptosDate(62)).toBe("1 Mirtul 1492 DR (tenday 1)");
    expect(harptosDate(61).tenday).toBeNull();
  });

  it("has Shieldmeet after Midsummer in leap years only", () => {
    expect(isShieldmeetYear(1492)).toBe(true);
    expect(isShieldmeetYear(1493)).toBe(false);
    expect(formatHarptosDate(152)).toBe("Midsummer, 1492 DR");
    expect(formatHarptosDate(153)).toBe("Shieldmeet, 1492 DR");
    expect(formatHarptosDate(154)).toBe("1 Eleasis 1492 DR (tenday 1)");
  });

  it("rolls over the year (1492 has 366 days, 305 of them from 1 Ches)", () => {
    expect(formatHarptosDate(305)).toBe("30 Nightal 1492 DR (tenday 3)");
    expect(formatHarptosDate(306)).toBe("1 Hammer 1493 DR (tenday 1)");
  });

  it("skips Shieldmeet in a non-leap year", () => {
    // 1 Hammer 1493 is day 306; Midsummer is the 213th slot of the year.
    expect(formatHarptosDate(306 + 212)).toBe("Midsummer, 1493 DR");
    expect(formatHarptosDate(306 + 213)).toBe("1 Eleasis 1493 DR (tenday 1)");
  });

  it("clamps nonsense input to day 1", () => {
    expect(formatHarptosDate(0)).toBe(formatHarptosDate(1));
    expect(formatHarptosDate(-5)).toBe(formatHarptosDate(1));
  });
});
