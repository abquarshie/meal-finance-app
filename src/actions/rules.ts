"use server";
import { z } from "zod";
import { amount, attempt, fail, isoDate, kind, ok, optionalMoney, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { fromISO, today, toISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { FREQUENCIES, SHARED } from "@/lib/money";
import { catchUp, occurrence } from "@/lib/rules";

const NewRule = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80), kind, amount, fee: optionalMoney,
  category: z.string().trim().min(1, "Pick a category.").max(50), account: z.string().trim().min(1).max(50),
  to: z.string().trim().max(50).nullable(), member: z.string().trim().max(50).default(SHARED),
  frequency: z.enum(FREQUENCIES), start: isoDate, end: isoDate.nullable(), note: z.string().trim().max(500).default(""),
});
export type NewRuleInput = z.input<typeof NewRule>;

export async function createRule(input: NewRuleInput): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const r = NewRule.parse(input);
    const book = await loadBook();
    if (!book.accountNames.includes(r.account)) return fail("Pick one of your accounts.");
    if (r.kind === "Transfer" && (!r.to || r.to === r.account)) return fail("Pick a different account to move the money into.");
    if (r.end && r.end < r.start) return fail("The stop date is before the first run.");
    await prisma.recurringRule.create({ data: {
      name: r.name, type: r.kind, amount: r.amount, fee: r.kind === "Transfer" && r.fee ? r.fee : null,
      category: r.category, account: r.account, toAccount: r.kind === "Transfer" ? r.to : null,
      member: r.kind === "Transfer" ? SHARED : r.member || SHARED, note: r.note, frequency: r.frequency,
      startDate: fromISO(r.start), nextDate: fromISO(r.start), runCount: 0, endDate: r.end ? fromISO(r.end) : null,
      active: true } });
    return ok(`Created '${r.name}'`); // a past start date is filled in on the next page load, like the Python app
  });
}

function statusOf(r: { active: boolean; endDate: Date | null; nextDate: Date }) {
  if (r.active) return "Active";
  return r.endDate && r.nextDate > r.endDate ? "Finished" : "Paused";
}

const Change = z.object({ id: z.number().int().positive(), amount, fee: optionalMoney, end: isoDate.nullable() });

/** New amount, fee or stop date. Changes apply to future runs only. */
export async function updateRule(input: z.input<typeof Change>): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const c = Change.parse(input);
    const r = await prisma.recurringRule.findUnique({ where: { id: c.id } });
    if (!r) return fail("That auto transaction no longer exists.");
    const start = toISO(r.startDate);
    if (c.end && c.end < start) return fail("The stop date is before the first run.");
    let active = r.active;
    let runs = r.runCount;
    let next = toISO(r.nextDate);
    const now = today();
    const status = statusOf(r);
    if (status === "Finished" && (c.end === null || c.end >= now)) {
      // running again after it finished: carry on from today, not with every date it missed meanwhile
      runs = catchUp(start, r.frequency, runs, now);
      next = occurrence(start, r.frequency, runs);
      active = c.end === null || next <= c.end;
    } else if (status === "Finished" && c.end && next <= c.end) {
      active = true; // the end was moved to a date already past: fill in the runs up to it, as recorded
    } else if (c.end && next > c.end) {
      active = false;
    }
    await prisma.recurringRule.update({ where: { id: c.id }, data: {
      amount: c.amount, fee: r.type === "Transfer" && c.fee ? c.fee : null, endDate: c.end ? fromISO(c.end) : null,
      active, runCount: runs, nextDate: fromISO(next) } });
    return ok("Saved. Changes apply to future runs.");
  });
}

export async function pauseRule(id: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const r = await prisma.recurringRule.update({ where: { id: z.number().int().parse(id) }, data: { active: false } });
    return ok(`Paused '${r.name}'`);
  });
}

/** Skips the dates it was paused for, instead of adding them all at once. */
export async function resumeRule(id: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const r = await prisma.recurringRule.findUniqueOrThrow({ where: { id: z.number().int().parse(id) } });
    const start = toISO(r.startDate);
    const runs = catchUp(start, r.frequency, r.runCount, today());
    await prisma.recurringRule.update({ where: { id: r.id }, data: { active: true, runCount: runs,
      nextDate: fromISO(occurrence(start, r.frequency, runs)) } });
    return ok(`Resumed '${r.name}'`);
  });
}

/** Entries it already added stay in the transactions. */
export async function deleteRule(id: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const r = await prisma.recurringRule.delete({ where: { id: z.number().int().parse(id) } });
    return ok(`Deleted '${r.name}'`);
  });
}
