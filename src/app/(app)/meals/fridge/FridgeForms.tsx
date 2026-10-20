"use client";
import { useState, type ReactNode } from "react";
import { addToFridge, eatPortion, setPortions, throwAway } from "@/actions/kitchen";
import { Confirm } from "@/components/Sheet";
import { Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { addDays } from "@/lib/dates";

export function FridgeRow({ id, portions, unit, each, title, meta }: {
  id: number; portions: number; unit: string; each: number | null; title: ReactNode; meta: string;
}) {
  const [busy, act] = useAct();
  const [n, setN] = useState(String(portions));
  const [asking, setAsking] = useState(false);
  return (
    <div className="rule">
      <div style={{ minWidth: 0 }}><div className="rule-name">{title}</div><div className="rule-meta">{meta}</div></div>
      <div className="stepper">
        <input className="input cell-input" type="number" min="0" step="0.5" aria-label="Portions left" value={n}
          onChange={(e) => setN(e.target.value)}
          onBlur={() => Number(n) !== portions && n !== "" && act(() => setPortions(id, Number(n)))} />
        <button type="button" className="btn small" disabled={busy || portions <= 0} title={`One ${unit} eaten`}
          onClick={() => act(() => eatPortion(id, Math.min(1, portions)), () => setN(String(Math.max(portions - 1, 0))))}>
          {portions >= 1 ? "Ate 1" : "Ate the rest"}</button>
        <button type="button" className="btn ghost small" aria-label="Thrown away" title="Thrown away: logged as food waste"
          onClick={() => setAsking(true)}>🗑</button>
      </div>
      <Confirm open={asking} busy={busy} button="Thrown away" onCancel={() => setAsking(false)}
        message="Log what's left as thrown away? It's kept as food waste, with its estimated cost."
        onConfirm={() => act(() => throwAway(id, each), () => setAsking(false))} />
    </div>
  );
}

export function AddToFridge({ today, units, recipes }: { today: string; units: string[]; recipes: { id: number; name: string; keeps: number }[] }) {
  const [busy, act] = useAct();
  const [rid, setRid] = useState("");
  const [label, setLabel] = useState("");
  const [n, setN] = useState("2");
  const [unit, setUnit] = useState(units[0]);
  const r = recipes.find((x) => String(x.id) === rid);
  const [eatBy, setEatBy] = useState(addDays(today, 3));
  const name = r ? r.name : label.trim();
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); act(() => addToFridge(name, Number(n), eatBy, r ? r.id : null, unit), () => setLabel("")); }}>
      <Section title="Put something in the fridge" />
      <label className="field"><span>Dish</span>
        <select className="input" value={rid} onChange={(e) => {
          setRid(e.target.value);
          const x = recipes.find((y) => String(y.id) === e.target.value);
          setEatBy(addDays(today, x ? x.keeps : 3));
        }}>
          <option value="">Something else</option>
          {recipes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      {!r ? <label className="field"><span>What is it?</span><input className="input" placeholder="e.g. Shito" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} /></label> : null}
      <div className="row2">
        <label className="field"><span>How many</span><input className="input" type="number" min="1" step="1" value={n} onChange={(e) => setN(e.target.value)} /></label>
        <label className="field"><span>Counted in</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
      </div>
      <label className="field"><span>Eat by</span><input className="input" type="date" value={eatBy} onChange={(e) => e.target.value && setEatBy(e.target.value)} /></label>
      {eatBy < today ? <Msg tone="warn">That eat-by date has already passed.</Msg> : null}
      <button className="btn primary wide" disabled={!name || !(Number(n) > 0) || busy}>Add to fridge</button>
    </form>
  );
}
