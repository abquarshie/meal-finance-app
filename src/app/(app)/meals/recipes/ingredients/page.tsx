import { RecipeHead } from "@/components/kitchen/RecipeTabs";
import { CATALOG_SECTIONS } from "@/lib/kitchen/catalog-names";
import { loadKitchen } from "@/lib/kitchen/load";
import { sk } from "@/lib/kitchen/logic";
import { alts, baseOf, fmt, fromBase, plural } from "@/lib/kitchen/units";
import { loadBook } from "@/lib/load";
import { IngredientForms, type IngRow } from "./IngredientForms";

export const metadata = { title: "Ingredients" };

export default async function Ingredients() {
  const [k, b] = await Promise.all([loadKitchen(), loadBook()]);
  const used = k.usedIngredients();
  const inRecipes = new Map<number, number>();
  for (const lines of k.items.values()) for (const [i] of lines) inRecipes.set(i, (inRecipes.get(i) ?? 0) + 1);
  const rows: IngRow[] = k.ingredients.filter((i) => i.kind !== "household").map((i) => ({
    id: i.id, name: i.name, unit: i.unit, category: i.category ?? "", pack: i.packName ?? "",
    holds: i.packSize !== null ? Number(fromBase(i.packSize, baseOf(i.unit), i.unit).toPrecision(6)) : null, loose: i.loose,
    low: i.lowLevel !== null ? Number(fromBase(i.lowLevel, baseOf(i.unit), i.unit).toPrecision(6)) : null, section: i.section ?? "",
    other: Object.entries(alts(k.pack(i.id))).map(([u, v]) => `${u} = ${Number(fromBase(v, baseOf(i.unit), i.unit).toPrecision(6))} ${plural(i.unit)}`).join(", "),
    stock: (() => { const q = k.pantry.get(sk(i.id, baseOf(i.unit))) ?? 0; return q ? fmt(q, baseOf(i.unit), i.unit) : ""; })(),
    lines: inRecipes.get(i.id) ?? 0, removable: !used.has(i.id),
  }));
  return (
    <>
      <RecipeHead current="/meals/recipes/ingredients" />
      <IngredientForms rows={rows} categories={b.categoryNames("Expense")} sections={CATALOG_SECTIONS} />
    </>
  );
}
