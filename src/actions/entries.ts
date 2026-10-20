"use server";
import { z } from "zod";
import { amount, attempt, fail, isoDate, kind, ok, optionalMoney, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { budgetAlerts } from "@/lib/book";
import { dayMonth, fromISO, monthOf, TIME_ZONE, today, toISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { AUTO_PREFIX, FEE_CATEGORY, FEE_PREFIX, money, SHARED, KINDS } from "@/lib/money";

const Entry = z.object({
  kind, amount, fee: optionalMoney, date: isoDate,
  category: z.string().trim().min(1, "Pick a category.").max(50),
  account: z.string().trim().min(1, "Pick an account.").max(50),
  to: z.string().trim().max(50).nullable(),
  who: z.string().trim().max(50).default(SHARED),
  note: z.string().trim().max(500).default(""),
  momoId: z.string().trim().max(40).nullable().default(null),
  confirmed: z.boolean().default(false),
});
export type EntryInput = z.input<typeof Entry>;
export type EntryResult = Result<{ alerts: string[] }> | { ok: false; duplicate: string };

function timeIn(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Something that looks like this entry, already saved by anyone in the family. */
async function findDuplicate(e: z.output<typeof Entry>, me: string): Promise<string | null> {
  const book = await loadBook();
  const who = (u: string | null) => (!u ? "Someone" : u === me ? "You" : book.nameOfUser.get(u) ?? u);
  if (e.momoId) {
    const row = await prisma.transaction.findFirst({ where: { note: { contains: `MoMo ID ${e.momoId}` } },
      orderBy: { id: "desc" } });
    if (row) return `This MoMo payment is already saved (${who(row.createdBy)} added it for ${dayMonth(toISO(row.date))}). Save it again?`;
  }
  const row = await prisma.transaction.findFirst({
    where: { type: e.kind, category: e.category, amount: e.amount,
      OR: [{ createdAt: { gt: new Date(Date.now() - 86_400_000) } }, { date: fromISO(e.date) }] },
    orderBy: { id: "desc" },
  });
  if (!row) return null;
  let at = `for ${dayMonth(toISO(row.date))}`;
  if (row.createdAt) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(row.createdAt);
    at = day === today() ? `today at ${timeIn(row.createdAt)}` : `on ${dayMonth(day)} at ${timeIn(row.createdAt)}`;
  }
  return `${who(row.createdBy)} already added ${money(e.amount)} for ${e.category} ${at}. Save another one?`;
}

/** Saves one entry (and its fee as a separate Charges expense). Asks first if it looks like a double entry. */
export async function addEntry(input: EntryInput): Promise<EntryResult> {
  const user = await requireUser();
  return attempt<{ alerts: string[] }>(async () => {
    const e = Entry.parse(input);
    const book = await loadBook(monthOf(e.date)); // that month's spending, for the budget alerts
    if (!book.accountNames.includes(e.account)) return fail("Pick one of your accounts.");
    if (!book.kindOf.has(e.category)) return fail("Pick one of your categories.");
    if (e.kind === "Transfer") {
      if (!e.to || !book.accountNames.includes(e.to)) return fail("Pick the account the money goes into.");
      if (e.to === e.account) return fail("Pick two different accounts.");
    }
    if (!e.confirmed) {
      const dup = await findDuplicate(e, user.username).catch(() => null); // never block saving over the check
      if (dup) return { ok: false, duplicate: dup } as never;
    }
    const who = e.kind === "Transfer" ? SHARED : e.who || SHARED;
    const note = e.momoId ? (e.note ? `${e.note} · MoMo ID ${e.momoId}` : `MoMo ID ${e.momoId}`) : e.note;
    const to = e.kind === "Transfer" ? e.to : null;
    const alerts = budgetAlerts(book, e.kind, e.category, e.amount, e.date, money);
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({ data: { date: fromISO(e.date), type: e.kind, category: e.category, amount: e.amount,
        note, member: who, account: e.account, toAccount: to, createdBy: user.username } });
      if (e.fee && e.fee > 0) {
        await tx.transaction.create({ data: { date: fromISO(e.date), type: "Expense", category: FEE_CATEGORY,
          amount: e.fee, note: e.kind === "Transfer" ? `Fee · ${e.account} to ${e.to}` : `Fee · ${e.category}`,
          member: SHARED, account: e.account, toAccount: null, createdBy: user.username } });
      }
    });
    const extra = e.fee && e.fee > 0 ? ` plus ${money(e.fee)} fee` : "";
    const message = e.kind === "Transfer"
      ? `Moved ${money(e.amount)} from ${e.account} to ${e.to}${extra}`
      : `Saved ${money(e.amount)} ${e.kind.toLowerCase()} to ${e.category}${extra}`;
    return ok(message, { alerts });
  }) as Promise<EntryResult>;
}

