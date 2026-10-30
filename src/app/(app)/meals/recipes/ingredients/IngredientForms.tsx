"use client";
import { useState } from "react";
import { addIngredient, deleteIngredient, updateIngredients } from "@/actions/recipes";
import { Confirm } from "@/components/Sheet";
import { Empty, Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { baseOf, CONTAINERS, plural, toBase, UNITS } from "@/lib/kitchen/units";

export type IngRow = { id: number; name: string; unit: string; category: string; pack: string; holds: number | null; loose: boolean;
  low: number | null; section: string; other: string; stock: string; lines: number; removable: boolean };
type Edit = { name: string; unit: string; category: string; pack: string; holds: string; loose: boolean; low: string };

const edit = (r: IngRow): Edit => ({ name: r.name, unit: r.unit, category: r.category, pack: r.pack, holds: r.holds === null ? "" : String(r.holds),
  loose: r.loose, low: r.low === null ? "" : String(r.low) });

export function IngredientForms({ rows, categories, sections }: { rows: IngRow[]; categories: string[]; sections: string[] }) {
  return (
    <div className="stack">
      <Add categories={categories} taken={rows.map((r) => r.name.toLowerCase())} />
      <List rows={rows} categories={categories} sections={sections} />
    </div>
  );
}

function Add({ categories, taken }: { categories: string[]; taken: string[] }) {
  const [busy, act] = useAct();
  const blank = { name: "", unit: "pcs", category: categories.includes("Staples") ? "Staples" : categories[0] ?? "", pack: "", size: "", loose: false, low: "" };
  const [v, setV] = useState(blank);
  const clash = taken.includes(v.name.trim().toLowerCase());
  const badPack = Boolean(v.pack) && (!v.size || v.pack === v.unit);
  return (
    <form className="card form" onSubmit={(e) => {
      e.preventDefault();
      act(() => addIngredient({ name: v.name, unit: v.unit, category: v.category || null, lowLevel: v.low ? toBase(Number(v.low), v.unit)[0] : null,
        packName: v.pack || null, packSize: v.pack && v.size ? toBase(Number(v.size), v.unit)[0] : null, loose: Boolean(v.pack && v.loose) }), () => setV(blank));
    }}>
      <Section title="Add an ingredient" />
      <label className="field"><span>Name</span><input className="input" maxLength={60} placeholder="e.g. Groundnut paste" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      {clash ? <Msg>{v.name.trim()} is already in your list.</Msg> : null}
      <div className="row2">
        <label className="field"><span>Base unit (counted and used in)</span><select className="input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })}>
          {UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="field"><span>Money category</span><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
          {categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <details className="more" open={Boolean(v.pack || v.low) || undefined}>
        <summary>Bought in a crate, bag or tin? Low-stock warning?</summary>
        <div className="form">
          <div className="row2">
            <label className="field"><span>Purchase unit</span><select className="input" value={v.pack} onChange={(e) => setV({ ...v, pack: e.target.value })}>
              <option value="">Loose / as counted</option>{CONTAINERS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field"><span>1 {v.pack || "purchase unit"} = how many {plural(v.unit)}</span>
              <input className="input" type="number" min="0" step="any" disabled={!v.pack} value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" disabled={!v.pack} checked={v.loose} onChange={(e) => setV({ ...v, loose: e.target.checked })} /> Also sold loose</label>
          <label className="field"><span>Warn me when stock is down to ({v.unit})</span>
            <input className="input" type="number" min="0" step="any" value={v.low} onChange={(e) => setV({ ...v, low: e.target.value })} /></label>
        </div>
      </details>
      {v.pack && !v.size ? <Msg tone="hint">Say how much one {v.pack} holds, so the app can count in {plural(v.pack)}.</Msg> : null}
      {v.pack && v.pack === v.unit ? <Msg>Pick a different container from the base unit, or leave it as loose.</Msg> : null}
      <div><button className="btn primary" disabled={!v.name.trim() || clash || badPack || busy}>Add ingredient</button></div>
    </form>
  );
}

function List({ rows, categories, sections }: { rows: IngRow[]; categories: string[]; sections: string[] }) {
  const [busy, act] = useAct();
  const shelves = sections.filter((s) => rows.some((r) => r.section === s));
  const [shelf, setShelf] = useState("All");
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [drop, setDrop] = useState<IngRow | null>(null);
  const view = rows.filter((r) => shelf === "All" || (shelf === "Other" ? !sections.includes(r.section) : r.section === shelf));
  const changed = rows.filter((r) => edits[r.id] && JSON.stringify(edits[r.id]) !== JSON.stringify(edit(r)));
  const set = (r: IngRow, x: Partial<Edit>) => setEdits({ ...edits, [r.id]: { ...(edits[r.id] ?? edit(r)), ...x } });
  const warnings = changed.map((r) => {
    const e = edits[r.id];
    if (baseOf(e.unit) === baseOf(r.unit) || (!r.stock && !r.lines)) return null;
    const what = [r.stock ? `its ${r.stock} in the pantry` : "", r.lines ? `${r.lines} recipe line${r.lines === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    return `${r.name}: ${r.unit} and ${e.unit} don't convert, so ${what} will still be in ${r.unit}. Update them after saving.`;
  }).filter(Boolean) as string[];
  const names = rows.map((r) => (edits[r.id]?.name ?? r.name).trim().toLowerCase());
  const nameProblem = new Set(names).size !== names.length || names.includes("") ? "Each ingredient needs its own name." : null;
  const noSize = changed.filter((r) => edits[r.id].pack && !(Number(edits[r.id].holds) > 0)).map((r) => edits[r.id].name);
  return (
    <div className="card">
      <Section title="Your ingredients" aside={String(rows.length)} />
      {shelves.length ? (
        <div className="chips" role="group" aria-label="Shelf" style={{ marginBottom: ".6rem" }}>
          {["All", ...shelves, "Other"].map((s) => <button key={s} type="button" className="chip" aria-pressed={s === shelf} onClick={() => setShelf(s)}>{s}</button>)}
        </div>
      ) : null}
      {!view.length ? <Empty>{rows.length ? "Nothing on this shelf." : "Nothing yet. Add one above, or load the starter recipes."}</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Base unit</th><th>Money category</th><th>Purchase unit</th><th>Holds</th><th>Loose</th><th>Warn at</th><th>Other units</th><th /></tr></thead>
          <tbody>{view.map((r) => {
            const e = edits[r.id] ?? edit(r);
            return (
              <tr key={r.id}>
                <td><input className="input cell-input" style={{ width: "12rem" }} aria-label={`${r.name} name`} value={e.name} onChange={(x) => set(r, { name: x.target.value })} /></td>
                <td><select className="input cell-input" aria-label={`${r.name} base unit`} value={e.unit} onChange={(x) => set(r, { unit: x.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                <td><select className="input cell-input" style={{ width: "10rem" }} aria-label={`${r.name} money category`} value={e.category} onChange={(x) => set(r, { category: x.target.value })}>
                  <option value="">—</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></td>
                <td><select className="input cell-input" aria-label={`${r.name} purchase unit`} value={e.pack} onChange={(x) => set(r, { pack: x.target.value })}>
                  <option value="">—</option>{CONTAINERS.map((c) => <option key={c}>{c}</option>)}</select></td>
                <td><input className="input cell-input" type="number" min="0" step="any" aria-label={`${r.name} holds`} value={e.holds} onChange={(x) => set(r, { holds: x.target.value })} /></td>
                <td><input type="checkbox" aria-label={`${r.name} sold loose`} checked={e.loose} onChange={(x) => set(r, { loose: x.target.checked })} /></td>
                <td><input className="input cell-input" type="number" min="0" step="any" aria-label={`${r.name} warn at`} value={e.low} onChange={(x) => set(r, { low: x.target.value })} /></td>
                <td className="muted">{r.other}</td>
                <td>{r.removable ? <button type="button" className="btn ghost small" aria-label={`Remove ${r.name}`} onClick={() => setDrop(r)}>✕</button> : null}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {changed.length ? (
        <div className="card savebar" style={{ marginTop: ".8rem" }}>
          <b>{changed.length} change{changed.length === 1 ? "" : "s"} not saved yet</b>
          {warnings.map((w, i) => <Msg key={i} tone="warn">{w}</Msg>)}
          {nameProblem ? <Msg>{nameProblem}</Msg> : noSize.length ? <Msg>Say how much each purchase unit holds for: {noSize.join(", ")}</Msg> : null}
          <button type="button" className="btn primary" disabled={busy || Boolean(nameProblem) || noSize.length > 0} onClick={() => act(() => updateIngredients(changed.map((r) => {
            const e = edits[r.id];
            return { id: r.id, name: e.name, unit: e.unit, category: e.category || null, packName: e.pack || null,
              packSize: e.pack ? toBase(Number(e.holds), e.unit)[0] : null, loose: Boolean(e.pack && e.loose), lowLevel: e.low ? toBase(Number(e.low), e.unit)[0] : null };
          })), () => setEdits({}))}>Save</button>
          <button type="button" className="btn ghost" onClick={() => setEdits({})}>Discard</button>
        </div>
      ) : null}
      <p className="caption">Base unit is what recipes and the pantry count in; the purchase unit is what you bring home. A tin of Lele Gold milk is 16 tbsp, a bag of A55 rice is 25 cups. Only items not used in any recipe or plan can be removed.</p>
      <Confirm open={drop !== null} busy={busy} button="Remove" onCancel={() => setDrop(null)}
        message={`Remove ${drop?.name}? Its pantry stock and prices go too. Meals it was part of stay in the history.`}
        onConfirm={() => drop && act(() => deleteIngredient(drop.id), () => setDrop(null))} />
    </div>
  );
}
