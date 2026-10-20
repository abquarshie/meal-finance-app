import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Book, Tx } from "./book";
import { fromISO, monthEnd, monthOf, today, toISO } from "./dates";
import { prisma } from "./db";
import { AUTO_PREFIX, FEE_PREFIX, KINDS, SHARED, type Kind } from "./money";

export type TxFilter = { month: string; kinds: Kind[]; q: string };

/** The filters from the address: ?month=2026-10&type=Expense,Income&q=makola */
export function readFilter(b: Book, sp: { month?: string; type?: string; q?: string }): TxFilter {
  const months = b.months();
  const now = monthOf(today());
  const month = sp.month === "all" || (sp.month && months.includes(sp.month)) ? sp.month : now;
  const kinds = (sp.type ?? "").split(",").filter((k): k is Kind => (KINDS as readonly string[]).includes(k));
  return { month, kinds, q: (sp.q ?? "").trim().slice(0, 100) };
}

/** The filter as a database condition, so only the matching rows are read. The search looks in notes, categories,
 * groups and people, like the list always has. */
function where(b: Book, f: TxFilter): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];
  if (f.month !== "all") and.push({ date: { gte: fromISO(`${f.month}-01`), lte: fromISO(monthEnd(f.month)) } });
  if (f.kinds.length) and.push({ type: { in: f.kinds } });
  if (f.q) {
    const q = f.q.toLowerCase();
    const inGroup = b.categories.filter((c) => c.groupName.toLowerCase().includes(q)).map((c) => c.name);
    const or: Prisma.TransactionWhereInput[] = [
      { note: { contains: f.q, mode: "insensitive" } },
      { category: { contains: f.q, mode: "insensitive" } },
      { member: { contains: f.q, mode: "insensitive" } },
    ];
    if (inGroup.length) or.push({ category: { in: inGroup } });
    if (SHARED.toLowerCase().includes(q)) or.push({ member: null }, { member: "" });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

function toTx(b: Book, t: Awaited<ReturnType<typeof prisma.transaction.findMany>>[number]): Tx {
  const date = toISO(t.date);
  const note = t.note ?? "";
  return { id: t.id, date, type: t.type as Kind, category: t.category, amount: Number(t.amount), note,
    member: t.member || SHARED, account: t.account ?? "", toAccount: t.toAccount ?? "", createdBy: t.createdBy ?? "",
    month: monthOf(date), group: b.groupOf.get(t.category) ?? t.category, isAuto: note.startsWith(AUTO_PREFIX),
    isFee: note.startsWith(FEE_PREFIX) };
}

/** The matching entries, newest first (at most `limit`), with how many match and what came in and went out. */
export async function findTransactions(b: Book, f: TxFilter, limit?: number) {
  const w = where(b, f);
  const [rows, totals] = await Promise.all([
    prisma.transaction.findMany({ where: w, orderBy: [{ date: "desc" }, { id: "desc" }], take: limit }),
    prisma.transaction.groupBy({ by: ["type"], where: w, _sum: { amount: true }, _count: true }),
  ]);
  const sum = (k: Kind) => Number(totals.find((t) => t.type === k)?._sum.amount ?? 0);
  return { rows: rows.map((t) => toTx(b, t)), count: totals.reduce((a, t) => a + t._count, 0),
    income: sum("Income"), expenses: sum("Expense") };
}