const Edit = z.object({
  id: z.number().int().positive(), date: isoDate, type: kind,
  category: z.string().trim().min(1, "Pick a category.").max(50), amount,
  account: z.string().trim().max(50), toAccount: z.string().trim().max(50),
  member: z.string().trim().max(50), note: z.string().trim().max(500),
});
export type EditInput = z.input<typeof Edit>;

/** Changes one saved entry. */
export async function updateTransaction(input: EditInput): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const e = Edit.parse(input);
    if (e.type === "Transfer") {
      if (!e.account || !e.toAccount) return fail("A transfer needs both a from and a to account.");
      if (e.account === e.toAccount) return fail("A transfer needs two different accounts.");
    }
    await prisma.transaction.update({ where: { id: e.id }, data: {
      date: fromISO(e.date), type: e.type, category: e.category, amount: e.amount, note: e.note,
      member: e.member || SHARED, account: e.account || null, toAccount: e.type === "Transfer" ? e.toAccount : null } });
    return ok("Saved the change");
  });
}

export type DeletedRow = {
  id: number; date: string; type: string; category: string; amount: string; note: string | null; member: string | null;
  account: string | null; toAccount: string | null; createdBy: string | null; createdAt: string | null;
};

/** Deletes entries and hands them back, so the page can offer Undo. */
export async function deleteTransactions(ids: number[]): Promise<Result<{ rows: DeletedRow[] }>> {
  await requireUser();
  return attempt(async () => {
    const clean = z.array(z.number().int().positive()).min(1).max(500).parse(ids);
    const rows = await prisma.$transaction(async (tx) => {
      const found = await tx.transaction.findMany({ where: { id: { in: clean } } });
      await tx.transaction.deleteMany({ where: { id: { in: clean } } });
      return found;
    });
    const n = rows.length;
    return ok(`Deleted ${n} transaction${n === 1 ? "" : "s"}`, { rows: rows.map((r) => ({
      id: r.id, date: toISO(r.date), type: r.type, category: r.category, amount: r.amount.toString(), note: r.note,
      member: r.member, account: r.account, toAccount: r.toAccount, createdBy: r.createdBy,
      createdAt: r.createdAt?.toISOString() ?? null })) });
  });
}

const Restored = z.array(z.object({
  id: z.number().int().positive(), date: isoDate, type: z.enum(KINDS), category: z.string().max(50),
  amount: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/), note: z.string().max(500).nullable(), member: z.string().max(50).nullable(),
  account: z.string().max(50).nullable(), toAccount: z.string().max(50).nullable(), createdBy: z.string().max(30).nullable(),
  createdAt: z.string().nullable(),
})).max(500);

/** Puts deleted entries back, with their old ids. */
export async function restoreTransactions(rows: DeletedRow[]): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const clean = Restored.parse(rows);
    const { count } = await prisma.transaction.createMany({ skipDuplicates: true, data: clean.map((r) => ({
      ...r, date: fromISO(r.date), createdAt: r.createdAt ? new Date(r.createdAt) : null })) });
    return ok(`Restored ${count} transaction${count === 1 ? "" : "s"}`);
  });
}

/** The category used last time for this person or shop, for a pasted MoMo text. */
export async function categoryFor(kindName: string, party: string): Promise<string | null> {
  await requireUser();
  if (!party || !KINDS.includes(kindName as never)) return null;
  const [book, hit] = await Promise.all([loadBook(), prisma.transaction.findFirst({
    where: { type: kindName, note: { contains: party, mode: "insensitive" },
      NOT: [{ note: { startsWith: AUTO_PREFIX } }, { note: { startsWith: FEE_PREFIX } }] },
    orderBy: [{ date: "desc" }, { id: "desc" }], select: { category: true } })]);
  const names = book.categoryNames(kindName as (typeof KINDS)[number]);
  return hit && names.includes(hit.category) ? hit.category : null;
}
