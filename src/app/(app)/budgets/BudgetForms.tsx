"use client";
import { useState, useTransition } from "react";
import { removeBudget, setBudget } from "@/actions/plan";
import { safe } from "@/components/safe";
import { Confirm } from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { Msg, Section } from "@/components/ui";
import { CURRENCY, money } from "@/lib/money";

type Target = { key: string; label: string; isGroup: boolean; group: string };

export function BudgetForms({ targets, current, spent, month }: {
  targets: Target[]; current: Record<string, number>; spent: Record<string, number>; month: string;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [key, setKey] = useState(targets[0].key);
  const [limit, setLimit] = useState("");
  const [remove, setRemove] = useState(Object.keys(current)[0] ?? "");
  const [asking, setAsking] = useState(false);
  const t = targets.find((x) => x.key === key)!;
  const l = Number(limit);
  const used = spent[key] ?? 0;
  const inside = t.isGroup ? targets.filter((x) => !x.isGroup && x.group === key && x.key in current).map((x) => x.key) : [];
  const overlap = inside.length
    ? `${inside.join(", ")} also ${inside.length === 1 ? "has" : "have"} their own budget inside this group.`
    : !t.isGroup && t.group in current ? `The whole ${t.group} group already has a budget that includes this.` : null;
  const after = (r: { ok: boolean; message?: string; error?: string }) => toast(r.ok ? r.message! : r.error!, r.ok ? undefined : { tone: "warn" });
  return (
    <div className="stack">
      <form className="card form" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await safe(() => setBudget(key, l)); after(r); if (r.ok) setLimit(""); }); }}>
        <Section title="Set a budget" />
        <label className="field"><span>Budget for</span>
          <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
            {targets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Monthly limit ({CURRENCY})</span>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={limit}
            onChange={(e) => setLimit(e.target.value)} />
        </label>
        {key in current ? <Msg tone="hint">Currently {money(current[key])}. Saving replaces it.</Msg> : null}
        {l && used && l < used ? <Msg tone="warn">You&apos;ve already spent {money(used)} on this in {month}.</Msg> : null}
        {overlap ? <Msg tone="hint">{overlap}</Msg> : null}
        <button className="btn primary wide" disabled={!(l > 0) || busy}>Save budget</button>
      </form>
      {Object.keys(current).length ? (
        <div className="card form">
          <Section title="Remove a budget" />
          <select className="input" aria-label="Budget" value={remove} onChange={(e) => setRemove(e.target.value)}>
            {Object.keys(current).map((k) => <option key={k}>{k}</option>)}
          </select>
          <div><button type="button" className="btn danger" onClick={() => setAsking(true)}>Remove</button></div>
          <Confirm open={asking} busy={busy} button="Remove" onCancel={() => setAsking(false)}
            message={`Remove the budget for ${remove}? Your spending records aren't affected.`}
            onConfirm={() => start(async () => { after(await safe(() => removeBudget(remove))); setAsking(false); })} />
        </div>
      ) : null}
    </div>
  );
}
