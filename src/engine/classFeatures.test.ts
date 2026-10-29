import { describe, expect, it } from "vitest";
import { syncFeatureCounters } from "./classFeatures";
import { makeCharacter } from "@/test/fixtures";

describe("syncFeatureCounters", () => {
  it("cleric/paladin multiclass gets a single Channel Divinity counter", () => {
    const c = syncFeatureCounters(
      makeCharacter({
        classes: [
          { classId: "cleric", level: 6 },
          { classId: "paladin", level: 3 },
        ],
      }),
    );
    const cd = c.usageCounters.filter((u) => u.id === "channel-divinity");
    expect(cd).toHaveLength(1);
    expect(cd[0]!.max).toBe(2);
    expect(new Set(c.usageCounters.map((u) => u.id)).size).toBe(c.usageCounters.length);
  });

  it("paladin alone still gets one use from level 3", () => {
    const c = syncFeatureCounters(makeCharacter({ classes: [{ classId: "paladin", level: 3 }] }));
    expect(c.usageCounters.find((u) => u.id === "channel-divinity")?.max).toBe(1);
  });

  it("repairs a saved duplicate and keeps spent charges within the new max", () => {
    const dup = makeCharacter({
      classes: [
        { classId: "cleric", level: 2 },
        { classId: "paladin", level: 3 },
      ],
      usageCounters: [
        { id: "channel-divinity", max: 1, current: 0, perRest: "short" },
        { id: "channel-divinity", max: 1, current: 1, perRest: "short" },
      ],
    });
    const c = syncFeatureCounters(dup);
    expect(c.usageCounters.filter((u) => u.id === "channel-divinity")).toHaveLength(1);
    expect(c.usageCounters.find((u) => u.id === "channel-divinity")!.current).toBe(0);
  });
});
