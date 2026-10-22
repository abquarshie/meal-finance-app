"use server";
import { z } from "zod";
import { amount, attempt, fail, isoDate, ok, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { fromISO, today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { goalAccount } from "@/lib/goals";
import { loadBook } from "@/lib/load";
import { money, SHARED } from "@/lib/money";

const id = z.number().int().positive();
const goalName = z.string().trim().min(1, "Give the goal a name.").max(80, "Use 80 characters or fewer.");

export async function createGoal(name: string, target: number, targetDate: string | null): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = goalName.parse(name);
    const t = amount.parse(target);
    const d = targetDate ? isoDate.parse(targetDate) : null;
    if (d && d <= today()) return fail("Pick a target date after today, or leave it empty.");
    const taken = await prisma.goal.findFirst({ where: { name: { equals: n, mode: "insensitive" } } });
    if (taken) return fail(`You already have a goal called '${taken.name}'.`);
    await prisma.goal.create({ data: { name: n, target: t, deadline: d ? fromISO(d) : null } });
    return ok(`Created the goal '${n}'`);
  });
}

/** Moves money between one of your accounts and a goal, in one step: the account's balance changes by a transfer
 * (so income and expenses stay the same) and the goal's balance changes by the same amount. */
export async function moveGoalMoney(goalId: number, account: string, value: number, direction: "in" | "out"): Promise<Result> {
  const user = await requireUser();
  return attempt(async () => {
    const a = amount.parse(value);
    const dir = z.enum(["in", "out"]).parse(direction);
    const book = await loadBook();
    if (!book.accountNames.includes(account)) return fail("Pick one of your accounts.");
    const category = book.categoryNames("Transfer")[0] ?? "Transfer";
    const now = fromISO(today());
    return prisma.$transaction(async (tx) => {
      const g = await tx.goal.findUnique({ where: { id: id.parse(goalId) } });
      if (!g) return fail("That goal no longer exists.");
      await tx.$queryRaw`SELECT id FROM goals WHERE id = ${g.id} FOR UPDATE`; // two people taking out at once can't overdraw it
      const sum = await tx.goalContribution.aggregate({ where: { goalId: g.id }, _sum: { amount: true } });
      const inGoal = Number(sum._sum.amount ?? 0);
      if (dir === "out" && a > inGoal + 1e-9) return fail(`${g.name} only has ${money(inGoal)} in it.`);
      const [from, to] = dir === "in" ? [account, goalAccount(g.name)] : [goalAccount(g.name), account];
      await tx.transaction.create({ data: { date: now, type: "Transfer", category, amount: a, note: `Goal · ${g.name}`,
        member: SHARED, account: from, toAccount: to, createdBy: user.username } });
      await tx.goalContribution.create({ data: { goalId: g.id, date: now, amount: dir === "in" ? a : -a,
        note: dir === "in" ? `From ${account}` : `To ${account}`, createdBy: user.username } });
      return ok(dir === "in" ? `Moved ${money(a)} from ${account} to ${g.name}` : `Moved ${money(a)} from ${g.name} to ${account}`);
    });
  });
}

/** Only an empty goal can go, so no money ever disappears with it. */
export async function deleteGoal(goalId: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const g = await prisma.goal.findUnique({ where: { id: id.parse(goalId) } });
    if (!g) return fail("That goal no longer exists.");
    const sum = await prisma.goalContribution.aggregate({ where: { goalId: g.id }, _sum: { amount: true } });
    const left = Number(sum._sum.amount ?? 0);
    if (Math.abs(left) >= 0.005) return fail(`Move the ${money(left)} in ${g.name} back to an account first.`);
    await prisma.goal.delete({ where: { id: g.id } });
    return ok(`Deleted the goal '${g.name}'`);
  });
}
