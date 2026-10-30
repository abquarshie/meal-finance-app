import Link from "next/link";
import { fromISO, today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { aDb, SLOTS } from "@/lib/kitchen/logic";

/** Today's meals on Home, from one small query (the full kitchen, with its stock and allocation, stays on the
 * meal plan). Ticked-off dishes are struck through. */
export async function TodayMeals() {
  const day = today();
  try {
    const rows = await prisma.planEntry.findMany({
      where: { day: fromISO(day) }, orderBy: { id: "asc" },
      select: { slot: true, status: true, label: true, recipe: { select: { name: true } }, ingredient: { select: { name: true } } },
    });
    const meals = SLOTS.map((slot) => ({ slot, parts: rows.filter((r) => r.slot === slot) })).filter((m) => m.parts.length);
    return (
      <div className="card">
        <div className="section"><h2 className="section-title">🍲 Today&apos;s meals</h2><span className="section-aside">{aDb(day)}</span></div>
        {meals.length ? meals.map((m) => {
          const done = m.parts.every((p) => p.status !== "planned");
          const name = m.parts.map((p) => p.recipe?.name ?? p.ingredient?.name ?? p.label ?? "?").join(" + ");
          return (
            <div key={m.slot} className={`today-row${done ? " done" : ""}`}>
              <div className="today-dish"><span className="today-slot">{m.slot}:</span> {name}</div>
              {done ? <div className="today-tag">✔️ Done</div> : null}
            </div>
          );
        }) : <div className="today-row"><div className="today-dish muted">Nothing planned for today.</div></div>}
        <Link className="btn ghost mt-1" href="/meals/plan">Open the meal plan</Link>
      </div>
    );
  } catch (e) {
    console.error(e); // never let the kitchen break the money side
    return <p className="caption">Today&apos;s meals couldn&apos;t load.</p>;
  }
}
