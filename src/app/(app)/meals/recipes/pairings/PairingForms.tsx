"use client";
import { useState } from "react";
import { addCatalog, deletePairing, savePairing } from "@/actions/recipes";
import { Confirm } from "@/components/Sheet";
import { Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";

const ORDER: Record<string, number> = { starch: 0, soup: 1, stew: 1, sauce: 1, main: 2, side: 3 };

export function PairingForms({ dishes, sides, pairings }: {
  dishes: { id: number; name: string; role: string }[]; sides: { id: number; name: string; units: string[] }[]; pairings: { id: number; name: string }[];
}) {
  const [busy, act] = useAct();
  const [picked, setPicked] = useState<number[]>([]);
  const [side, setSide] = useState("");
  const [sideQty, setSideQty] = useState("0.5");
  const [sideUnit, setSideUnit] = useState("");
  const [name, setName] = useState("");
  const [drop, setDrop] = useState(pairings[0]?.id ?? 0);
  const [asking, setAsking] = useState(false);
  const s = sides.find((x) => String(x.id) === side);
  const auto = [...picked.map((i) => dishes.find((d) => d.id === i)!)].sort((a, b) => (ORDER[a.role] ?? 2) - (ORDER[b.role] ?? 2))
    .map((d) => d.name).concat(s ? [s.name] : []).join(" + ");
  const final = (name || auto).trim();
  const clash = pairings.some((p) => p.name.toLowerCase() === final.toLowerCase());
  const enough = picked.length + (s ? 1 : 0) >= 2;
  const dropName = pairings.find((p) => p.id === drop)?.name ?? pairings[0]?.name;
  return (
    <div className="stack">
      <div className="card form">
        <Section title="Make a pairing" />
        <label className="field"><span>Dishes eaten together</span>
          <select className="input" value="" onChange={(e) => e.target.value && !picked.includes(Number(e.target.value)) && setPicked([...picked, Number(e.target.value)])}>
            <option value="">e.g. Banku, Okra soup</option>{dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        {picked.length ? <div className="chips">{picked.map((i) => (
          <button key={i} type="button" className="chip" aria-pressed="true" onClick={() => setPicked(picked.filter((x) => x !== i))}>{dishes.find((d) => d.id === i)?.name} ✕</button>
        ))}</div> : null}
        <label className="field"><span>Eaten with (optional)</span>
          <select className="input" value={side} onChange={(e) => { setSide(e.target.value); setSideUnit(sides.find((x) => String(x.id) === e.target.value)?.units[0] ?? ""); }}>
            <option value="">Nothing else</option>{sides.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        {s ? (
          <div className="row2">
            <label className="field"><span>How much a person</span><input className="input" type="number" min="0" step="0.25" value={sideQty} onChange={(e) => setSideQty(e.target.value)} /></label>
            <label className="field"><span>Unit</span><select className="input" value={sideUnit} onChange={(e) => setSideUnit(e.target.value)}>{s.units.map((u) => <option key={u}>{u}</option>)}</select></label>
          </div>
        ) : null}
        <label className="field"><span>Name</span><input className="input" maxLength={120} placeholder={auto || "e.g. Banku + Okra soup"} value={name} onChange={(e) => setName(e.target.value)} /></label>
        {clash ? <Msg>You already have a pairing with this name.</Msg> : null}
        {!enough ? <Msg tone="hint">Pick at least two things eaten together.</Msg> : null}
        <div><button type="button" className="btn primary" disabled={!enough || clash || !final || busy} onClick={() => act(() => savePairing(final, picked,
          s && Number(sideQty) > 0 ? { ingredientId: s.id, qty: Number(sideQty), unit: sideUnit } : null), () => { setPicked([]); setSide(""); setName(""); })}>Save pairing</button></div>
      </div>
      {pairings.length ? (
        <div className="card form">
          <Section title="Remove a pairing" />
          <select className="input" aria-label="Pairing" value={drop} onChange={(e) => setDrop(Number(e.target.value))}>{pairings.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <div><button type="button" className="btn danger" onClick={() => setAsking(true)}>Remove</button></div>
          <Confirm open={asking} busy={busy} button="Remove" onCancel={() => setAsking(false)} message={`Remove ${dropName}? Its dishes stay in the recipe book.`}
            onConfirm={() => act(() => deletePairing(pairings.some((p) => p.id === drop) ? drop : pairings[0].id), () => setAsking(false))} />
        </div>
      ) : null}
      <div className="card form">
        <Section title="Ghanaian kitchen catalog" />
        <p className="caption" style={{ margin: 0 }}>Everyday ingredients with their purchase units, six soup and stew templates for a week, the starches, and the pairings. Anything you deleted can be added back here; nothing you changed is touched.</p>
        <div><button type="button" className="btn" disabled={busy} onClick={() => act(() => addCatalog())}>Add back anything missing</button></div>
      </div>
    </div>
  );
}
