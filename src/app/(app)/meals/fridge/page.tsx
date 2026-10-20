import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { Empty, Pill, Section } from "@/components/ui";
import { addDays, today as todayISO } from "@/lib/dates";
import { loadKitchen } from "@/lib/kitchen/load";
import { aDb, fridgeFlag, recipeCost } from "@/lib/kitchen/logic";
import { frac, plural, LEFTOVER_UNITS } from "@/lib/kitchen/units";
import { money } from "@/lib/money";
import { AddToFridge, FridgeRow } from "./FridgeForms";

export const metadata = { title: "Fridge" };
const FLAG = { past: ["Past eat-by", "out"], soon: ["Eat soon", "warn"], low: ["Running low", "warn"], fresh: ["Fresh", "in"] } as const;

export default async function Fridge() {
  const k = await loadKitchen();
  const today = todayISO();
  const [amount, value, n] = k.wasteThisMonth(today);
  return (
    <>
      <KitchenHead current="/meals/fridge" title="Fridge" sub="Cooked food waiting to be eaten" />
      {n ? <p className="caption" style={{ marginTop: 0 }}>This month: {n} lot{n === 1 ? "" : "s"} of food thrown away ({frac(amount)} portions{value ? `, about ${money(value)}` : ""}).</p> : null}
      <div className="grid32">
        <div className="card">
          <Section title="In the fridge" aside={`${k.fridge.length} item${k.fridge.length === 1 ? "" : "s"}`} />
          {!k.fridge.length ? <Empty>Nothing in the fridge. Leftovers land here when you tick a meal as cooked.</Empty> : k.fridge.map((b) => {
            const [text, tone] = FLAG[fridgeFlag(b, today) ?? "fresh"];
            const eatBy = b.eatBy === today ? "today" : b.eatBy === addDays(today, 1) ? "tomorrow" : aDb(b.eatBy);
            const each = b.recipeId ? recipeCost(b.recipeId, k.recipes, k.items, k.prices, k.packs)[1] : 0;
            return (
              <FridgeRow key={b.id} id={b.id} portions={b.portions} unit={b.unit ?? "portion"} each={each || null}
                title={<><span>{b.label}</span><Pill tone={tone}>{text}</Pill></>}
                meta={`${frac(b.portions)} ${plural(b.unit ?? "portion", b.portions)}, cooked ${aDb(b.cookedOn!)}, eat by ${eatBy}`} />
            );
          })}
        </div>
        <AddToFridge today={today} units={LEFTOVER_UNITS} recipes={[...k.recipes].filter(([, r]) => !r.bought).map(([i, r]) => ({ id: i, name: r.name, keeps: r.keepsDays }))} />
      </div>
    </>
  );
}
