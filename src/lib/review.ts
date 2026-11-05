// The month in review: a month's money next to the months before it. Pure, like book.ts, so it can be tested.
import type { Book } from "./book";
import { addMonthsToKey, type MonthKey } from "./dates";
import { round2 } from "./money";

export type GroupTrend = { group: string; months: number[]; now: number; prev: number; avg: number };
export type CategoryChange = { category: string; group: string; now: number; prev: number; diff: number };
export type MonthReview = {
  period: MonthKey;
  months: MonthKey[]; // oldest first, ending with period
  income: number[]; expenses: number[]; // per month, same order
  groups: GroupTrend[]; // biggest this month first
  ups: CategoryChange[]; downs: CategoryChange[]; // biggest changes against the month before
  toGoals: number; fromGoals: number; // money moved into and out of goals in the period
  biggest: { date: string; category: string; note: string; amount: number }[];
};

const GOAL = "Goal: ";

/** `n` months ending at `period`. The book must hold transactions back to the first of them. */
export function monthReview(b: Book, period: MonthKey, n = 6): MonthReview {
  const months = Array.from({ length: n }, (_, i) => addMonthsToKey(period, i - n + 1));
  const at = new Map(months.map((m, i) => [m, i]));
  const income = months.map(() => 0), expenses = months.map(() => 0);
  const byGroup = new Map<string, number[]>();
  const cat = new Map<string, { group: string; now: number; prev: number }>();
  const prevMonth = months[n - 2];
  let toGoals = 0, fromGoals = 0;
  const biggest: MonthReview["biggest"] = [];

  for (const t of b.tx) {
    const i = at.get(t.month);
    if (i === undefined) continue;
    if (t.type === "Income") income[i] += t.amount;
    if (t.type === "Transfer" && t.month === period) {
      if (t.toAccount.startsWith(GOAL) && !t.account.startsWith(GOAL)) toGoals += t.amount;
      if (t.account.startsWith(GOAL) && !t.toAccount.startsWith(GOAL)) fromGoals += t.amount;
    }
    if (t.type !== "Expense") continue;
    expenses[i] += t.amount;
    const g = byGroup.get(t.group) ?? months.map(() => 0);
    g[i] += t.amount;
    byGroup.set(t.group, g);
    if (t.month === period || t.month === prevMonth) {
      const c = cat.get(t.category) ?? { group: t.group, now: 0, prev: 0 };
      if (t.month === period) c.now += t.amount; else c.prev += t.amount;
      cat.set(t.category, c);
    }
    if (t.month === period) biggest.push({ date: t.date, category: t.category, note: t.note, amount: t.amount });
  }

  const groups = [...byGroup.entries()].map(([group, ms]) => {
    const r = ms.map(round2);
    const before = r.slice(0, -1);
    return { group, months: r, now: r[n - 1], prev: r[n - 2] ?? 0, avg: round2(before.reduce((a, x) => a + x, 0) / Math.max(before.length, 1)) };
  }).filter((g) => g.months.some((x) => x > 0)).sort((a, z) => z.now - a.now || z.avg - a.avg);

  const changes = [...cat.entries()].map(([category, c]) => ({
    category, group: c.group, now: round2(c.now), prev: round2(c.prev), diff: round2(c.now - c.prev),
  })).filter((c) => Math.abs(c.diff) >= 0.01);

  return {
    period, months, income: income.map(round2), expenses: expenses.map(round2), groups,
    ups: changes.filter((c) => c.diff > 0).sort((a, z) => z.diff - a.diff).slice(0, 5),
    downs: changes.filter((c) => c.diff < 0).sort((a, z) => a.diff - z.diff).slice(0, 5),
    toGoals: round2(toGoals), fromGoals: round2(fromGoals),
    biggest: biggest.sort((a, z) => z.amount - a.amount).slice(0, 5),
  };
}
