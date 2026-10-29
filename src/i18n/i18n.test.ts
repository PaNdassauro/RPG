import { describe, expect, it } from "vitest";
import en from "./locales/en";
import ptBR from "./locales/ptBR";
import { tList, useLocaleStore } from "./index";

type Tree = { [k: string]: unknown };

function keyPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return [prefix];
  return Object.entries(node as Tree).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("locale dictionaries", () => {
  it("en and pt-BR expose the same keys", () => {
    expect(keyPaths(ptBR).sort()).toEqual(keyPaths(en).sort());
  });

  it("stub DM narration pools are non-empty in both locales", () => {
    for (const locale of ["en", "pt-BR"] as const) {
      useLocaleStore.setState({ locale });
      expect(tList("stubDm.openings").length).toBeGreaterThan(0);
      expect(tList("stubDm.reflections").length).toBeGreaterThan(0);
    }
  });

  it("no longer mentions the removed Ashfall setting", () => {
    for (const dict of [en, ptBR]) {
      const hits = keyPaths(dict).filter((path) =>
        /ashfall/i.test(JSON.stringify(path.split(".").reduce<unknown>((acc, k) => (acc as Tree)[k], dict))),
      );
      expect(hits).toEqual([]);
    }
  });
});
