import Link from "next/link";
import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { AddToPlan, type Option } from "@/components/kitchen/AddToPlan";
import { CalendarLink } from "@/components/kitchen/CalendarLink";
import { CopyWeek } from "@/components/kitchen/CopyWeek";
import { MealCard, type PayInfo } from "@/components/kitchen/MealCard";
import { TodayCard } from "@/components/kitchen/TodayCard";
import { Empty, Msg, Pill, Section } from "@/components/ui";
import type { Book } from "@/lib/book";
import { addDays, monthName, monthOf, today as todayISO } from "@/lib/dates";
import { calendarToken } from "@/lib/kitchen/calendar";
import { costBetween, foodBudget, gh, guard, plannedCost, plannedEnd, type Kitchen } from "@/lib/kitchen/kitchen";
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

/** "about GH₵240 to buy" for a stretch of the plan, with the items that have no price yet. */
function toBuy([cost, unpriced]: [number, number]): string {
  const more = unpriced ? ` + ${unpriced} unpriced` : "";
  return cost > 0 ? `about ${gh(cost)} to buy${more}` : unpriced ? `${unpriced} item${unpriced === 1 ? "" : "s"} to buy, unpriced` : "nothing to buy";
}

/**
 * What the plan will cost: the shopping it still needs this month from the last prices paid, next to what's been
 * spent on food and the food budget.
 */
function PlanMoney({ k, b, today, g }: { k: Kitchen; b: Book; today: string; g: [string, string] | null }) {
  const [planned, unpriced] = plannedCost(k, today);
  const fb = k.foodCategories.size ? foodBudget(b, new Set([...k.foodCategories].filter(Boolean)), today) : null;
  const until = aD(plannedEnd(k, today));
  const left = fb ? fb.limit - fb.spent - planned : 0;
  const pct = (x: number) => `${Math.max(Math.min((x / (fb?.limit || 1)) * 100, 100), 0).toFixed(1)}%`;
  return (
    <div className="card">
      <Section title="What the plan costs" aside={monthName(monthOf(today), false)} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted">Still to buy, to {until} (about)</div>
          <div className="num text-xl font-bold">{gh(planned)}</div>
          {unpriced ? <div className="text-xs text-muted">+ {unpriced} item{unpriced === 1 ? "" : "s"} with no price yet</div> : null}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Food budget left</div>
          {fb ? (
            <div className={`num text-xl font-bold ${left < 0 ? "text-out" : "text-in"}`}>{gh(fb.limit - fb.spent)}</div>
          ) : <Link className="text-sm font-semibold" href="/budgets">Set a food budget</Link>}
        </div>
      </div>
      {fb ? (
        <>
          <div className="bar mt-3" role="progressbar" aria-label="Food budget with the planned shopping" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(((fb.spent + planned) / fb.limit) * 100)}>
            {/* spent so far, then the planned shopping on top of it */}
            <div className="flex h-full">
              <div className="fill" style={{ width: pct(fb.spent), borderRadius: 0 }} />
              <div className={`fill ${left < 0 ? "over" : "warn"}`}
                style={{ width: pct(Math.min(planned, Math.max(fb.limit - fb.spent, 0))), borderRadius: 0 }} />
            </div>
          </div>
          <p className="caption mb-0 mt-1.5">
            {gh(fb.spent)} spent of the {gh(fb.limit)} food budget so far.{" "}
            {left >= 0 ? `After the planned shopping, about ${gh(left)} would be left.`
              : `The planned shopping would go about ${gh(-left)} over. Consider swapping a dish.`}
          </p>
        </>
      ) : null}
      {g && g[0] === "warn" && fb && fb.spent > fb.limit ? <Msg tone="warn">{g[1]}</Msg> : null}
      <p className="caption mb-0 mt-1.5">From the last price paid for each item, after what&apos;s in the pantry.{" "}
        <Link href="/shopping">Open the shopping list</Link></p>
    </div>
  );
}

function nextSlot(now = new Date()) {
  const h = now.getUTCHours(); // Accra time is UTC
  return h < 10 ? "Breakfast" : h < 15 ? "Lunch" : "Supper";
}

export default async function MealPlan() {
  const [k, b, cal] = await Promise.all([loadKitchen(), loadBook(), calendarToken()]);
  const today = todayISO();
  const [start, end] = k.window(today);
  const pay = { accounts: b.accountNames, account: b.defaultAccount("Expense"), categories: b.categoryNames("Expense") };
  const usual = SLOTS.map((s) => `${frac(k.slotPeople[s])} at ${s.toLowerCase()}`).join(", ");
  const head = <KitchenHead current="/meals/plan" title="Meal plan" sub={`Today to ${aD(end)} · usually ${usual}`} />;
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
            const cost = n ? ` · ${toBuy(costBetween(k, today, wdays[0], wdays[wdays.length - 1]))}` : "";
            const label = `${name} · ${aD(wdays[0])} to ${aD(wdays[wdays.length - 1])} · ${n} meal${n === 1 ? "" : "s"}${cost}`;
            const cards = wdays.map((d) => <DayCard key={d} d={dayView(k, d, today)} k={k} b={b} pay={pay} />);
            return i === 0 ? (
              <div key={wk} className="stack"><div className="week-head">{label}</div>{cards}</div>
            ) : (
              <details key={wk} className="card"><summary>{label}</summary><div className="stack">{cards}</div></details>
            );
          })}
        </div>
        <div className="stack">
          <PlanMoney k={k} b={b} today={today} g={g} />
          <AddToPlan today={today} nextSlot={nextSlot()} usual={k.slotPeople} mealPeople={mealPeople} options={options} />
          <CalendarLink path={`/cal/${cal}.ics`} />
        </div>
      </div>
    </>
  );
}
