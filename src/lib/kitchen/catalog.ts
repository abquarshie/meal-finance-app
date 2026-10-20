import "server-only";
// Adding the Ghanaian kitchen catalog, templates, pairings and starter lists: a port of meals/catalog.py
// (add_items, add_recipes, add_pairings, line_amount). Items already there by name are reused, recipe and pairing
// names already used are skipped, and nothing the family changed is touched.
import type { Tx } from "../db";
import data from "./catalog.json";
import { baseOf, toBase } from "./units";

type Row = [section: string | null, name: string, unit: string, category: string, pack: string | null, size: number | null,
  loose: boolean, alts: Record<string, number> | null];
type Template = [name: string, role: string, portions: number, keeps: number, note: string | null, hours: number | null,
  method: string, lines: [string, number, string][]];
type Item = { id: number; unit: string; packName: string | null; packSize: number | null; altUnits: Record<string, number> | null; name: string };

export const CATALOG = data as unknown as {
  flag: string; sections: string[]; catalog: Row[]; templates: Template[];
  pairings: [string, string[], [string, number, string] | null][]; equiv: Record<string, Record<string, number>>;
  starterIngredients: (string | number | boolean | null)[][];
  starterRecipes: [string, number, number, string | null, number | null, string, [string, number, string][]][];
  supplies: [string, string, number | null, string | null, number | null][];
};

function packInfo(unit: string, pack: string | null, size: number | null, altUnits: Record<string, number> | null)
  : [number | null, Record<string, number> | null] {
  const one = toBase(1, unit)[0];
  const packBase = pack && size ? size * one : null;
  const alts = altUnits && Object.keys(altUnits).length
    ? Object.fromEntries(Object.entries(altUnits).map(([u, v]) => [u, Math.round(v * one * 1e6) / 1e6])) : null;
  return [packBase, alts];
}

async function items(tx: Tx): Promise<Map<string, Item>> {
  const rows = await tx.ingredient.findMany();
  return new Map(rows.map((r) => [r.name.toLowerCase(), { id: r.id, unit: r.unit, packName: r.packName,
    packSize: r.packSize === null ? null : Number(r.packSize), altUnits: (r.altUnits as Record<string, number> | null) ?? null,
    name: r.name }]));
}

/** A recipe line in the unit the item is actually kept in, or null if it can't be converted. */
function lineAmount(item: Item, qty: number, unit: string): [number, string] | null {
  if (baseOf(unit) === baseOf(item.unit) || unit === item.packName || unit in (item.altUnits ?? {})) return [qty, unit];
  const per = CATALOG.equiv[item.name.toLowerCase()]?.[baseOf(item.unit)];
  if (per === undefined) return null;
  const base = baseOf(item.unit);
  return [Math.round(qty * per * 1000) / 1000, baseOf(item.unit) === item.unit ? item.unit : base];
}

export async function addItems(tx: Tx, rows: Row[], expense: string[]): Promise<Map<string, Item>> {
  const fallback = expense.includes("Staples") ? "Staples" : expense[0] ?? null;
  const have = await items(tx);
  for (const [section, name, unit, cat, pack, size, loose, altUnits] of rows) {
    const [packBase, alts] = packInfo(unit, pack, size, altUnits);
    const found = have.get(name.toLowerCase());
    if (found) {
      const same = baseOf(found.unit) === baseOf(unit);
      if (same && !found.packName && pack) {
        await tx.ingredient.update({ where: { id: found.id }, data: { packName: pack, packSize: packBase, loose, altUnits: alts ?? undefined } });
      } else if (same && alts && found.packName === pack) {
        if (!found.altUnits) await tx.ingredient.update({ where: { id: found.id }, data: { altUnits: alts } });
        if (loose) await tx.ingredient.update({ where: { id: found.id }, data: { loose: true } });
      }
      await tx.$executeRaw`UPDATE meals.ingredients SET section = COALESCE(section, ${section}) WHERE id = ${found.id}`;
    } else {
      await tx.ingredient.create({ data: { name, unit, category: expense.includes(cat) ? cat : fallback, packName: pack,
        packSize: packBase, loose, altUnits: alts ?? undefined, section } });
    }
  }
  return items(tx);
}

