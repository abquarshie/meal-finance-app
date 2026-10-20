import { RecipeHead } from "@/components/kitchen/RecipeTabs";
import { Empty, Section } from "@/components/ui";
import { loadKitchen } from "@/lib/kitchen/load";
import { frac, plural, unitsFor } from "@/lib/kitchen/units";
import { PairingForms } from "./PairingForms";

export const metadata = { title: "Pairings" };

export default async function Pairings() {
  const k = await loadKitchen();
  const text = (p: { parts: { recipeId?: number; ingredientId?: number; qty?: number; unit?: string }[] }) => p.parts.map((x) => x.recipeId
    ? k.recipes.get(x.recipeId)!.name : `${k.names.get(x.ingredientId!) ?? "?"} (${frac(x.qty ?? 1)} ${plural(x.unit ?? "pcs", x.qty ?? 1)} a person)`).join(" + ");
  const dishes = [...k.recipes].filter(([, r]) => !r.bought)
    .sort((a, b) => Number(a[1].role !== "starch") - Number(b[1].role !== "starch") || (a[1].name.toLowerCase() < b[1].name.toLowerCase() ? -1 : 1))
    .map(([id, r]) => ({ id, name: r.name, role: r.role ?? "main" }));
  const sides = [...k.foodNames].sort((a, b) => (a[1].toLowerCase() < b[1].toLowerCase() ? -1 : 1))
    .map(([id, name]) => ({ id, name, units: unitsFor(k.unitOf.get(id) ?? "pcs", k.pack(id)) }));
  return (
    <>
      <RecipeHead current="/meals/recipes/pairings" />
      <div className="grid32">
        <div className="card">
          <Section title="Pairings" aside={String(k.pairings.size)} />
          {!k.pairings.size ? <Empty>No pairings yet. Make one on this page.</Empty> : [...k.pairings].map(([id, p]) => {
            const parts = text(p);
            return (
              <div className="rule" key={id}><div style={{ minWidth: 0 }}><div className="rule-name">🍲 {p.name}</div>
                {parts.toLowerCase() !== p.name.toLowerCase() ? <div className="rule-meta">{parts}</div> : null}</div></div>
            );
          })}
          <p className="caption">Pick one on the meal plan under Dishes. It&apos;s planned as one meal: the starch is cooked fresh, and the soup comes from the fridge when this week&apos;s pot is already there.</p>
        </div>
        <PairingForms dishes={dishes} sides={sides} pairings={[...k.pairings].map(([id, p]) => ({ id, name: p.name }))} />
      </div>
    </>
  );
}
