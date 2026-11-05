import { describe, expect, it } from "vitest";
import { Book, type TxRow } from "@/lib/book";
import { monthReview } from "@/lib/review";

let id = 1;
const tx = (p: Partial<TxRow>): TxRow => ({ id: id++, date: "2026-10-05", type: "Expense", category: "Staples", amount: 0, note: "",
  member: "", account: "GCB", toAccount: "", createdBy: "", ...p });

const book = (rows: TxRow[]) => new Book({
  tx: rows,
  categories: [
    { id: 1, name: "Staples", groupName: "Food", kind: "Expense" },
    { id: 2, name: "Dining Out", groupName: "Food", kind: "Expense" },
    { id: 3, name: "Internet Data", groupName: "Utility", kind: "Expense" },
    { id: 4, name: "Salary", groupName: "Income", kind: "Income" },
    { id: 5, name: "Savings", groupName: "Transfer", kind: "Transfer" },
  ],
  accounts: [{ id: 1, name: "GCB", openingBalance: 0, spendable: true }],
  budgets: [], rules: [], goals: [], contributions: [], users: [], features: {},
});

describe("month in review", () => {
  const b = book([
    tx({ date: "2026-10-03", amount: 300, note: "Rice" }),
    tx({ date: "2026-10-09", category: "Dining Out", amount: 120 }),
    tx({ date: "2026-10-12", category: "Internet Data", amount: 50 }),
    tx({ date: "2026-09-04", amount: 200 }),
    tx({ date: "2026-09-20", category: "Internet Data", amount: 80 }),
    tx({ date: "2026-08-04", amount: 100 }),
    tx({ date: "2026-10-01", type: "Income", category: "Salary", amount: 2000 }),
    tx({ date: "2026-10-02", type: "Transfer", category: "Savings", amount: 250, toAccount: "Goal: School fees" }),
    tx({ date: "2026-10-20", type: "Transfer", category: "Savings", amount: 40, account: "Goal: School fees", toAccount: "GCB" }),
    tx({ date: "2026-04-01", amount: 999 }), // outside the six months
  ]);
  const r = monthReview(b, "2026-10", 6);

  it("covers six months ending with the chosen one", () => {
    expect(r.months).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(r.expenses).toEqual([0, 0, 0, 100, 280, 470]);
    expect(r.income[5]).toBe(2000);
  });
  it("adds up each group, biggest this month first, with the average of the months before", () => {
    expect(r.groups.map((g) => [g.group, g.now, g.prev])).toEqual([["Food", 420, 200], ["Utility", 50, 80]]);
    expect(r.groups[0].avg).toBe(60); // (0+0+0+100+200)/5
  });
  it("lists what went up and down against the month before", () => {
    expect(r.ups.map((c) => [c.category, c.diff])).toEqual([["Dining Out", 120], ["Staples", 100]]);
    expect(r.downs.map((c) => [c.category, c.diff])).toEqual([["Internet Data", -30]]);
  });
  it("counts money moved into and out of goals", () => {
    expect([r.toGoals, r.fromGoals]).toEqual([250, 40]);
  });
  it("lists the biggest expenses", () => {
    expect(r.biggest[0]).toMatchObject({ amount: 300, note: "Rice" });
  });
});
