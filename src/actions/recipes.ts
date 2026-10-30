"use server";
// The recipe book: ingredients, recipes, bought dishes, pairings, household supplies and the starter lists.
import { z } from "zod";
import { attempt, fail, ok, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureSuppliesCategory, loadCatalog, loadStarter, loadSupplies, SUPPLIES_CATEGORY } from "@/lib/kitchen/catalog";
import { ROLES } from "@/lib/kitchen/logic";
import { CONTAINERS, UNITS } from "@/lib/kitchen/units";

const id = z.number().int().positive();
const unit = z.enum(UNITS as [string, ...string[]]);
const qty = z.number().min(0).max(1e9);
const name = (max: number) => z.string().trim().min(1, "Give it a name.").max(max);

async function nameTaken(table: "ingredient" | "recipe" | "pairing", n: string, except?: number) {
  const rows = await (prisma[table] as any).findMany({ select: { id: true, name: true } }) as { id: number; name: string }[];
  return rows.some((r) => r.id !== except && r.name.toLowerCase() === n.trim().toLowerCase());
}

// ---- ingredients -----------------------------------------------------------------------------------------------
const Ingredient = z.object({
  name: name(60), unit, category: z.string().max(50).nullable(), lowLevel: qty.nullable(),
  packName: z.enum(CONTAINERS as [string, ...string[]]).nullable(), packSize: qty.nullable(), loose: z.boolean().default(false),
});

/** lowLevel and packSize are in the base unit (30 for a crate of eggs, 5000 for a 5 kg bag of rice). */
export async function addIngredient(input: z.input<typeof Ingredient>, kind: "food" | "household" = "food"): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const i = Ingredient.parse(input);
    if (await nameTaken("ingredient", i.name)) return fail(`${i.name} is already in your list.`);
    if (i.packName && (!i.packSize || i.packName === i.unit)) return fail("Say how much one purchase unit holds, in a different unit from the base.");
    await prisma.$transaction(async (tx) => {
      if (kind === "household") await ensureSuppliesCategory(tx);
      await tx.ingredient.create({ data: { name: i.name, unit: i.unit, category: i.category ?? (kind === "household" ? SUPPLIES_CATEGORY : null),
        lowLevel: i.lowLevel, packName: i.packName, packSize: i.packName ? i.packSize : null, loose: Boolean(i.packName && i.loose), kind } });
    });
    return ok(`Added ${i.name}`);
  });
}

export async function updateIngredients(rows: (z.input<typeof Ingredient> & { id: number })[]): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const list = z.array(Ingredient.extend({ id })).min(1).max(300).parse(rows);
    const all = await prisma.ingredient.findMany({ select: { id: true, name: true } });
    const names = new Map(all.map((r) => [r.id, r.name.toLowerCase()]));
    for (const r of list) names.set(r.id, r.name.toLowerCase());
    if (new Set(names.values()).size !== names.size) return fail("Each ingredient needs its own name.");
    const noSize = list.filter((r) => r.packName && !r.packSize).map((r) => r.name);
    if (noSize.length) return fail(`Say how much each purchase unit holds for: ${noSize.join(", ")}`);
    await prisma.$transaction(list.map((r) => prisma.ingredient.update({ where: { id: r.id }, data: { name: r.name, unit: r.unit,
      category: r.category, lowLevel: r.lowLevel, packName: r.packName, packSize: r.packName ? r.packSize : null,
      loose: Boolean(r.packName && r.loose) } })));
    return ok(`Saved ${list.length} ingredient${list.length === 1 ? "" : "s"}`);
  });
}

/** It comes off the plan where it hasn't been had yet and stays in the history (by name) where it has. Its stock
 * and prices go with it; a pairing left with fewer than two parts goes too. */
export async function deleteIngredient(ingredientId: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const i = await prisma.ingredient.findUnique({ where: { id: id.parse(ingredientId) } });
    if (!i) return fail("That item is already gone.");
    if (await prisma.recipeItem.count({ where: { ingredientId: i.id } })) return fail(`${i.name} is still used in a recipe.`);
    await prisma.$transaction([
      prisma.planEntry.deleteMany({ where: { ingredientId: i.id, status: "planned" } }),
      prisma.$executeRaw`UPDATE meals.plan SET label = COALESCE(label, ${i.name.slice(0, 80)}), ingredient_id = NULL WHERE ingredient_id = ${i.id}`,
      prisma.ingredient.delete({ where: { id: i.id } }),
      prisma.$executeRaw`DELETE FROM meals.pairings p WHERE (SELECT count(*) FROM meals.pairing_items i WHERE i.pairing_id = p.id) < 2`,
    ]);
    return ok(`Removed ${i.name}`);
  });
}

