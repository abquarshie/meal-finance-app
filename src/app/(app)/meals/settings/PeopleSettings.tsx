"use client";
import { useState } from "react";
import { setPeopleSettings } from "@/actions/kitchen";
import { Section } from "@/components/ui";
import { useAct } from "@/components/useAct";

export function PeopleSettings({ slots, household }: { slots: Record<string, number>; household: number }) {
  const [busy, act] = useAct();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(slots).map(([s, n]) => [s, String(n)])));
  const [hh, setHh] = useState(String(household));
  const changed = Object.entries(slots).some(([s, n]) => Number(v[s]) !== n) || Number(hh) !== household;
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); act(() => setPeopleSettings(Object.fromEntries(Object.entries(v).map(([s, n]) => [s, Number(n)])), Number(hh))); }}>
      <Section title="People eating at each meal" />
      <p className="caption" style={{ marginTop: 0 }}>When a dish is cooked, this many portions are eaten at that meal and the rest go into the fridge.
        If lunch is usually eaten at work or school, set it lower. A single day can be different: change it on the meal plan.</p>
      <div className="row2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {Object.keys(slots).map((s) => (
          <label key={s} className="field"><span>{s}</span>
            <input className="input" type="number" min="0" max="30" step="1" value={v[s]} onChange={(e) => setV({ ...v, [s]: e.target.value })} /></label>
        ))}
      </div>
      <label className="field"><span>People in the household</span>
        <input className="input" type="number" min="1" max="30" step="1" value={hh} onChange={(e) => setHh(e.target.value)} />
      </label>
      <div><button className="btn primary" disabled={!changed || busy}>Save</button></div>
    </form>
  );
}
