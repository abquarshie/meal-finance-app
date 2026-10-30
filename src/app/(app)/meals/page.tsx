import Link from "next/link";
import { Empty, Pill, Section } from "@/components/ui";
import { addDays, today as todayISO } from "@/lib/dates";
import { loadKitchen } from "@/lib/kitchen/load";
import { aDb, SLOTS } from "@/lib/kitchen/logic";
import { frac, plural } from "@/lib/kitchen/units";

export const metadata = { title: "Home" };

/** The Meal app's home: what's coming up, what's running low and what's in the fridge, each with a way into the
 * page that deals with it. */
export default async function MealHome() {
  const k = await loadKitchen();
  const today = todayISO();

  const soon = [1, 2].map((n) => addDays(today, n)).map((d) => ({
    day: d, meals: SLOTS.map((slot) => ({ slot, parts: k.entries(d).filter((e) => e.slot === slot) }))
      .filter((m) => m.parts.length).map((m) => ({ slot: m.slot, name: k.mealName(m.parts) })),
  }));
  const foodLow = k.foodLow();
  const suppliesLow = k.suppliesLow();
  const fridge = k.fridge.slice(0, 5);

  return (
    <>
      <h1 className="sr-only">Meal home</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="stack">
          <div className="card">
            <Section title="Coming up" />
            {soon.map((d) => (
              <div key={d.day} className="rule">
                <div className="min-w-0">
                  <div className="rule-name">{d.day === addDays(today, 1) ? "Tomorrow" : aDb(d.day)}</div>
                  <div className="rule-meta">{d.meals.length ? d.meals.map((m) => `${m.slot}: ${m.name}`).join(" · ") : "Nothing planned yet"}</div>
                </div>
              </div>
            ))}
            <Link className="btn ghost mt-1" href="/meals/plan">Plan meals</Link>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <Section title="Running low" aside={foodLow.length + suppliesLow.length ? `${foodLow.length + suppliesLow.length} item${foodLow.length + suppliesLow.length === 1 ? "" : "s"}` : undefined} />
            {foodLow.length || suppliesLow.length ? (
              <>
                {foodLow.length ? <div className="rule"><div className="min-w-0"><div className="rule-name">Food</div>
                  <div className="rule-meta">{foodLow.join(", ")}</div></div></div> : null}
                {suppliesLow.length ? <div className="rule"><div className="min-w-0"><div className="rule-name">Household</div>
                  <div className="rule-meta">{suppliesLow.join(", ")}</div></div></div> : null}
              </>
            ) : <Empty>Nothing is running low.</Empty>}
            <div className="btns mt-1">
              <Link className="btn ghost" href="/shopping">Shopping list</Link>
              <Link className="btn ghost" href="/meals/household">Household</Link>
            </div>
          </div>

          <div className="card">
            <Section title="In the fridge" aside={k.fridge.length ? `${k.fridge.length} dish${k.fridge.length === 1 ? "" : "es"}` : undefined} />
            {fridge.length ? fridge.map((f) => (
              <div key={f.id} className="rule">
                <div className="min-w-0">
                  <div className="rule-name">{f.label}{f.eatBy <= today ? <Pill tone="warn">Eat today</Pill> : null}</div>
                  <div className="rule-meta">{frac(f.portions)} {plural(f.unit ?? "portion", f.portions)} · eat by {aDb(f.eatBy)}</div>
                </div>
              </div>
            )) : <Empty>No leftovers in the fridge.</Empty>}
            <Link className="btn ghost mt-1" href="/meals/fridge">Open the fridge</Link>
          </div>
        </div>
      </div>
    </>
  );
}
