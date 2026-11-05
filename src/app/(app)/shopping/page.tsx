import Link from "next/link";
import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { Msg, Section } from "@/components/ui";
import { addDays, monthOf, today as todayISO } from "@/lib/dates";
import { foodBudget, guard } from "@/lib/kitchen/kitchen";
import { loadKitchen } from "@/lib/kitchen/load";
import { aD, SLOTS } from "@/lib/kitchen/logic";
import { listRows, qtyLabel, shoppingRows } from "@/lib/kitchen/shopping";
import { frac, plural, toBase, unitsFor } from "@/lib/kitchen/units";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { ShoppingList } from "./ShoppingList";

export const metadata = { title: "Shopping list" };
const SCOPES = [["7", "Next 7 days"], ["14", "Next 14 days"], ["2", "Today and tomorrow"]] as const;

export default async function Shopping({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [k, b, sp] = await Promise.all([loadKitchen(), loadBook(), searchParams]);
  const today = todayISO();
  const cats = b.categoryNames("Expense");
  const fallback = cats.includes("Staples") ? "Staples" : cats[0] ?? "";
  const head = <KitchenHead current="/shopping" title="Shopping list" sub="What the planned meals need, minus what's already in the pantry and fridge" />;

  const days = ["2", "7", "14"].includes(sp.days ?? "") ? Number(sp.days) : 7;
  const end = addDays(today, days - 1);
  const entries = k.openEntries(today, end);
  const rows = listRows(k, shoppingRows(k, today, days), cats, fallback);
  const pickups = entries.filter((e) => k.isBought(e))
    .sort((a, b2) => (a.day < b2.day ? -1 : a.day > b2.day ? 1 : SLOTS.indexOf(a.slot as never) - SLOTS.indexOf(b2.slot as never)));
  let pickTotal = 0;
  let pickUnknown = 0;
  const pickLines = pickups.map((e) => {
    const [price, unit] = k.boughtPrice(e);
    const r = e.recipeId ? k.recipes.get(e.recipeId) : undefined;
    const cost = price ? price * e.qty : null;
    pickTotal += cost ?? 0;
    pickUnknown += cost === null ? 1 : 0;
    return { key: e.id, text: `${aD(e.day).slice(0, 3)} ${e.slot.toLowerCase()}: ${k.entryName(e)}, ${frac(e.qty)} ${plural(unit, e.qty)}${r?.shop ? ` · ${r.shop}` : ""}`, cost };
  });
  // this list's estimated cost next to what's left of the food budget, shown before anyone goes to the market
  const listEst = Math.round((rows.reduce((a, r) => a + (r.est ?? 0), 0) + pickTotal) * 100) / 100;
  const unpriced = rows.filter((r) => r.est === null).length + pickUnknown;
  const food = k.foodCategories.size ? foodBudget(b, new Set([...k.foodCategories].filter(Boolean)), today) : null;
  const guards = (["food", "household"] as const).map((x) => guard(k, b, today, x)).filter((g): g is [string, string] => Boolean(g));
  const planned = k.mealCount(entries);
  const items = [...k.names].sort((a, b2) => (a[1].toLowerCase() < b2[1].toLowerCase() ? -1 : 1))
    .map(([i, n]) => ({ id: i, name: n, units: unitsFor(k.unitOf.get(i) ?? "pcs", k.pack(i)) }));
  // what one unit of each extra item costs, for its estimate (worked out here: the packs and prices stay on the server)
  const unitPrice: Record<string, number> = {};
  for (const it of items) for (const u of it.units) {
    const [q, base] = toBase(1, u, k.pack(it.id));
    const per = k.prices.get(`${it.id}|${base}`);
    if (per !== undefined) unitPrice[`${it.id}|${u}`] = per * q;
  }
  const extraCat = Object.fromEntries(items.map((it) => [it.id, (c => (c && cats.includes(c) ? c : fallback))(k.categoryOf.get(it.id))]));
  return (
    <>
      {head}
      <div className="seg mb-4 max-w-lg" role="group" aria-label="For">
        {SCOPES.map(([d, label]) => <Link key={d} href={`/shopping?days=${d}`} role="button" aria-pressed={Number(d) === days}>{label}</Link>)}
      </div>
      {rows.length || pickLines.length ? (
        <div className="card mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted">This list, from past prices</div>
              <div className="num text-xl font-bold">about {money(listEst)}</div>
              {unpriced ? <div className="text-xs text-muted">+ {unpriced} item{unpriced === 1 ? "" : "s"} with no price yet</div> : null}
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Food budget left this month</div>
              {food ? (
                <div className={`num text-xl font-bold ${food.limit - food.spent - listEst < 0 ? "text-out" : "text-in"}`}>{money(food.limit - food.spent)}</div>
              ) : <Link className="text-sm font-semibold" href="/budgets">Set a food budget</Link>}
            </div>
          </div>
          {food ? (
            <>
              <div className="bar mt-3" role="progressbar" aria-label="Food budget with this list" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(((food.spent + listEst) / food.limit) * 100)}>
                {/* spent so far, then this list on top of it */}
                <div className="flex h-full">
                  <div className="fill" style={{ width: `${Math.min((food.spent / food.limit) * 100, 100).toFixed(1)}%`, borderRadius: 0 }} />
                  <div className={`fill ${food.spent + listEst > food.limit ? "over" : "warn"}`}
                    style={{ width: `${Math.max(Math.min((listEst / food.limit) * 100, 100 - (food.spent / food.limit) * 100), 0).toFixed(1)}%`, borderRadius: 0 }} />
                </div>
              </div>
              <p className="caption mb-0 mt-1.5">
                {food.limit - food.spent - listEst >= 0
                  ? `After this list, about ${money(food.limit - food.spent - listEst)} would be left of the ${money(food.limit)} food budget.`
                  : `This list would go about ${money(food.spent + listEst - food.limit)} over the ${money(food.limit)} food budget.`}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      {guards.map((g, i) => <Msg key={i} tone={g[0] as "warn"}>{g[1]}</Msg>)}
      <ShoppingList key={`${days}-${rows.length}`} rows={rows.map((r) => ({ ...r, label: qtyLabel(r.amount, r.unit) }))} categories={cats}
        accounts={b.accountNames} account={b.defaultAccount("Expense")} shops={k.shops()} today={today} items={items} unitPrice={unitPrice}
        extraCat={extraCat} scope={`${aD(today)} to ${aD(end)}: ${planned} meal${planned === 1 ? "" : "s"} not cooked yet`}
        empty={entries.length ? "Nothing to buy: the pantry and fridge already cover the planned meals." : "No meals planned for these days yet. Plan some on the meal plan."}
        month={monthOf(today)} />
      {pickLines.length ? (
        <div className="card" style={{ marginTop: "1rem" }}>
          <Section title="Pick up on the day" aside={`about ${money(pickTotal)}${pickUnknown ? ` + ${pickUnknown} unpriced` : ""}`} />
          {pickLines.map((l) => <div key={l.key} className="prog-head"><span>{l.text}</span><b className="num">{l.cost === null ? "?" : money(l.cost)}</b></div>)}
          <p className="caption">Bought ready-made, so not on the market list. Tap Bought on the meal plan when you pay; it&apos;s saved as an expense.</p>
        </div>
      ) : null}
      {k.trips.length ? (
        <div className="card" style={{ marginTop: "1rem" }}>
          <Section title="Recent trips" />
          {k.trips.map((t) => (
            <div key={t.id} className="prog-head"><span>{aD(t.date)}{t.shop ? `, ${t.shop}` : ""}, {t.items} item{t.items === 1 ? "" : "s"}</span>
              <b className="num">{money(t.total)}</b></div>
          ))}
        </div>
      ) : null}
    </>
  );
}
