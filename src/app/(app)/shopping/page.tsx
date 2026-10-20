import Link from "next/link";
import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { Empty, Msg, Section } from "@/components/ui";
import { addDays, monthOf, today as todayISO } from "@/lib/dates";
import { guard } from "@/lib/kitchen/kitchen";
import { loadKitchen } from "@/lib/kitchen/load";
import { aD, SLOTS } from "@/lib/kitchen/logic";
import { listRows, qtyLabel, shoppingRows } from "@/lib/kitchen/shopping";
import { frac, isLoose, plural, toBase, unitsFor } from "@/lib/kitchen/units";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { PriceChart } from "./PriceChart";
import { ShoppingList } from "./ShoppingList";

export const metadata = { title: "Shopping list" };
const SCOPES = [["7", "Next 7 days"], ["14", "Next 14 days"], ["2", "Today and tomorrow"]] as const;

export default async function Shopping({ searchParams }: { searchParams: Promise<{ days?: string; view?: string }> }) {
  const [k, b, sp] = await Promise.all([loadKitchen(), loadBook(), searchParams]);
  const today = todayISO();
  const cats = b.categoryNames("Expense");
  const fallback = cats.includes("Staples") ? "Staples" : cats[0] ?? "";
  const head = <KitchenHead current="/shopping" title="Shopping list" sub="What the planned meals need, minus what's already in the pantry and fridge" />;
  const views = (
    <div className="seg" role="group" aria-label="View" style={{ maxWidth: 320, marginBottom: ".8rem" }}>
      <Link href="/shopping" role="button" aria-pressed={sp.view !== "prices"}>List</Link>
      <Link href="/shopping?view=prices" role="button" aria-pressed={sp.view === "prices"}>Prices</Link>
    </div>
  );
  if (sp.view === "prices") return <>{head}{views}<Prices k={k} /></>;

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
      {head}{views}
      <div className="seg" role="group" aria-label="For" style={{ maxWidth: 520, marginBottom: "1rem" }}>
        {SCOPES.map(([d, label]) => <Link key={d} href={`/shopping?days=${d}`} role="button" aria-pressed={Number(d) === days}>{label}</Link>)}
      </div>
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

/** What things cost, and where it's cheaper: prices per bag, per kg, per crate, from saved trips. */
function Prices({ k }: { k: Awaited<ReturnType<typeof loadKitchen>> }) {
  if (!k.history.length) return <div className="card"><Empty>Prices show here after your first saved shopping trip.</Empty></div>;
  const scaleOf = (ing: number, base: string): [number, string] => {
    const pack = k.pack(ing);
    if (pack && pack[2] === base && !isLoose(pack)) return [pack[1], pack[0]];
    const usual = k.unitOf.get(ing) ?? base;
    return [toBase(1, usual)[0], usual];
  };
  const groups = new Map<string, typeof k.history>();
  for (const h of k.history) groups.set(`${h.ingredientId}|${h.unit}`, [...(groups.get(`${h.ingredientId}|${h.unit}`) ?? []), h]);
  const table = [...groups].map(([key, g]) => {
    const [ing, base] = [Number(key.split("|")[0]), key.split("|")[1]];
    const [scale, per] = scaleOf(ing, base);
    const last = g[g.length - 1].perUnit * scale;
    const prev = g.length > 1 ? g[g.length - 2].perUnit * scale : null;
    const shops = new Map<string, number[]>();
    for (const h of g) if (h.shop) shops.set(h.shop, [...(shops.get(h.shop) ?? []), h.perUnit * scale]);
    const avg = [...shops].map(([s, v]) => [s, v.reduce((a, x) => a + x, 0) / v.length] as const).sort((a, b) => a[1] - b[1]);
    const change = prev ? ((last - prev) / prev) * 100 : null;
    // the monthly average, for the chart
    const months = new Map<string, number[]>();
    for (const h of g) months.set(monthOf(h.date), [...(months.get(monthOf(h.date)) ?? []), h.perUnit * scale]);
    return { name: k.names.get(ing) ?? "?", per, last, change, cheapest: avg.length > 1 ? `${avg[0][0]} (${money(avg[0][1])})` : "",
      times: g.length, series: [...months].map(([m, v]) => [m, v.reduce((a, x) => a + x, 0) / v.length] as [string, number]) };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
  const trend = table.filter((t) => t.series.length >= 2).sort((a, b) => b.times - a.times)
    .map((t) => ({ name: `${t.name} (per ${t.per})`, points: t.series }));
  return (
    <div className="stack">
      <div className="card">
        <Section title="What things cost" />
        {trend.length ? <PriceChart series={trend} /> : <p className="caption">Price trends appear once you&apos;ve bought the same item in two different months.</p>}
      </div>
      <div className="card">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Item</th><th className="r">Last price</th><th className="r">Change</th><th>Cheapest at</th><th className="r">Times bought</th></tr></thead>
          <tbody>{table.map((t) => (
            <tr key={t.name + t.per}><td>{t.name}</td><td className="r num">{money(t.last)} / {t.per}</td>
              <td className="r num">{t.change !== null && Math.abs(t.change) >= 1 ? `${t.change > 0 ? "+" : ""}${t.change.toFixed(0)}%` : ""}</td>
              <td>{t.cheapest}</td><td className="r num">{t.times}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="caption">Change compares the last two trips. Cheapest at needs the same item bought at two or more places.</p>
      </div>
    </div>
  );
}
