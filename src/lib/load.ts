import "server-only";
import { cache } from "react";
import { Book, type BookData } from "./book";
import { fromISO, today, toISO, type ISODate } from "./dates";
import { prisma } from "./db";
import { FEE_CATEGORY, SHARED, type Kind } from "./money";
import { occurrence } from "./rules";

const n = (x: unknown) => (x === null || x === undefined ? 0 : Number(x));
const s = (x: string | null | undefined) => x ?? "";

/** All the family's money data, read once per request and shared by every component that asks (the layout and the
 * page render at the same time). Any auto transactions that are due are added first, so every figure includes them. */
export const loadBook = cache(async (): Promise<Book> => {
  try {
    const due = await prisma.recurringRule.count({ where: { active: true, nextDate: { lte: fromISO(today()) } } });
    if (due) await applyDueRules();
  } catch (e) {
    console.error("Auto transactions couldn't run", e); // never block the whole app because of an auto rule
  }
  return readBook();
});

export async function readBook(): Promise<Book> {
  const [tx, categories, accounts, budgets, rules, goals, saved, contributions, users, meta] = await Promise.all([
    prisma.transaction.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }] }),
    prisma.category.findMany({ orderBy: { id: "asc" } }),
    prisma.account.findMany({ orderBy: { id: "asc" } }),
    prisma.budget.findMany({ orderBy: { category: "asc" } }),
    prisma.recurringRule.findMany({ orderBy: { id: "asc" } }),
    prisma.goal.findMany({ orderBy: { id: "asc" } }),
    prisma.goalContribution.groupBy({ by: ["goalId"], _sum: { amount: true } }),
    prisma.goalContribution.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: 200, include: { goal: true } }),
    prisma.user.findMany({ orderBy: { id: "asc" } }),
    prisma.appMeta.findMany({ where: { key: { startsWith: "feature_" } } }),
  ]);
  const savedBy = new Map(saved.map((r) => [r.goalId, n(r._sum.amount)]));
  const data: BookData = {
    tx: tx.map((t) => ({ id: t.id, date: toISO(t.date), type: t.type as Kind, category: t.category, amount: n(t.amount),
      note: s(t.note), member: s(t.member), account: s(t.account), toAccount: s(t.toAccount), createdBy: s(t.createdBy) })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName, kind: c.kind as Kind })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, openingBalance: n(a.openingBalance),
      spendable: a.spendable ?? true })),
    budgets: budgets.map((b) => ({ category: b.category, monthlyLimit: n(b.monthlyLimit) })),
    rules: rules.map((r) => ({ id: r.id, name: r.name, type: r.type as Kind, amount: n(r.amount),
      fee: r.fee === null ? null : n(r.fee), category: r.category, account: r.account, toAccount: s(r.toAccount),
      member: s(r.member), note: s(r.note), frequency: r.frequency, startDate: toISO(r.startDate),
      nextDate: toISO(r.nextDate), runCount: r.runCount, endDate: toISO(r.endDate), active: r.active,
      lastRun: toISO(r.lastRun) })),
    goals: goals.map((g) => ({ id: g.id, name: g.name, target: n(g.target), deadline: toISO(g.deadline),
      saved: savedBy.get(g.id) ?? 0 })),
    contributions: contributions.map((c) => ({ id: c.id, date: toISO(c.date), goalId: c.goalId, goal: c.goal.name,
      amount: n(c.amount), note: s(c.note), createdBy: s(c.createdBy) })),
    users: users.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, isOwner: u.isOwner,
      lastLogin: u.lastLogin?.toISOString() ?? null, createdAt: u.createdAt.toISOString() })),
    features: Object.fromEntries(meta.map((m) => [m.key, m.value ?? ""])),
  };
  return new Book(data);
}

type DueRule = {
  id: number; name: string; type: string; amount: string; fee: string | null; category: string; account: string;
  to_account: string | null; member: string | null; note: string | null; frequency: string; start_date: Date;
  run_count: number; end_date: Date | null;
};

/** Add every auto transaction that is due; returns how many were added. Like auto_rules.apply_recurring_rules:
 * due rules are locked while they're processed (FOR UPDATE SKIP LOCKED), so this app, the Python app and the daily
 * GitHub job can all run it at once and the same entry is never added twice. */
export async function applyDueRules(now: ISODate = today()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<DueRule[]>`
      SELECT id, name, type, amount::text, fee::text, category, account, to_account, member, note,
             frequency, start_date, run_count, end_date
      FROM recurring_rules WHERE active AND next_date <= ${fromISO(now)}::date
      FOR UPDATE SKIP LOCKED`;
    let created = 0;
    for (const r of due) {
      const start = toISO(r.start_date);
      const end = toISO(r.end_date);
      let runs = r.run_count;
      let next = occurrence(start, r.frequency, runs);
      let guard = 0;
      while (next <= now && (end === null || next <= end) && guard < 400) {
        await tx.transaction.create({ data: {
          date: fromISO(next), type: r.type, category: r.category, amount: r.amount,
          note: `Auto · ${r.name}` + (r.note ? ` · ${r.note}` : ""), member: r.member || SHARED, account: r.account,
          toAccount: r.to_account } });
        created += 1;
        if (r.type === "Transfer" && r.fee !== null && Number(r.fee) > 0) {
          await tx.transaction.create({ data: {
            date: fromISO(next), type: "Expense", category: FEE_CATEGORY, amount: r.fee, note: `Fee · ${r.name}`,
            member: SHARED, account: r.account, toAccount: null } });
        }
        runs += 1;
        guard += 1;
        next = occurrence(start, r.frequency, runs);
      }
      await tx.recurringRule.update({ where: { id: r.id }, data: {
        runCount: runs, nextDate: fromISO(next), active: end === null || next <= end, lastRun: fromISO(now) } });
    }
    return created;
  }, { timeout: 30_000 });
}
