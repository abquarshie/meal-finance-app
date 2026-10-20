"use server";
import { z } from "zod";
import { attempt, fail, hasKitchen, kind, name50, ok, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { prisma, type Tx } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { entries } from "@/lib/words";

const money = z.number().finite().min(-99_999_999).max(99_999_999);
const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

// ---- accounts --------------------------------------------------------------------------------------------------
export async function addAccount(name: string, opening: number, spendable: boolean): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = name50.parse(name);
    const book = await loadBook();
    if (lower(book.accountNames).includes(n.toLowerCase())) return fail(`'${n}' already exists.`);
    await prisma.account.create({ data: { name: n, openingBalance: money.parse(opening), spendable: Boolean(spendable) } });
    return ok(`Added the account '${n}'`);
  });
}

/** Renaming an account renames it everywhere it's stored: entries, auto transactions and kitchen shopping trips. */
export async function editAccount(old: string, name: string, opening: number, spendable: boolean): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = name50.parse(name);
    const book = await loadBook();
    if (!book.accountNames.includes(old)) return fail("That account no longer exists.");
    if (lower(book.accountNames.filter((a) => a !== old)).includes(n.toLowerCase())) return fail(`'${n}' already exists.`);
    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { name: old }, data: { name: n, openingBalance: money.parse(opening),
        spendable: Boolean(spendable) } });
      if (n !== old) {
        await tx.transaction.updateMany({ where: { account: old }, data: { account: n } });
        await tx.transaction.updateMany({ where: { toAccount: old }, data: { toAccount: n } });
        await tx.recurringRule.updateMany({ where: { account: old }, data: { account: n } });
        await tx.recurringRule.updateMany({ where: { toAccount: old }, data: { toAccount: n } });
        if (await hasKitchen(tx)) await tx.$executeRaw`UPDATE meals.trips SET account = ${n} WHERE account = ${old}`;
      }
    });
    return ok(`Saved '${n}'`);
  });
}

/** Only an account nothing uses can go. */
export async function deleteAccount(name: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const [tx, rules] = await Promise.all([
      prisma.transaction.count({ where: { OR: [{ account: name }, { toAccount: name }] } }),
      prisma.recurringRule.count({ where: { OR: [{ account: name }, { toAccount: name }] } }),
    ]);
    if (tx || rules) return fail(`'${name}' is still used, so it can't be deleted. You can rename it instead.`);
    await prisma.account.delete({ where: { name } });
    return ok(`Deleted '${name}'`);
  });
}

/** Older income and expense entries with no account, all put into one, so balances add up. */
export async function assignOlder(account: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const book = await loadBook();
    if (!book.accountNames.includes(account)) return fail("Pick one of your accounts.");
    const { count } = await prisma.transaction.updateMany({
      where: { OR: [{ account: null }, { account: "" }], type: { not: "Transfer" } }, data: { account } });
    return ok(`Assigned ${entries(count)} to ${account}`);
  });
}

// ---- categories ------------------------------------------------------------------------------------------------
// A budget is set on a group or a category by name, so a category can't share its name with another group.
async function groupClash(category: string, group: string): Promise<boolean> {
  const book = await loadBook();
  const other = book.groups.find((g) => g.toLowerCase() === category.trim().toLowerCase());
  return other !== undefined && other.toLowerCase() !== group.trim().toLowerCase();
}

export async function addCategory(name: string, group: string, newKind: string | null): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = name50.parse(name);
    const g = z.string().trim().min(1, "Pick a group.").max(60).parse(group);
    const book = await loadBook();
    if (lower(book.categoryNames()).includes(n.toLowerCase())) return fail(`'${n}' already exists.`);
    if (await groupClash(n, g)) return fail(`'${n}' is the name of a group, so a budget couldn't tell them apart.`);
    const existing = book.categories.find((c) => c.groupName === g);
    const k = existing ? existing.kind : kind.parse(newKind);
    if (!existing && lower(book.categoryNames()).includes(g.toLowerCase()) && g.toLowerCase() !== n.toLowerCase()) {
      return fail(`'${g}' is already a category name. Pick another group name.`);
    }
    await prisma.category.create({ data: { name: n, groupName: g, kind: k } });
    return ok(`Added '${n}' to ${g}`);
  });
}

/** Moves a category's budget to its new name unless that name already has one. */
async function moveBudget(tx: Tx, from: string, to: string) {
  await tx.$executeRaw`UPDATE budgets SET category = ${to} WHERE category = ${from}
    AND NOT EXISTS (SELECT 1 FROM budgets WHERE category = ${to})`;
}