export async function addRecipes(tx: Tx, recipes: Template[]): Promise<number> {
  const have = await items(tx);
  const taken = new Set((await tx.recipe.findMany({ select: { name: true } })).map((r) => r.name.toLowerCase()));
  let added = 0;
  for (const [name, role, portions, keeps, note, hours, method, lines] of recipes) {
    if (taken.has(name.toLowerCase())) continue;
    const r = await tx.recipe.create({ data: { name, portions, keepsDays: keeps, prepNote: note, prepHours: hours, method, role } });
    for (const [item, qty, unit] of lines) {
      const found = have.get(item.toLowerCase());
      const amount = found ? lineAmount(found, qty, unit) : null;
      if (found && amount) await tx.recipeItem.create({ data: { recipeId: r.id, ingredientId: found.id, qty: amount[0], unit: amount[1] } });
    }
    taken.add(name.toLowerCase());
    added += 1;
  }
  return added;
}

export async function addPairings(tx: Tx): Promise<number> {
  const have = await items(tx);
  const recipes = new Map((await tx.recipe.findMany({ select: { id: true, name: true } })).map((r) => [r.name.toLowerCase(), r.id]));
  const taken = new Set((await tx.pairing.findMany({ select: { name: true } })).map((p) => p.name.toLowerCase()));
  let added = 0;
  for (const [name, dishes, side] of CATALOG.pairings) {
    const rids = dishes.map((d) => recipes.get(d.toLowerCase()));
    if (taken.has(name.toLowerCase()) || rids.some((x) => x === undefined)) continue;
    const p = await tx.pairing.create({ data: { name } });
    for (const rid of rids) await tx.pairingItem.create({ data: { pairingId: p.id, recipeId: rid! } });
    if (side) {
      const found = have.get(side[0].toLowerCase());
      const amount = found ? lineAmount(found, side[1], side[2]) : null;
      if (found && amount) await tx.pairingItem.create({ data: { pairingId: p.id, ingredientId: found.id, qty: amount[0], unit: amount[1] } });
    }
    added += 1;
  }
  return added;
}

async function expenseCategories(tx: Tx) {
  return (await tx.category.findMany({ where: { kind: "Expense" }, orderBy: { id: "asc" } })).map((c) => c.name);
}

/** Add back whatever is missing from the catalog, templates and pairings: [recipes added, pairings added]. */
export async function loadCatalog(tx: Tx): Promise<[number, number]> {
  await addItems(tx, CATALOG.catalog, await expenseCategories(tx));
  return [await addRecipes(tx, CATALOG.templates), await addPairings(tx)];
}

/** The six everyday starter dishes with their ingredients: how many recipes were added. */
export async function loadStarter(tx: Tx): Promise<number> {
  const rows: Row[] = CATALOG.starterIngredients.map(([name, unit, cat, , pack, size, loose]) =>
    [null, String(name), String(unit), String(cat), (pack as string) ?? null, (size as number) ?? null, Boolean(loose), null]);
  const have = await addItems(tx, rows, await expenseCategories(tx));
  for (const [name, unit, , low] of CATALOG.starterIngredients) { // warning levels, only where none is set yet
    const it = have.get(String(name).toLowerCase());
    if (low !== null && low !== undefined && it && it.unit === unit) {
      await tx.$executeRaw`UPDATE meals.ingredients SET low_level = COALESCE(low_level, ${toBase(Number(low), String(unit))[0]}::numeric)
        WHERE id = ${it.id}`;
    }
  }
  return addRecipes(tx, CATALOG.starterRecipes.map(([name, portions, keeps, note, hours, method, lines]) =>
    [name, "main", portions, keeps, note, hours, method, lines]));
}

import { SUPPLIES_CATEGORY, SUPPLIES_GROUP } from "./catalog-names";
export { SUPPLIES_CATEGORY, SUPPLIES_GROUP };

export async function ensureSuppliesCategory(tx: Tx) {
  await tx.$executeRaw`INSERT INTO categories (name, group_name, kind) VALUES (${SUPPLIES_CATEGORY}, ${SUPPLIES_GROUP}, 'Expense')
    ON CONFLICT (name) DO NOTHING`;
}

/** The everyday cleaning things most homes keep. Skips names already there. */
export async function loadSupplies(tx: Tx): Promise<number> {
  await ensureSuppliesCategory(tx);
  let added = 0;
  for (const [name, unit, low, pack, size] of CATALOG.supplies) {
    added += await tx.$executeRaw`INSERT INTO meals.ingredients (name, unit, category, low_level, pack_name, pack_size, kind)
      VALUES (${name}, ${unit}, ${SUPPLIES_CATEGORY}, ${low === null ? null : toBase(low, unit)[0]}::numeric, ${pack},
        ${size ? toBase(size, unit)[0] : null}::numeric, 'household') ON CONFLICT (name) DO NOTHING`;
  }
  return added;
}
