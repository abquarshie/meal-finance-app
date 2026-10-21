"use client";
// Market mode: big tick boxes, one item at a time. Tick what you bought, say what you paid, save the trip.
import { useState, useTransition } from "react";
import { saveTrip } from "@/actions/kitchen";
import { safe } from "@/components/safe";
import { useToast } from "@/components/Toaster";
import { Empty, Msg, Section } from "@/components/ui";
import { CURRENCY, money } from "@/lib/money";
import type { ListRow } from "@/lib/kitchen/shopping";

type Row = ListRow & { label: string };
type Item = { id: number; name: string; units: string[] };
type Pick = { got: boolean; amount: string; price: string };

export function ShoppingList({ rows: planned, categories, accounts, account: firstAccount, shops, today, items, unitPrice, extraCat,
  scope, empty, month }: {
  rows: Row[]; categories: string[]; accounts: string[]; account: string | null; shops: string[]; today: string; items: Item[];
  unitPrice: Record<string, number>; extraCat: Record<number, string>; scope: string; empty: string; month: string;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [extras, setExtras] = useState<Row[]>([]);
  const rows = [...planned, ...extras];
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [account, setAccount] = useState(firstAccount ?? accounts[0] ?? "");
  const [shop, setShop] = useState("");
  const [day, setDay] = useState(today);
  const [extra, setExtra] = useState({ ing: "", qty: "", unit: "" });
  void month;
  const pick = (i: number): Pick => picks[i] ?? { got: false, amount: String(rows[i].amount), price: "" };
  const set = (i: number, p: Partial<Pick>) => setPicks({ ...picks, [i]: { ...pick(i), ...p } });

  const lines: { ingredientId: number; name: string; qty: number; unit: string; price: number; category: string }[] = [];
  const missing: string[] = [];
  rows.forEach((r, i) => {
    const p = pick(i);
    if (!p.got) return;
    if (!(Number(p.price) > 0)) missing.push(r.name);
    else if (Number(p.amount) > 0) lines.push({ ingredientId: r.ing, name: r.name, qty: Number(p.amount), unit: r.unit, price: Number(p.price), category: r.category });
  });
  const total = Math.round(lines.reduce((a, l) => a + l.price, 0) * 100) / 100;
  const byCat = new Map<string, number>();
  for (const l of lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.price);
  const known = rows.filter((r) => r.est !== null);
  const text = "🛒 Shopping list\n" + rows.map((r) => `- ${r.name}: ${r.label}`).join("\n");
  const item = items.find((x) => String(x.id) === extra.ing);

  function save() {
    start(async () => {
      // amounts are in the unit shown; the server turns them into base units with the item's own packs
      const r = await safe(() => saveTrip(day, account, lines.map((l) => ({ ingredientId: l.ingredientId, name: l.name, qty: l.qty,
        unit: l.unit, price: l.price, category: l.category })), shop));
      if (!r.ok) return toast(r.error, { tone: "warn" });
      toast(r.message);
      for (const [name, , , ch] of r.changes.slice(0, 4)) {
        toast(`${name} cost ${Math.abs(ch * 100).toFixed(0)}% ${ch > 0 ? "more" : "less"} than last time`, { tone: "warn" });
      }
      setPicks({});
      setExtras([]);
      setShop("");
    });
  }

  return (
    <div className="grid32">
      <div className="card">
        <Section title="To buy" />
        <p className="caption" style={{ marginTop: "-.4rem" }}>{scope}</p>
        {!rows.length ? <Empty>{empty}</Empty> : rows.map((r, i) => {
          const p = pick(i);
          return (
            <div className="mk-row" key={`${r.ing}-${i}`}>
              <label className="check"><input type="checkbox" checked={p.got} onChange={(e) => {
                const est = r.est !== null ? String(Math.round(r.est * 100) / 100) : "";
                set(i, { got: e.target.checked, price: p.price || est });
              }} />{r.name} · {r.label}</label>
              {r.why && !p.got ? <div className="mk-why">{r.why}</div> : null}
              {p.got ? (
                <div className="row2">
                  <label className="field"><span>How many ({r.unit})</span>
                    <input className="input" type="number" min="0" step="0.5" value={p.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                  </label>
                  <label className="field"><span>Paid ({CURRENCY})</span>
                    <input className="input" type="number" min="0" step="0.5" inputMode="decimal" placeholder="0.00" value={p.price}
                      onChange={(e) => set(i, { price: e.target.value })} />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
        {known.length ? <p className="caption">Estimated cost of the whole list from past prices: about {money(known.reduce((a, r) => a + r.est!, 0))}
          {known.length < rows.length ? ` (no price yet for ${rows.length - known.length})` : ""}</p> : null}
        {rows.length ? (
          <div className="btns" style={{ marginTop: ".6rem" }}>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send the list on WhatsApp</a>
            <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(text).then(() => toast("List copied"))}>Copy the list</button>
          </div>
        ) : null}
      </div>
      <div className="stack">
        <div className="card form">
          <Section title="Save the shopping trip" />
          {!lines.length && !missing.length ? <Msg tone="hint">{rows.length ? "Tick what you bought." : "Nothing ticked yet."}</Msg> : (
            <>
              <div className="field" role="group" aria-label="Paid from"><span>Paid from</span>
                <div className="chips">{accounts.map((a) => <button key={a} type="button" className="chip" aria-pressed={a === account} onClick={() => setAccount(a)}>{a}</button>)}</div>
              </div>
              <label className="field"><span>Where (optional)</span>
                <input className="input" list="shops" placeholder="e.g. Makola, Shoprite" maxLength={60} value={shop} onChange={(e) => setShop(e.target.value)} />
                <datalist id="shops">{shops.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="field"><span>Date</span>
                <input className="input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </label>
              {[...byCat].sort((a, b) => b[1] - a[1]).map(([c, v]) => <div key={c} className="prog-head"><span>{c}</span><b className="num">{money(v)}</b></div>)}
              {missing.length ? <Msg>Enter what you paid for: {missing.slice(0, 6).join(", ")}{missing.length > 6 ? "…" : ""}</Msg> : null}
              <button type="button" className="btn primary wide" disabled={busy || !lines.length || missing.length > 0 || !account || total <= 0}
                onClick={save}>Save trip · {money(total)}</button>
            </>
          )}
          <p className="caption">Saving puts what you bought into the pantry, remembers the prices, and logs the cost as expenses, one per category.</p>
        </div>
        <div className="card form">
          <Section title="Add something not on the list" />
          <select className="input" aria-label="Item" value={extra.ing} onChange={(e) => {
            const it = items.find((x) => String(x.id) === e.target.value);
            setExtra({ ing: e.target.value, qty: extra.qty, unit: it?.units[0] ?? "" });
          }}>
            <option value="">Choose an item</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
          <div className="row2">
            <input className="input" aria-label="Amount" type="number" min="0" step="0.5" placeholder="Amount" value={extra.qty}
              onChange={(e) => setExtra({ ...extra, qty: e.target.value })} />
            <select className="input" aria-label="Unit" value={extra.unit} onChange={(e) => setExtra({ ...extra, unit: e.target.value })}>
              {(item?.units ?? ["pcs"]).map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div><button type="button" className="btn" disabled={!item || !(Number(extra.qty) > 0)} onClick={() => {
            const q = Number(extra.qty);
            const per = unitPrice[`${item!.id}|${extra.unit}`];
            setExtras([...extras, { ing: item!.id, name: item!.name, amount: q, unit: extra.unit, label: `${q} ${extra.unit}`,
              est: per !== undefined ? Math.round(per * q * 100) / 100 : null, category: extraCat[item!.id] ?? categories[0], why: "Added by you" }]);
            setExtra({ ing: "", qty: "", unit: "" });
          }}>Add to list</button></div>
        </div>
      </div>
    </div>
  );
}