/** Renaming a category renames past entries, auto transactions, kitchen items and bought dishes too. */
export async function editCategory(old: string, name: string, group: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = name50.parse(name);
    const book = await loadBook();
    const cat = book.categories.find((c) => c.name === old);
    if (!cat) return fail("That category no longer exists.");
    if (!book.groups.includes(group)) return fail("Pick one of your groups.");
    if (lower(book.categoryNames().filter((c) => c !== old)).includes(n.toLowerCase())) return fail(`'${n}' already exists.`);
    if (n !== old && (await groupClash(n, group))) return fail(`'${n}' is the name of a group, so a budget couldn't tell them apart.`);
    const k = book.categories.find((c) => c.groupName === group)?.kind ?? cat.kind;
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { name: old }, data: { name: n, groupName: group, kind: k } });
      if (n !== old) {
        await tx.transaction.updateMany({ where: { category: old }, data: { category: n } });
        await tx.recurringRule.updateMany({ where: { category: old }, data: { category: n } });
        if (await hasKitchen(tx)) {
          await tx.$executeRaw`UPDATE meals.ingredients SET category = ${n} WHERE category = ${old}`;
          await tx.$executeRaw`UPDATE meals.recipes SET category = ${n} WHERE category = ${old}`;
        }
        await moveBudget(tx, old, n);
      }
    });
    return ok(`Saved '${n}'`);
  });
}

export async function renameGroup(old: string, name: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = z.string().trim().min(1, "The name can't be empty.").max(60).parse(name);
    const book = await loadBook();
    if (n !== old && lower(book.groups).includes(n.toLowerCase())) return fail(`A group called '${n}' already exists.`);
    const outside = lower(book.categories.filter((c) => c.groupName !== old).map((c) => c.name));
    if (n !== old && outside.includes(n.toLowerCase())) {
      return fail(`'${n}' is a category in another group, so a budget couldn't tell them apart.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.category.updateMany({ where: { groupName: old }, data: { groupName: n } });
      await moveBudget(tx, old, n);
    });
    return ok(`Renamed the group to '${n}'`);
  });
}

/** What would carry on using a category after it was deleted. Past entries aren't counted: they keep the name. */
export async function categoryUses(name: string): Promise<Record<string, number>> {
  await requireUser();
  const [rules, budgets] = await Promise.all([
    prisma.recurringRule.count({ where: { category: name } }), prisma.budget.count({ where: { category: name } })]);
  let items = 0;
  let dishes = 0;
  if (await hasKitchen()) {
    const r = await prisma.$queryRaw<{ i: bigint; d: bigint }[]>`SELECT
      (SELECT count(*) FROM meals.ingredients WHERE category = ${name}) AS i,
      (SELECT count(*) FROM meals.recipes WHERE category = ${name}) AS d`;
    items = Number(r[0].i);
    dishes = Number(r[0].d);
  }
  const all: Record<string, number> = { "auto transactions": rules, budgets, "kitchen items": items, "bought dishes": dishes };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v));
}

/** Anything that would keep using it moves to `moveTo`; its budget moves too unless `moveTo` already has one. */
export async function deleteCategory(name: string, moveTo: string | null): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const uses = await categoryUses(name);
    const book = await loadBook();
    if (Object.keys(uses).length && !moveTo) return fail("Pick where the things that use it go instead.");
    if (moveTo && (moveTo === name || book.kindOf.get(moveTo) !== book.kindOf.get(name))) {
      return fail("Pick another category of the same type.");
    }
    await prisma.$transaction(async (tx) => {
      if (moveTo) {
        await tx.recurringRule.updateMany({ where: { category: name }, data: { category: moveTo } });
        if (await hasKitchen(tx)) {
          await tx.$executeRaw`UPDATE meals.ingredients SET category = ${moveTo} WHERE category = ${name}`;
          await tx.$executeRaw`UPDATE meals.recipes SET category = ${moveTo} WHERE category = ${name}`;
        }
        await moveBudget(tx, name, moveTo);
      }
      await tx.budget.deleteMany({ where: { category: name } });
      await tx.category.delete({ where: { name } });
    });
    return ok(`Deleted '${name}'`);
  });
}

/** For entries made before a category existed, like an old "Food & Dining". */
export async function movePastEntries(from: string, to: string): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    if (from === to) return fail("Pick two different categories.");
    const book = await loadBook();
    if (!book.kindOf.has(to)) return fail("Pick one of your categories to move them to.");
    const { count } = await prisma.transaction.updateMany({ where: { category: from }, data: { category: to } });
    return ok(`Moved ${entries(count)} to '${to}'`);
  });
}
