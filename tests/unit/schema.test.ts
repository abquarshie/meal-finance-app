// Every model reads from the real tables (a wrong column or table name fails here), and every column in the
// database is mapped in prisma/schema.prisma. Runs when DATABASE_URL points at a Cashew database.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

/** {model: {table: "meals.plan", columns: [...]}} from schema.prisma, read as text. */
function models() {
  const text = readFileSync(path.join(import.meta.dirname, "../../prisma/schema.prisma"), "utf8");
  const out: Record<string, { table: string; columns: string[] }> = {};
  for (const m of text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const body = m[2];
    const table = /@@map\("(\w+)"\)/.exec(body)?.[1] ?? m[1];
    const schema = /@@schema\("(\w+)"\)/.exec(body)?.[1] ?? "public";
    const columns: string[] = [];
    for (const line of body.split("\n")) {
      const f = /^\s+(\w+)\s+([A-Z]\w*)(\[\])?(\?)?/.exec(line);
      if (!f || f[3] || /@relation/.test(line)) continue;
      if (!["Int", "String", "Decimal", "DateTime", "Boolean", "Json"].includes(f[2])) continue;
      columns.push(/@map\("(\w+)"\)/.exec(line)?.[1] ?? f[1]);
    }
    out[m[1]] = { table: `${schema}.${table}`, columns };
  }
  return out;
}

describe.skipIf(!url?.startsWith("postgres"))("prisma/schema.prisma matches the database", async () => {
  const { prisma } = await import("@/lib/db");
  const all = models();
  it("every model reads", async () => {
    for (const name of Object.keys(all)) await (prisma as any)[name[0].toLowerCase() + name.slice(1)].findFirst();
    expect(Object.keys(all).length).toBe(23);
  });
  it("every column is mapped, and nothing mapped is missing", async () => {
    const cols = await prisma.$queryRaw<{ k: string }[]>`
      SELECT table_schema || '.' || table_name || '.' || column_name AS k FROM information_schema.columns
      WHERE table_schema IN ('public', 'meals')`;
    const inDb = new Set(cols.map((c) => c.k));
    const mapped = new Set(Object.values(all).flatMap((m) => m.columns.map((c) => `${m.table}.${c}`)));
    expect([...inDb].filter((k) => !mapped.has(k))).toEqual([]);
    expect([...mapped].filter((k) => !inDb.has(k))).toEqual([]);
  });
});