// ---- recipes ---------------------------------------------------------------------------------------------------
const RecipeIn = z.object({
  id: id.nullable(), name: name(80), portions: z.number().min(0.5).max(100), keepsDays: z.number().int().min(0).max(30),
  prepNote: z.string().trim().max(200).nullable(), prepHours: z.number().int().min(0).max(72).nullable(),
  method: z.string().trim().max(5000).nullable(), role: z.enum(Object.keys(ROLES) as [string, ...string[]]),
  lines: z.array(z.object({ ingredientId: id, qty: z.number().positive().max(1e6), unit })).min(1, "Add at least one ingredient.").max(80),
});

/** Create or update a recipe and replace its ingredient lines. */
export async function saveRecipe(input: z.input<typeof RecipeIn>): Promise<Result<{ id: number }>> {
  await requireUser();
  return attempt(async () => {
    const r = RecipeIn.parse(input);
    if (await nameTaken("recipe", r.name, r.id ?? undefined)) return fail("You already have a recipe with this name.");
    const fields = { name: r.name, portions: Math.round(r.portions * 100) / 100, keepsDays: r.keepsDays,
      prepNote: r.prepNote || null, prepHours: r.prepHours || null, method: r.method || null, role: r.role };
    const rid = await prisma.$transaction(async (tx) => {
      let recipeId = r.id;
      if (recipeId) {
        await tx.recipe.update({ where: { id: recipeId }, data: { ...fields, bought: false } });
        await tx.recipeItem.deleteMany({ where: { recipeId } });
      } else recipeId = (await tx.recipe.create({ data: fields })).id;
      await tx.recipeItem.createMany({ data: r.lines.map((l) => ({ recipeId: recipeId!, ingredientId: l.ingredientId, qty: l.qty, unit: l.unit })) });
      return recipeId;
    });
    return ok(`Saved ${r.name}`, { id: rid });
  });
}

const BoughtIn = z.object({
  id: id.nullable(), name: name(80), countUnit: z.string().trim().min(1).max(12), price: z.number().min(0).max(1e6).nullable(),
  shop: z.string().trim().max(60).nullable(), category: z.string().max(50).nullable(),
});

/** A dish bought ready-made (kenkey, waakye…): no ingredients, a usual price per unit. */
export async function saveBoughtDish(input: z.input<typeof BoughtIn>): Promise<Result<{ id: number }>> {
  await requireUser();
  return attempt(async () => {
    const b = BoughtIn.parse(input);
    if (await nameTaken("recipe", b.name, b.id ?? undefined)) return fail("You already have a dish with this name.");
    const fields = { name: b.name, countUnit: b.countUnit || "portion", price: b.price ? Math.round(b.price * 100) / 100 : null,
      shop: b.shop || null, category: b.category || null, bought: true };
    const rid = await prisma.$transaction(async (tx) => {
      if (b.id) {
        await tx.recipe.update({ where: { id: b.id }, data: fields });
        await tx.recipeItem.deleteMany({ where: { recipeId: b.id } });
        return b.id;
      }
      return (await tx.recipe.create({ data: { ...fields, portions: 1, keepsDays: 1 } })).id;
    });
    return ok(`Saved ${b.name}`, { id: rid });
  });
}

/** Meals not yet cooked come off the plan; meals already cooked or bought stay in the history under the dish's name. */
export async function deleteRecipe(recipeId: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const r = await prisma.recipe.findUnique({ where: { id: id.parse(recipeId) } });
    if (!r) return fail("That recipe is already gone.");
    await prisma.$transaction([
      prisma.planEntry.deleteMany({ where: { recipeId: r.id, status: "planned" } }),
      prisma.$executeRaw`UPDATE meals.plan SET label = ${r.name.slice(0, 80)}, recipe_id = NULL WHERE recipe_id = ${r.id}`,
      prisma.recipe.delete({ where: { id: r.id } }),
      prisma.$executeRaw`DELETE FROM meals.pairings p WHERE (SELECT count(*) FROM meals.pairing_items i WHERE i.pairing_id = p.id) < 2`,
    ]);
    return ok(`Deleted ${r.name}`);
  });
}

// ---- starter lists and the catalog -----------------------------------------------------------------------------
export async function addCatalog(): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const [r, p] = await prisma.$transaction((tx) => loadCatalog(tx), { timeout: 60_000 });
    return ok(`Catalog checked: ${r} recipe${r === 1 ? "" : "s"} and ${p} pairing${p === 1 ? "" : "s"} added back`);
  });
}

export async function addStarterSupplies(): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = await prisma.$transaction((tx) => loadSupplies(tx));
    return ok(`Added ${n} household item${n === 1 ? "" : "s"}. Count what you have with + and −.`);
  });
}

export async function addStarterRecipes(): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const n = await prisma.$transaction((tx) => loadStarter(tx), { timeout: 60_000 });
    return ok(`Added ${n} recipe${n === 1 ? "" : "s"}`);
  });
}
