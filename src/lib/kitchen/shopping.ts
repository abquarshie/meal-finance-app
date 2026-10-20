// The shopping list as the shopping page builds it (meals/pages/shopping.py): what the plan still needs once the
// stock is shared out, plus what ran out while cooking, plus staples running low.
import { addDays, type ISODate } from "../dates";
import type { Kitchen } from "./kitchen";
import { cmp, shoppingList, shortfall, type ShopRow, type Total } from "./logic";
import { baseOf, fmt, fromBase, plural, toBase, frac } from "./units";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Ingredients that ran out while cooking, in the shape shoppingList() takes (unit mismatches left out: the
 * pantry still has them). */
export function ranOutNeeds(k: Kitchen, today: ISODate): Map<string, Total> {
  return new Map([...k.ranShort(today)].filter(([, t]) => !t.mismatch).map(([key, t]) => [key,
    { qty: t.short, short: t.short, for: t.for, reason: `Ran out when cooking ${t.for.join(", ")}` }]));
}

export function shoppingRows(k: Kitchen, today: ISODate, days: number): ShopRow[] {
  const entries = k.openEntries(today, addDays(today, days - 1));
  const needs = shortfall(k.allocation(today), entries,
    (e) => `${k.mealNameOf(e)} (${WD[new Date(`${e.day}T00:00:00Z`).getUTCDay()]})`);
  for (const [key, t] of ranOutNeeds(k, today)) if (!needs.has(key)) needs.set(key, t);
  const name = (r: ShopRow) => (k.names.get(r.ingredientId) ?? "").toLowerCase();
  return shoppingList(needs, k.pantry, k.lowLevels, k.prices, k.packs)
    .map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.low) - Number(b.r.low) || cmp(name(a.r), name(b.r)) || a.i - b.i)
    .map(({ r }) => r);
}

/** What to pick up, the way it's sold: 1 crate of eggs, 1.3 kg of rice, 3 onions. */
export function amountOf(k: Kitchen, r: ShopRow): [number, string] {
  if (r.pack) return [r.packs!, r.pack];
  const usual = k.unitOf.get(r.ingredientId) ?? r.base;
  if (baseOf(usual) === r.base) return [Math.round(fromBase(r.toBuy, r.base, usual) * 1000) / 1000, usual];
  return [Math.round(r.toBuy * 1000) / 1000, r.base];
}

export function qtyLabel(amount: number, unit: string): string {
  if (unit === "pcs") return frac(amount);
  if (["g", "kg", "ml", "l", "tbsp", "tsp"].includes(unit)) return `${Number(amount.toPrecision(6))} ${unit}`;
  return `${frac(amount)} ${plural(unit, amount)}`;
}

export type ListRow = { ing: number; name: string; amount: number; unit: string; est: number | null; category: string; why: string };

/** The rows the shopping page shows, with the money category each is logged under. */
export function listRows(k: Kitchen, items: ShopRow[], cats: string[], fallback: string): ListRow[] {
  return items.map((r) => {
    const [amount, unit] = amountOf(k, r);
    let why = r.reason;
    if (k.supplies.has(r.ingredientId)) why = `Household · ${why || "running low"}`;
    const usual = k.unitOf.get(r.ingredientId);
    if (r.pack) why += `${why ? "; " : ""}need ${fmt(r.toBuy, r.base, usual)}`;
    if (r.have > 0) why += ` (have ${fmt(r.have, r.base, usual)})`;
    const cat = k.categoryOf.get(r.ingredientId);
    return { ing: r.ingredientId, name: k.names.get(r.ingredientId) ?? "?", amount, unit, est: r.est,
      category: cat && cats.includes(cat) ? cat : fallback, why };
  });
}

/** An extra item added by hand: its estimated cost from the last price. */
export function extraRow(k: Kitchen, ing: number, qty: number, unit: string, cats: string[], fallback: string): ListRow {
  const [q, base] = toBase(qty, unit, k.pack(ing));
  const per = k.prices.get(`${ing}|${base}`);
  const cat = k.categoryOf.get(ing);
  return { ing, name: k.names.get(ing) ?? "?", amount: qty, unit, est: per !== undefined ? Math.round(per * q * 100) / 100 : null,
    category: cat && cats.includes(cat) ? cat : fallback, why: "Added by you" };
}
