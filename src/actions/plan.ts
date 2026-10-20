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
