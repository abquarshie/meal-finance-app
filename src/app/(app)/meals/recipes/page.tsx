import { RecipeHead } from "@/components/kitchen/RecipeTabs";
import { Empty, Pill, Section } from "@/components/ui";
import { CATALOG_STARTER_NAMES } from "@/lib/kitchen/catalog-names";
import { loadKitchen } from "@/lib/kitchen/load";
import { recipeCost } from "@/lib/kitchen/logic";
import { alts, fmt, frac, plural, toBase, unitsFor } from "@/lib/kitchen/units";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { RecipeEditor, StarterRecipes, type RecipeData } from "./RecipeEditor";

export const metadata = { title: "Recipes" };

export default async function Recipes() {
  const [k, b] = await Promise.all([loadKitchen(), loadBook()]);
  const line = (ing: number, qty: number, unit: string) => {
    const pack = k.pack(ing);
    if ((pack && unit === pack[0]) || unit in alts(pack)) return `${frac(qty)} ${plural(unit, qty)} ${k.names.get(ing) ?? "?"}`;
    const [q, base] = toBase(qty, unit);
    return `${fmt(q, base, unit)} ${k.names.get(ing) ?? "?"}`;
  };
  const recipes: RecipeData[] = [...k.recipes].map(([id, r]) => ({ id, name: r.name, portions: r.portions, keepsDays: r.keepsDays,
    prepNote: r.prepNote ?? "", prepHours: r.prepHours, method: r.method ?? "", role: r.role ?? "main", bought: Boolean(r.bought),
    price: r.price ?? null, countUnit: r.countUnit ?? "portion", shop: r.shop ?? "", category: r.category ?? "",
    lines: (k.items.get(id) ?? []).map(([ing, qty, unit]) => ({ ing, qty, unit })) }));
  const ingredients = [...k.foodNames].sort((a, b2) => (a[1].toLowerCase() < b2[1].toLowerCase() ? -1 : 1)).map(([id, name]) => ({
    id, name, unit: k.unitOf.get(id) ?? "pcs", units: unitsFor(k.unitOf.get(id) ?? "pcs", k.pack(id)),
    pack: k.pack(id)?.[0] ?? null, alts: Object.keys(alts(k.pack(id))) }));
  const hasStarter = recipes.some((r) => CATALOG_STARTER_NAMES.includes(r.name.toLowerCase()));
  return (
    <>
      <RecipeHead current="/meals/recipes" />
      {!hasStarter ? <StarterRecipes /> : null}
      <div className="grid32">
        <RecipeEditor recipes={recipes} ingredients={ingredients} household={k.household} categories={b.categoryNames("Expense")} />
        <div className="card">
          <Section title="Recipe book" aside={String(recipes.length)} />
          {!recipes.length ? <Empty>No recipes yet.</Empty> : [...k.recipes].map(([id, r]) => {
            if (r.bought) {
              return (
                <div className="rule" key={id}>
                  <div style={{ minWidth: 0 }}><div className="rule-name">{r.name}<Pill tone="accent">🛍️ bought</Pill></div>
                    <div className="rule-meta">{r.shop ? `Bought at ${r.shop}` : "Bought ready-made"}{r.category ? `, logged under ${r.category}` : ""}</div></div>
                  <div className="rule-right"><div className="rule-next">{r.price ? `${money(r.price)} a ${r.countUnit}` : "price known after the first time"}</div></div>
                </div>
              );
            }
            const [batch, each, unknown] = recipeCost(id, k.recipes, k.items, k.prices, k.packs);
            const lines = (k.items.get(id) ?? []).map(([i, q, u]) => line(i, q, u)).join(", ");
            return (
              <div className="rule" key={id}>
                <div style={{ minWidth: 0 }}>
                  <div className="rule-name">{r.name}{["starch", "soup", "stew", "sauce", "side"].includes(r.role ?? "") ? <Pill>{r.role}</Pill> : null}
                    <Pill>{frac(r.portions)} {plural("portion", r.portions)}</Pill><Pill tone="accent">keeps {r.keepsDays} days</Pill></div>
                  <div className="rule-meta">{lines || "No ingredients yet"}</div>
                  {r.prepNote && r.prepHours ? <div className="rule-meta">Ahead: {r.prepNote} ({r.prepHours} h before)</div> : null}
                </div>
                <div className="rule-right"><div className="rule-next">{batch ? `${unknown ? "at least " : "about "}${money(each)} a portion` : "cost known after your first shop"}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
