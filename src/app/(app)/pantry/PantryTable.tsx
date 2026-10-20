"use client";
import { useState } from "react";
import { setStock } from "@/actions/kitchen";
import { Empty, Pill, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";

export type StockRow = { ing: number; base: string; name: string; unit: string; stock: number; shelf: string; status: string;
  warn: string; price: string; perUnit: number };

export function PantryTable({ rows }: { rows: StockRow[] }) {
  const [busy, act] = useAct();
  const [onlyLow, setOnlyLow] = useState(false);
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const view = rows.filter((r) => (!onlyLow || r.status) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const changed = rows.filter((r) => {
    const v = edits[`${r.ing}|${r.base}`];
    return v !== undefined && v !== "" && Math.abs(Number(v) - r.stock) > 1e-9;
  });
  return (
    <div className="card">
      <Section title="Pantry" aside={`${rows.filter((r) => r.status === "Low").length} low, ${rows.filter((r) => r.status === "Out").length} out`} />
      <div className="btns" style={{ marginBottom: ".6rem" }}>
        <input className="input" type="search" aria-label="Find an item" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <label className="check"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Only what&apos;s low or out</label>
      </div>
      {!view.length ? <Empty>{onlyLow ? "Nothing is low. Good stocking!" : "Nothing matches."}</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Item</th><th>In stock</th><th>On the shelf</th><th>Status</th><th>Warn at</th><th>Last price</th></tr></thead>
          <tbody>{view.map((r) => {
            const key = `${r.ing}|${r.base}`;
            return (
              <tr key={key}>
                <td>{r.name}</td>
                <td><input className="input cell-input" type="number" min="0" step="any" aria-label={`${r.name} in stock (${r.unit})`}
                  value={edits[key] ?? String(r.stock)} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} /> <span className="muted">{r.unit}</span></td>
                <td>{r.shelf}</td>
                <td>{r.status ? <Pill tone={r.status === "Out" ? "out" : "warn"}>{r.status}</Pill> : null}</td>
                <td>{r.warn}</td><td>{r.price}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {changed.length ? (
        <div className="card savebar" style={{ marginTop: ".8rem" }}>
          <b>{changed.length} stock change{changed.length === 1 ? "" : "s"} not saved yet</b>
          <button type="button" className="btn primary" disabled={busy} onClick={() => act(() => setStock(changed.map((r) => ({
            ingredientId: r.ing, base: r.base, qty: Number(edits[`${r.ing}|${r.base}`]) * r.perUnit }))), () => setEdits({}))}>Save</button>
          <button type="button" className="btn ghost" onClick={() => setEdits({})}>Discard</button>
        </div>
      ) : null}
      <p className="caption">Shopping adds to these amounts and cooking takes from them. Correct a number any time; set warning levels under Recipes → Ingredients.</p>
    </div>
  );
}
