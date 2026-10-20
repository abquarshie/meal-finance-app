"use client";
// Pick the day and meal once, then one or more dishes, each with its own amount, and add them together.
// Everything picked for one breakfast, lunch or supper is one meal.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addToPlan } from "@/actions/kitchen";
import { addIdea, dishHint, planDefaults, type DishDefault } from "@/actions/plan-help";
import { useToast } from "@/components/Toaster";
import { Msg, Section } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { CURRENCY } from "@/lib/money";

export type Option = { key: string; label: string; kind: "pairing" | "recipe" | "item"; bought?: boolean; countUnit?: string;
  units?: string[]; parts?: string[]; sides?: Record<string, { qty: number; unit: string }> };
export type Idea = { recipeId: number; name: string; why: string };

const ONE_OFF_UNITS = ["portion", "piece", "ball", "pack", "plate", "bowl", "loaf", "bottle", "sachet"];
const SLOTS = ["Breakfast", "Lunch", "Supper"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(d: string, today: string) {
  if (d === today) return "Today";
  if (d === addDays(today, 1)) return "Tomorrow";
  return `${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}`;
}

export function AddToPlan({ today, nextSlot, usual, mealPeople, options, ideas }: {
  today: string; nextSlot: string; usual: Record<string, number>; mealPeople: Record<string, number>; options: Option[]; ideas: Idea[];
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [week2, setWeek2] = useState(false);
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState(nextSlot);
  const nowSet = mealPeople[`${day}|${slot}`] ?? usual[slot] ?? 1;
  const [people, setPeople] = useState(String(nowSet));
  useEffect(() => setPeople(String(mealPeople[`${day}|${slot}`] ?? usual[slot] ?? 1)), [day, slot, mealPeople, usual]);
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, DishDefault>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [mealName, setMealName] = useState({ name: "", joins: false });
  const [once, setOnce] = useState(false);
  const [oneOff, setOneOff] = useState({ name: "", qty: "1", unit: "portion", price: "" });
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + (week2 ? 7 : 0)));
  const p = Number(people) || 0;

  // a pairing stands for its dishes; a dish picked twice is planned once
  const sides: Record<string, { qty: number; unit: string }> = {};
  const expanded: string[] = [];
  for (const key of picked) {
    const o = byKey.get(key);
    if (o?.kind === "pairing") {
      for (const part of o.parts ?? []) if (!expanded.includes(part)) expanded.push(part);
      Object.assign(sides, o.sides ?? {});
    } else if (!expanded.includes(key)) expanded.push(key);
  }
  const sig = `${day}|${slot}|${p}|${expanded.join(",")}`;
  const lastSig = useRef("");
  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (!expanded.length) { setMealName({ name: "", joins: false }); return; }
    const t = setTimeout(async () => {
      const r = await planDefaults(day, slot, p, expanded, sides);
      setDefaults(r.lines);
      setMealName({ name: r.mealName, joins: r.joins });
      setHints({});
    }, 150);
    return () => clearTimeout(t);
  });

  const lines = expanded.map((key) => {
    const o = byKey.get(key)!;
    const d = defaults[key];
    const q = qty[key] ?? (d ? String(d.qty) : "");
    const u = unit[key] ?? d?.unit ?? o.units?.[0] ?? "pcs";
    return { key, o, q, u, note: hints[key] ?? d?.note ?? "" };
  });
  const toAdd = lines.filter((l) => Number(l.q) > 0);
  const oneOffOk = once && oneOff.name.trim() && Number(oneOff.qty) > 0;
  const n = toAdd.length + (oneOffOk ? 1 : 0);
  const when = day === today ? "today" : day === addDays(today, 1) ? "tomorrow" : dayLabel(day, today);

  function hint(key: string, v: string) {
    const o = byKey.get(key);
    if (o?.kind !== "recipe" || o.bought || !(Number(v) > 0)) return;
    const [, raw] = key.split(":");
    dishHint(day, slot, p, Number(raw), Number(v)).then((h) => setHints((x) => ({ ...x, [key]: h })));
  }

  function add() {
    const own = Math.abs(p - (usual[slot] ?? 0)) < 1e-9 ? null : p; // the usual number isn't stored: it can change
    const entries = toAdd.map((l) => {
      const [kind, raw] = l.key.split(":");
      return kind === "r" ? { day, slot: slot as "Lunch", recipeId: Number(raw), qty: Number(l.q), people: own }
        : { day, slot: slot as "Lunch", ingredientId: Number(raw), qty: Number(l.q), unit: l.u, people: own };
    });
    if (oneOffOk) {
      entries.push({ day, slot: slot as "Lunch", label: oneOff.name.trim(), qty: Number(oneOff.qty), unit: oneOff.unit,
        price: oneOff.price ? Number(oneOff.price) : null, people: own } as never);
    }
    start(async () => {
      const r = await addToPlan(entries, mealName.joins && Math.abs(p - nowSet) > 1e-9 ? { day, slot, people: own } : undefined);
      if (!r.ok) return toast(r.error, { tone: "warn" });
      toast(r.message);
      setPicked([]); setQty({}); setUnit({}); setDefaults({}); setHints({}); setOnce(false);
      setOneOff({ name: "", qty: "1", unit: "portion", price: "" });
    });
  }

  return (
    <div className="stack">
      <div className="card form">
        <Section title="Add to the plan" />
        <div className="seg" role="group" aria-label="Days">
          <button type="button" aria-pressed={!week2} onClick={() => { setWeek2(false); setDay(today); }}>Next 7 days</button>
          <button type="button" aria-pressed={week2} onClick={() => { setWeek2(true); setDay(addDays(today, 7)); }}>Days 8 to 14</button>
        </div>
        <div className="chips" role="group" aria-label="Day">
          {days.map((d) => <button key={d} type="button" className="chip" aria-pressed={d === day} onClick={() => setDay(d)}>{dayLabel(d, today)}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Meal">
          {SLOTS.map((s) => <button key={s} type="button" className="chip" aria-pressed={s === slot} onClick={() => setSlot(s)}>{s}</button>)}
        </div>
        <label className="field"><span>People eating</span>
          <input className="input" type="number" min="0" max="50" step="1" value={people} onChange={(e) => setPeople(e.target.value)} />
          <Msg tone="hint">Usually {usual[slot]} at {slot.toLowerCase()} (change that under Settings in the kitchen). Change it here for just this meal: guests, or someone away.</Msg>
        </label>
        {!options.length ? <Msg tone="hint">Add a recipe or an ingredient first, under Recipes.</Msg> : (
          <label className="field"><span>Dishes</span>
            <select className="input" value="" aria-label="Add a dish" onChange={(e) => {
              const v = e.target.value;
              if (v && !picked.includes(v)) setPicked([...picked, v]);
            }}>
              <option value="">A pairing (🍲 Kokonte + Palm nut soup), dishes, or items…</option>
              <optgroup label="Pairings">{options.filter((o) => o.kind === "pairing").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
              <optgroup label="Dishes">{options.filter((o) => o.kind === "recipe").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
              <optgroup label="Items">{options.filter((o) => o.kind === "item").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
            </select>
          </label>
        )}
        {picked.length ? (
          <div className="chips">
            {picked.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed="true" title="Take it out"
                onClick={() => setPicked(picked.filter((x) => x !== k))}>{byKey.get(k)?.label} ✕</button>
            ))}
          </div>
        ) : null}
        {lines.map((l) => {
          const name = l.o.label.replace(" 🛍️", "").replace(" (item)", "");
          const label = l.o.kind === "item" ? `${name} (how much)` : l.o.bought ? `${name} (${l.o.countUnit}s)` : `${name} (portions to cook)`;
          return (
            <div key={l.key} className="field">
              <div className={l.o.kind === "item" ? "row2" : undefined}>
                <label className="field"><span>{label}</span>
                  <input className="input" type="number" min="0" step="0.25" value={l.q}
                    onChange={(e) => { setQty({ ...qty, [l.key]: e.target.value }); hint(l.key, e.target.value); }} />
                </label>
                {l.o.kind === "item" ? (
                  <label className="field"><span>Unit</span>
                    <select className="input" value={l.u} onChange={(e) => setUnit({ ...unit, [l.key]: e.target.value })}>
                      {(l.o.units ?? ["pcs"]).map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              {l.note ? <Msg tone="hint">{l.note}</Msg> : null}
            </div>
          );
        })}
        <label className="check"><input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} />
          Add something bought outside, just this once</label>
        {once ? (
          <>
            <label className="field"><span>What</span>
              <input className="input" maxLength={80} placeholder="e.g. Fried yam from the roadside" value={oneOff.name}
                onChange={(e) => setOneOff({ ...oneOff, name: e.target.value })} />
            </label>
            <div className="row2">
              <label className="field"><span>How many</span>
                <input className="input" type="number" min="0.25" step="0.5" value={oneOff.qty} onChange={(e) => setOneOff({ ...oneOff, qty: e.target.value })} />
              </label>
              <label className="field"><span>Counted in</span>
                <select className="input" value={oneOff.unit} onChange={(e) => setOneOff({ ...oneOff, unit: e.target.value })}>
                  {ONE_OFF_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              </label>
            </div>
            <label className="field"><span>Price for one {oneOff.unit} ({CURRENCY}), if you know it</span>
              <input className="input" type="number" min="0" step="0.5" value={oneOff.price} onChange={(e) => setOneOff({ ...oneOff, price: e.target.value })} />
            </label>
          </>
        ) : null}
        {mealName.name && n ? <Msg tone="hint">One meal: {mealName.name}{mealName.joins ? ` (with what's already planned for ${when}'s ${slot.toLowerCase()})` : ""}.</Msg> : null}
        <button type="button" className="btn primary wide" disabled={!n || busy} onClick={add}>
          {n > 1 ? `Add ${n} to ${when}, ${slot.toLowerCase()}` : `Add to ${when}, ${slot.toLowerCase()}`}
        </button>
      </div>
      {ideas.length ? (
        <div className="card">
          <Section title="Ideas to use things up" />
          {ideas.map((i) => (
            <div className="rule" key={i.recipeId}>
              <div style={{ minWidth: 0 }}><div className="rule-name">{i.name}</div><div className="rule-meta">{i.why}</div></div>
              <button type="button" className="btn small" disabled={busy} title={`Add to ${when}, ${slot.toLowerCase()}`}
                onClick={() => start(async () => {
                  const r = await addIdea(day, slot, i.recipeId);
                  toast(r.ok ? r.message : r.error, r.ok ? undefined : { tone: "warn" });
                })}>Add</button>
            </div>
          ))}
          <p className="caption">Add puts it on {when}, {slot.toLowerCase()}: the day and meal picked above.</p>
        </div>
      ) : null}
    </div>
  );
}
