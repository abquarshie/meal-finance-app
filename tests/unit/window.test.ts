import { describe, expect, it } from "vitest";
import { readBook } from "@/lib/load";
import { today, monthOf, addMonthsToKey } from "@/lib/dates";
// Runs against any Cashew database (DATABASE_URL): the everyday screens read only recent rows plus totals worked out
// by the database, and must show exactly what reading every transaction would.
describe.skipIf(!process.env.DATABASE_URL)("recent rows plus database totals give the same figures as every row", () => {
  it("same figures", async () => {
    const [full, win] = await Promise.all([readBook({ since: null }), readBook()]);
    const now = today(); const m = monthOf(now); const p = addMonthsToKey(m, -1);
    const r = (x: unknown) => JSON.parse(JSON.stringify(x, (_, v) => typeof v === "number" ? Math.round(v * 100) / 100 : v));
    expect(r(Object.fromEntries(win.balances()))).toEqual(r(Object.fromEntries(full.balances())));
    expect(win.months(now)).toEqual(full.months(now));
    expect(win.members()).toEqual(full.members());
    expect(win.unassigned).toBe(full.unassigned);
    expect(win.monthTotals(m)).toEqual(full.monthTotals(m));
    expect(win.monthTotals(p, 12)).toEqual(full.monthTotals(p, 12));
    expect(r(win.budgetStatus(m))).toEqual(r(full.budgetStatus(m)));
    expect(r(win.spendingPower(now))).toEqual(r(full.spendingPower(now)));
    for (const k of ["Expense", "Income", "Transfer"] as const) {
      expect(win.topCategories(k, 6, now)).toEqual(full.topCategories(k, 6, now));
      expect(win.defaultAccount(k)).toEqual(full.defaultAccount(k));
    }
    const old = addMonthsToKey(m, -14);
    const olderBook = await readBook({ month: old });
    expect(olderBook.monthTotals(old)).toEqual(full.monthTotals(old));
    expect(r(olderBook.budgetStatus(old))).toEqual(r(full.budgetStatus(old)));
  });
});
