import "server-only";
// Pantry and plan helpers used inside one database transaction (a port of the helpers in meals/actions.py).
import { toISO, type ISODate } from "../dates";
import type { Tx } from "../db";
import { SLOTS, type Line, type Need, type Packs } from "./logic";
import { HOUSEHOLD_KEY, slotKey } from "./kitchen";
import { makePack } from "./units";

export async function addStock(tx: Tx, ing: number, base: string, qty: number): Promise<void> {
  await tx.$executeRaw`INSERT INTO meals.pantry (ingredient_id, unit, qty) VALUES (${ing}, ${base}, GREATEST(${qty}::numeric, 0))
    ON CONFLICT (ingredient_id, unit) DO UPDATE SET qty = GREATEST(meals.pantry.qty + ${qty}::numeric, 0), updated_at = now()`;
}

/** Take up to qty from the pantry; returns how much was actually there to take. */
export async function takeStock(tx: Tx, ing: number, base: string, qty: number): Promise<number> {
  const rows = await tx.$queryRaw<{ qty: number }[]>`SELECT qty::float8 AS qty FROM meals.pantry
    WHERE ingredient_id = ${ing} AND unit = ${base} FOR UPDATE`;
  const have = rows.length ? Number(rows[0].qty) : 0;
  const took = Math.min(have, qty);
  if (rows.length) {
    await tx.$executeRaw`UPDATE meals.pantry SET qty = ${have - took}::numeric, updated_at = now()
      WHERE ingredient_id = ${ing} AND unit = ${base}`;
  }
  return took;
}

export async function packsOf(tx: Tx): Promise<Packs> {
  const rows = await tx.ingredient.findMany({ where: { packName: { not: null }, packSize: { gt: 0 } } });
  const out: Packs = new Map();
  for (const r of rows) {
    const p = makePack(r.unit, r.packName, Number(r.packSize), r.loose, r.altUnits);
    if (p) out.set(r.id, p);
  }
  return out;
}

export async function recipeOf(tx: Tx, id: number) {
  const r = await tx.recipe.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
  const items: Line[] = r.items.map((i) => [i.ingredientId, Number(i.qty), i.unit]);
  return { recipe: { name: r.name, portions: Number(r.portions), keepsDays: r.keepsDays, prepNote: null, prepHours: null,
    bought: r.bought, price: r.price === null ? null : Number(r.price), countUnit: r.countUnit ?? undefined, shop: r.shop ?? undefined }, items };
}

export type LockedEntry = {
  id: number; day: ISODate; slot: string; recipeId: number | null; ingredientId: number | null; qty: number; unit: string | null;
  status: string; undo: Undo | null; label: string | null; price: number | null; people: number | null;
};
export type Undo = {
  pantry?: Need[]; fridge_made?: [number, number] | null; short?: Need[]; fridge_taken?: [number, number][];
  tx?: number; bought?: number; price_before?: number | null;
};

/** One plan entry, locked for the rest of the transaction. */
export async function lockEntry(tx: Tx, id: number): Promise<LockedEntry | null> {
  const rows = await tx.$queryRaw<{
    id: number; day: Date; slot: string; recipe_id: number | null; ingredient_id: number | null; qty: number; unit: string | null;
    status: string; undo: Undo | null; label: string | null; price: number | null; people: number | null;
  }[]>`SELECT id, day, slot, recipe_id, ingredient_id, qty::float8 AS qty, unit, status, undo, label, price::float8 AS price,
    people::float8 AS people FROM meals.plan WHERE id = ${id} FOR UPDATE`;
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, day: toISO(r.day), slot: r.slot, recipeId: r.recipe_id, ingredientId: r.ingredient_id, qty: Number(r.qty),
    unit: r.unit, status: r.status, undo: r.undo, label: r.label, price: r.price === null ? null : Number(r.price),
    people: r.people === null ? null : Number(r.people) };
}

/** The usual number eating each meal ({slot: n}), as the screens see it. */
export async function slotPeople(tx: Tx): Promise<Record<string, number>> {
  const rows = await tx.appMeta.findMany({ where: { key: { startsWith: "meals_" } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  const hh = Number.parseInt(s[HOUSEHOLD_KEY] ?? "4", 10);
  const household = Number.isNaN(hh) ? 4 : Math.max(hh, 1);
  return Object.fromEntries(SLOTS.map((slot) => {
    const n = Number.parseInt(s[slotKey(slot)] ?? String(household), 10);
    return [slot, Number.isNaN(n) ? household : Math.max(n, 0)];
  }));
}
