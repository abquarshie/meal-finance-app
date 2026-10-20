"use server";
import { z } from "zod";
import { amount, attempt, fail, isoDate, ok, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { fromISO, today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";

// ---- budgets ---------------------------------------------------------------------------------------------------
/** A monthly limit for a whole group (Food) or one category (Dining Out). Saving again replaces it. */
export async function setBudget(key: string, limit: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const k = z.string().trim().min(1).max(50).parse(key);
    const l = amount.parse(limit);
    const book = await loadBook();
    if (!book.groups.includes(k) && !book.kindOf.has(k)) return fail("Pick a group or a category.");
    await prisma.budget.upsert({ where: { category: k }, create: { category: k, monthlyLimit: l },
      update: { monthlyLimit: l } });
    return ok(`Budget for ${k} set to ${money(l)} a month`);
  });
}

export async function removeBudget(key: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    await prisma.budget.delete({ where: { category: z.string().parse(key) } });
    return ok(`Removed the budget for ${key}`);
  });
}

// ---- savings goals ---------------------------------------------------------------------------------------------
export async function createGoal(name: string, target: number, deadline: string | null): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = z.string().trim().min(1, "Give the goal a name.").max(80).parse(name);
    const t = amount.parse(target);
    const d = isoDate.nullable().parse(deadline);
    if (d && d <= today()) return fail("Pick a deadline after today, or leave it empty.");
    await prisma.goal.create({ data: { name: n, target: t, deadline: d ? fromISO(d) : null } });
    return ok(`Created the goal '${n}'`);
  });
}

/** Goal savings are tracked on their own: they don't change income or expenses. */
export async function addToGoal(goalId: number, value: number, date: string, note: string): Promise<Result> {
  const user = await requireUser();
  return attempt(async () => {
    const g = await prisma.goal.findUnique({ where: { id: z.number().int().parse(goalId) } });
    if (!g) return fail("That goal no longer exists.");
    const a = amount.parse(value);
    await prisma.goalContribution.create({ data: { goalId: g.id, date: fromISO(isoDate.parse(date)), amount: a,
      note: z.string().trim().max(500).parse(note), createdBy: user.username } });
    return ok(`Added ${money(a)} to ${g.name}`);
  });
}

export async function removeContribution(id: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    await prisma.goalContribution.delete({ where: { id: z.number().int().parse(id) } });
    return ok("Saving removed");
  });
}

/** Deletes the goal and every saving recorded for it. */
export async function deleteGoal(id: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const g = await prisma.goal.delete({ where: { id: z.number().int().parse(id) } });
    return ok(`Deleted '${g.name}'`);
  });
}
