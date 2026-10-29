/**
 * In-memory stand-in for the Dexie tables the session store touches. Use with
 * `vi.mock("@/db/schema", async () => await import("@/test/fakeDb"))`.
 */
type Row = Record<string, unknown>;

export const tables = {
  campaigns: [] as Row[],
  characters: [] as Row[],
  messages: [] as Row[],
  diceRolls: [] as Row[],
  encounters: [] as Row[],
  settings: [] as Row[],
};

type TableName = keyof typeof tables;
const keyOf = (name: TableName): string => (name === "settings" ? "key" : "id");

function table(name: TableName) {
  return {
    get: async (id: string) => tables[name].find((r) => r[keyOf(name)] === id),
    put: async (row: Row) => {
      const i = tables[name].findIndex((r) => r[keyOf(name)] === row[keyOf(name)]);
      if (i >= 0) tables[name][i] = row;
      else tables[name].push(row);
    },
    bulkPut: async (rows: Row[]) => {
      for (const row of rows) await table(name).put(row);
    },
    update: async (id: string, patch: Row) => {
      const r = tables[name].find((x) => x[keyOf(name)] === id);
      if (r) Object.assign(r, patch);
    },
    bulkGet: async (ids: string[]) => ids.map((id) => tables[name].find((r) => r.id === id)),
    where: (field: string) => ({
      equals: (value: unknown) => {
        let rows = tables[name].filter((r) => r[field] === value);
        const chain = {
          toArray: async () => rows,
          filter: (fn: (r: Row) => boolean) => {
            rows = rows.filter(fn);
            return chain;
          },
          modify: async (patch: Row) => {
            for (const r of rows) Object.assign(r, patch);
          },
        };
        return chain;
      },
      between: () => ({ toArray: async () => tables[name] }),
    }),
  };
}

export const db = {
  campaigns: table("campaigns"),
  characters: table("characters"),
  messages: table("messages"),
  diceRolls: table("diceRolls"),
  encounters: table("encounters"),
  settings: table("settings"),
  transaction: async (_mode: string, ...rest: unknown[]) => {
    const fn = rest[rest.length - 1] as () => Promise<void>;
    await fn();
  },
};

export function clearTables(): void {
  for (const t of Object.values(tables)) t.length = 0;
}
