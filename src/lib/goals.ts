import "server-only";
import { toISO, type ISODate } from "./dates";
import { prisma } from "./db";

/** A savings goal is its own account: what's in it is everything moved in, less everything taken out. It uses the
 * Python app's goals and goal_contributions tables, so both apps show the same goals. */
export type Goal = { id: number; name: string; targetAmount: number; currentAmount: number; targetDate: ISODate | null };
export type GoalMove = { id: number; date: ISODate; goal: string; amount: number; note: string };

/** How a goal shows up as the other side of a transfer in the transactions list. */
export const goalAccount = (name: string) => `Goal: ${name}`.slice(0, 50);

export async function loadGoals(): Promise<Goal[]> {
  const [goals, sums] = await Promise.all([
    prisma.goal.findMany({ orderBy: { id: "asc" } }),
    prisma.goalContribution.groupBy({ by: ["goalId"], _sum: { amount: true } }),
  ]);
  const saved = new Map(sums.map((s) => [s.goalId, Number(s._sum.amount ?? 0)]));
  return goals.map((g) => ({ id: g.id, name: g.name, targetAmount: Number(g.target),
    currentAmount: Math.round((saved.get(g.id) ?? 0) * 100) / 100, targetDate: toISO(g.deadline) }));
}

export async function recentMoves(limit = 10): Promise<GoalMove[]> {
  const rows = await prisma.goalContribution.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: limit,
    include: { goal: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, date: toISO(r.date), goal: r.goal.name, amount: Number(r.amount), note: r.note ?? "" }));
}
