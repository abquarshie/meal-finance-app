// Runs only when PARITY_JSON points at what the Python Book said about the same database (see tests/parity/).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBook } from "@/lib/load"; // read only: adds no auto transactions
const loadBook = () => readBook({ since: null }); // every transaction, like the Python Book

const file = process.env.PARITY_JSON;
const want = file ? JSON.parse(readFileSync(file, "utf8")) : null;
const close = (a: number, b: number) => Math.abs(a - b) < 0.006;
// to the cent: Python keeps float noise like -576.9499999999998 where this app rounds
const cents = (x: any): any => typeof x === "number" ? Math.round(x * 100) / 100
  : Array.isArray(x) ? x.map(cents) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, cents(v)])) : x;

describe.skipIf(!want)("same answers as the Python app on the same database", () => {
  it("balances, members, months and smart defaults", async () => {
    const b = await loadBook();
    expect(Object.fromEntries(b.balances())).toEqual(want.balances);
    expect(b.members()).toEqual(want.members);
    expect(b.months("2026-10-20").map((m) => m)).toEqual(want.months);
    expect(b.unassigned).toBe(want.unassigned);
    for (const k of ["Expense", "Income", "Transfer"] as const) {
      expect(b.topCategories(k, 6, "2026-10-20")).toEqual(want[`top_${k}`]);
      expect(b.defaultAccount(k)).toBe(want[`acct_${k}`]);
    }
    expect(b.defaultAccount("Transfer", "toAccount")).toBe(want.acct_to);
    for (const [c, v] of Object.entries(want.last)) expect(b.lastAmount("Expense", c)).toBe(v);
  });

  it("budgets, auto payments still due and the banner figure, on several days", async () => {
    const b = await loadBook();
    for (const [day, w] of Object.entries<any>(want.days)) {
      const month = day.slice(0, 7);
      const status = b.budgetStatus(month);
      expect(cents(status.map((s) => [s.name, s.limit, s.spent, s.isGroup]))).toEqual(
        cents(w.status.map((s: any) => [s.name, s.limit, s.spent, s.is_group])));
      status.forEach((s, i) => expect(close(s.pct, w.status[i].pct)).toBe(true));
      expect(cents(b.budgetTotal(month))).toEqual(cents(w.total));
      expect(cents(b.monthTotals(month))).toEqual(cents(w.totals));
      const prev = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5) - 2, 1)).toISOString().slice(0, 7);
      expect(cents(b.monthTotals(prev, +day.slice(8)))).toEqual(cents(w.upto));
      const p = b.spendingPower(day);
      const q = w.power;
      expect(cents([p.state, p.left, p.everyday, p.savings, p.hasSavings, p.debt, p.committed, p.free])).toEqual(cents(
        [q.state, q.left, q.everyday, q.savings, q.has_savings, q.debt, q.committed, q.free]));
      expect(cents(p.budget)).toEqual(cents(q.budget));
      expect(cents(p.committedItems)).toEqual(cents(q.committed_items));
    }
  });
});
