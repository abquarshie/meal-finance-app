"use client";
import { useState } from "react";
import { adjustStock } from "@/actions/kitchen";
import { setBudget } from "@/actions/plan";
import { addIngredient, addStarterSupplies } from "@/actions/recipes";
import { Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { CONTAINERS, toBase } from "@/lib/kitchen/units";
import { CURRENCY } from "@/lib/money";

const UNITS = ["pcs", "ml", "l", "g", "kg"];

export function Stepper({ ing, base, step, stepName, have }: { ing: number; base: string; step: number; stepName: string; have: number }) {
  const [busy, act] = useAct();
  return (
    <div className="stepper">
      <button type="button" className="btn small" aria-label={`One ${stepName} used up`} title={`One ${stepName} used up`} disabled={busy || have <= 0}
        onClick={() => act(() => adjustStock(ing, base, -step))}>−</button>
      <button type="button" className="btn small" aria-label={`One more ${stepName}`} title={`One more ${stepName}`} disabled={busy}
        onClick={() => act(() => adjustStock(ing, base, step))}>+</button>
    </div>
  );
}

export function StarterSupplies() {
  const [busy, act] = useAct();
  return (
    <div className="card form" style={{ marginBottom: "1rem" }}>
      <Section title="Start your list" />
      <p style={{ margin: 0 }}>Add the everyday things most homes keep: washing powder, dishwashing liquid, bleach, disinfectant, toilet roll,
        bathing soap, bar soap, sponges and bin bags. Change anything after.</p>
      <div><button type="button" className="btn primary" disabled={busy} onClick={() => act(() => addStarterSupplies())}>Add common household items</button></div>
    </div>
  );
}

export function BudgetSetter({ target }: { target: string }) {
  const [busy, act] = useAct();
  const [limit, setLimit] = useState("");
  return (
    <>
      <p style={{ margin: 0 }}>No budget for household supplies yet. Set a monthly limit for <b>{target}</b>, kept separate from food.</p>
      <div className="btns">
        <input className="input" style={{ maxWidth: 180 }} type="number" min="0" step="10" placeholder="e.g. 300" aria-label={`Monthly limit (${CURRENCY})`}
          value={limit} onChange={(e) => setLimit(e.target.value)} />
        <button type="button" className="btn primary" disabled={!(Number(limit) > 0) || busy} onClick={() => act(() => setBudget(target, Number(limit)))}>Set budget</button>
      </div>
    </>
  );
}

export function AddSupply({ categories, taken }: { categories: string[]; taken: string[] }) {
  const [busy, act] = useAct();
  const blank = { name: "", unit: "pcs", category: categories[0], pack: "", size: "", low: "" };
  const [v, setV] = useState(blank);
  const clash = taken.includes(v.name.trim().toLowerCase());
  return (
    <form className="card form" onSubmit={(e) => {
      e.preventDefault();
      act(() => addIngredient({ name: v.name, unit: v.unit, category: v.category, lowLevel: v.low ? toBase(Number(v.low), v.unit)[0] : null,
        packName: v.pack || null, packSize: v.pack && v.size ? toBase(Number(v.size), v.unit)[0] : null }, "household"), () => setV(blank));
    }}>
      <Section title="Add a household item" />
      <label className="field"><span>Name</span><input className="input" maxLength={60} placeholder="e.g. Mosquito coil" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      {clash ? <Msg>{v.name} is already in your list.</Msg> : null}
      <div className="row2">
        <label className="field"><span>Counted in</span><select className="input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="field"><span>Money category</span><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="row2">
        <label className="field"><span>Bought in</span><select className="input" value={v.pack} onChange={(e) => setV({ ...v, pack: e.target.value })}>
          <option value="">Loose / as counted</option>{CONTAINERS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>Each {v.pack || "one"} holds ({v.unit})</span>
          <input className="input" type="number" min="0" step="any" disabled={!v.pack} value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} /></label>
      </div>
      <label className="field"><span>Warn me when down to ({v.unit})</span><input className="input" type="number" min="0" step="any" value={v.low} onChange={(e) => setV({ ...v, low: e.target.value })} /></label>
      {v.pack && !v.size ? <Msg tone="hint">Say how much one {v.pack} holds.</Msg> : null}
      <button className="btn primary wide" disabled={!v.name.trim() || clash || Boolean(v.pack && !v.size) || busy}>Add item</button>
    </form>
  );
}
