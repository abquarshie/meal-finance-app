import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { Book, type BookData, type Summary } from "./book";
import { addDays, addMonthsToKey, fromISO, monthEnd, monthOf, today, toISO, type ISODate, type MonthKey } from "./dates";
import { prisma } from "./db";
import { FEE_CATEGORY, SHARED, type Kind } from "./money";
import { occurrence } from "./rules";

const n = (x: unknown) => (x === null || x === undefined ? 0 : Number(x));
const s = (x: string | null | undefined) => x ?? "";

/** How far back transactions are read for the everyday screens: this month and last month (for the comparison on
 * Home) and the last 90 days (for the smart defaults when adding an entry). Balances, the list of months and the
 * people are added up by the database over the whole history, so nothing older needs to be read. */
export function windowStart(now: ISODate = today()): ISODate {
  const lastMonth = `${addMonthsToKey(monthOf(now), -1)}-01`;
  const ninety = addDays(now, -90);
  return lastMonth < ninety ? lastMonth : ninety;
}

/** All the family's money data the screens need, read once per request and shared by every component that asks
 * (the layout and the page render at the same time). Any auto transactions that are due are added first, so every
 * figure includes them. Pass a month older than the usual window to read that month (and the one before) too. */
export const loadBook = cache(async (month?: MonthKey): Promise<Book> => {
  try {
    const due = await prisma.recurringRule.count({ where: { active: true, nextDate: { lte: fromISO(today()) } } });
    if (due) await applyDueRules();
  } catch (e) {
    console.error("Auto transactions couldn't run", e); // never block the whole app because of an auto rule
  }
  return readBook({ month });
});

type ReadOptions = {
  since?: ISODate | null; // null reads every transaction (the parity tests); the default is windowStart()
  month?: MonthKey; // also read this month and the one before, when they're older than `since`
};

export async function readBook({ since = windowStart(), month }: ReadOptions = {}): Promise<Book> {
  const ranges: Prisma.TransactionWhereInput[] = [];
  if (since !== null) ranges.push({ date: { gte: fromISO(since) } });
  if (since !== null && month && `${month}-01` < since) {
    ranges.push({ date: { gte: fromISO(`${addMonthsToKey(month, -1)}-01`), lte: fromISO(monthEnd(month)) } });
  }
  const [tx, categories, accounts, budgets, rules, users, meta, summary] = await Promise.all([
    prisma.transaction.findMany({ where: ranges.length ? { OR: ranges } : undefined, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    prisma.category.findMany({ orderBy: { id: "asc" } }),
    prisma.account.findMany({ orderBy: { id: "asc" } }),
    prisma.budget.findMany({ orderBy: { category: "asc" } }),
    prisma.recurringRule.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.user.findMany({ orderBy: { id: "asc" } }),
    prisma.appMeta.findMany({ where: { key: { startsWith: "feature_" } } }),
    since === null ? Promise.resolve(undefined) : readSummary(),
  ]);
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
    users: users.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, isOwner: u.isOwner,
      lastLogin: u.lastLogin?.toISOString() ?? null, createdAt: u.createdAt.toISOString() })),
    features: Object.fromEntries(meta.map((m) => [m.key, m.value ?? ""])),
    summary,
  };
  return new Book(data);
}

/** Balances, months, people and entries with no account over the whole history, in four small grouped queries. */
async function readSummary(): Promise<Summary> {
  const [flows, arrivals, months, members, unassigned] = await Promise.all([
    prisma.transaction.groupBy({ by: ["account", "type"], _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["toAccount"], where: { type: "Transfer" }, _sum: { amount: true } }),
    prisma.$queryRaw<{ m: string }[]>`SELECT DISTINCT to_char(date, 'YYYY-MM') AS m FROM transactions ORDER BY m DESC`,
    prisma.transaction.groupBy({ by: ["member"] }),
    prisma.transaction.count({ where: { type: { not: "Transfer" }, OR: [{ account: null }, { account: "" }] } }),
  ]);
  const balances: Record<string, number> = {};
  const add = (name: string | null, x: number) => {
    if (name) balances[name] = (balances[name] ?? 0) + x;
  };
  for (const f of flows) add(f.account, f.type === "Income" ? n(f._sum.amount) : -n(f._sum.amount));
  for (const a of arrivals) add(a.toAccount, n(a._sum.amount));
  return { balances, months: months.map((r) => r.m), members: [...new Set(members.map((r) => r.member || SHARED))], unassigned };
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
