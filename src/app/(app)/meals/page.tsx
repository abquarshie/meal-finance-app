import Link from "next/link";
import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { AddToPlan, type Option } from "@/components/kitchen/AddToPlan";
import { CopyWeek } from "@/components/kitchen/CopyWeek";
import { MealCard, type PayInfo } from "@/components/kitchen/MealCard";
import { TodayCard } from "@/components/kitchen/TodayCard";
import { Empty, Msg, Pill } from "@/components/ui";
import type { Book } from "@/lib/book";
import { addDays, today as todayISO } from "@/lib/dates";
import { guard, type Kitchen } from "@/lib/kitchen/kitchen";
import { loadKitchen } from "@/lib/kitchen/load";
import { aD, repeatPlan, SLOTS, type Entry } from "@/lib/kitchen/logic";
import { frac, unitsFor } from "@/lib/kitchen/units";
import { dayView, type DayView } from "@/lib/kitchen/views";
import { loadBook } from "@/lib/load";

export const metadata = { title: "Meal plan" };

/** Where a payment for bought food is logged: the dish's own category, else Dining Out, else any food one. */
function payCategory(k: Kitchen, b: Book, e: Entry | undefined): string | null {
  const cats = b.categoryNames("Expense");
  const own = e?.recipeId ? k.recipes.get(e.recipeId)?.category : null;
  for (const c of [own, "Dining Out", ...[...k.foodCategories].sort()]) if (c && cats.includes(c)) return c;
  return cats[0] ?? null;
}

function DayCard({ d, k, b, pay }: { d: DayView; k: Kitchen; b: Book; pay: Omit<PayInfo, "category"> }) {
  return (
    <div className="card day">
      <div className="section"><h3 className="section-title">{d.title}</h3>
        {d.tag ? <Pill tone={d.tag === "Today" ? "accent" : "neutral"}>{d.tag}</Pill> : null}</div>
      {d.meals.length ? d.meals.map((m) => (
        <MealCard key={m.slot} meal={m}
          pay={{ ...pay, category: payCategory(k, b, k.entries(m.day).find((e) => e.slot === m.slot && k.isBought(e))) }} />
      )) : <Empty>Nothing planned.</Empty>}
    </div>
  );
}

function nextSlot(now = new Date()) {
  const h = now.getUTCHours(); // Accra time is UTC
  return h < 10 ? "Breakfast" : h < 15 ? "Lunch" : "Supper";
}

export default async function MealPlan() {
  const [k, b] = await Promise.all([loadKitchen(), loadBook()]);
  const today = todayISO();
  const [start, end] = k.window(today);
  const pay = { accounts: b.accountNames, account: b.defaultAccount("Expense"), categories: b.categoryNames("Expense") };
  const usual = SLOTS.map((s) => `${frac(k.slotPeople[s])} at ${s.toLowerCase()}`).join(", ");
  const head = <KitchenHead current="/meals" title="Meal plan" sub={`Today to ${aD(end)} · usually ${usual}`} />;
  const g = guard(k, b, today);
  const copy = repeatPlan(k.plan, today, 14);

  // the weeks: this week shown, the next folded away; earlier this week folded away at the top
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday is 0
  const monday = addDays(today, -dow);
  const past = Array.from({ length: dow }, (_, i) => addDays(monday, i));
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const weeks = new Map<string, string[]>();
  for (const d of days) {
    const wk = addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
    weeks.set(wk, [...(weeks.get(wk) ?? []), d]);
  }

  // the add form's choices
  const options: Option[] = [
    ...[...k.pairings].map(([i, p]) => ({ key: `p:${i}`, label: `🍲 ${p.name}`, kind: "pairing" as const,
      parts: p.parts.map((x) => (x.recipeId ? `r:${x.recipeId}` : `i:${x.ingredientId}`)),
      sides: Object.fromEntries(p.parts.filter((x) => x.ingredientId).map((x) => [`i:${x.ingredientId}`, { qty: x.qty ?? 1, unit: x.unit ?? "pcs" }])) })),
    ...[...k.recipes].sort((a, b2) => (a[1].name.toLowerCase() < b2[1].name.toLowerCase() ? -1 : 1)).map(([i, r]) => ({ key: `r:${i}`,
      label: r.name + (r.bought ? " 🛍️" : ""), kind: "recipe" as const, bought: Boolean(r.bought), countUnit: r.countUnit })),
    ...[...k.foodNames].sort((a, b2) => (a[1].toLowerCase() < b2[1].toLowerCase() ? -1 : 1)).map(([i, n]) => ({ key: `i:${i}`,
      label: `${n} (item)`, kind: "item" as const, units: unitsFor(k.unitOf.get(i) ?? "pcs", k.pack(i)) })),
  ];
  const mealPeople: Record<string, number> = {};
  for (const d of days) for (const s of SLOTS) mealPeople[`${d}|${s}`] = k.mealPeople(d, s);
  return (
    <>
      {head}
      <div className="stack mb-4">
        <TodayCard k={k} onPlan />
        {copy.length ? <CopyWeek label={!k.entries(start, end).length ? `Copy the week before (${k.mealCount(copy)} meals)`
          : `Fill the empty meals from the week before (${k.mealCount(copy)})`} primary={!k.entries(start, end).length} /> : null}
        {g ? <Msg tone={g[0] as "warn" | "hint"}>{g[1]}</Msg> : null}
      </div>
      <div className="grid32">
        <div className="stack">
          {past.length && k.entries(past[0], past[past.length - 1]).length ? (
            <details className="card">
              <summary>Earlier this week ({aD(past[0]).slice(0, 3)} to {aD(past[past.length - 1]).slice(0, 3)}, {(n => `${n} meal${n === 1 ? "" : "s"}`)(k.mealCount(k.entries(past[0], past[past.length - 1])))})</summary>
              <div className="stack">{past.map((d) => <DayCard key={d} d={dayView(k, d, today)} k={k} b={b} pay={pay} />)}</div>
            </details>
          ) : null}
          {[...weeks].map(([wk, wdays], i) => {
            const name = wk === monday ? "This week" : wk === addDays(monday, 7) ? "Next week" : "Week after";
            const n = k.mealCount(k.entries(wdays[0], wdays[wdays.length - 1]));
            const label = `${name} · ${aD(wdays[0])} to ${aD(wdays[wdays.length - 1])} · ${n} meal${n === 1 ? "" : "s"}`;
            const cards = wdays.map((d) => <DayCard key={d} d={dayView(k, d, today)} k={k} b={b} pay={pay} />);
            return i === 0 ? (
              <div key={wk} className="stack"><div className="week-head">{label}</div>{cards}</div>
            ) : (
              <details key={wk} className="card"><summary>{label}</summary><div className="stack">{cards}</div></details>
            );
          })}
        </div>
        <AddToPlan today={today} nextSlot={nextSlot()} usual={k.slotPeople} mealPeople={mealPeople} options={options} />
      </div>
    </>
  );
}
