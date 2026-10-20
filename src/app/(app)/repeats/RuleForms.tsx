"use client";
import { useState, useTransition } from "react";
import { createRule, deleteRule, pauseRule, resumeRule, updateRule } from "@/actions/rules";
import { Confirm } from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { Msg } from "@/components/ui";
import { CURRENCY, FEE_CATEGORY, FREQUENCIES, KINDS, SHARED, type Frequency, type Kind } from "@/lib/money";
import { missedRuns } from "@/lib/rules";

type Brief = { id: number; name: string; type: Kind; amount: number; fee: number | null; endDate: string | null;
  startDate: string; status: "Active" | "Paused" | "Finished" };
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function ManageRule({ rules }: { rules: Brief[] }) {
  const [id, setId] = useState(rules[0].id);
  const rule = rules.find((r) => r.id === id) ?? rules[0];
  return (
    <div className="form">
      <select className="input" aria-label="Auto transaction" value={rule.id} onChange={(e) => setId(Number(e.target.value))}>
        {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <RuleEditor key={rule.id} rule={rule} />
    </div>
  );
}

function RuleEditor({ rule }: { rule: Brief }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [amount, setAmount] = useState(String(rule.amount));
  const [fee, setFee] = useState(rule.fee ? String(rule.fee) : "");
  const [end, setEnd] = useState(rule.endDate ?? "");
  const [asking, setAsking] = useState(false);
  const endBad = Boolean(end) && end < rule.startDate;
  const changed = Number(amount) !== rule.amount || (rule.type === "Transfer" && (num(fee) ?? 0) !== (rule.fee ?? 0))
    || (end || null) !== rule.endDate;
  const run = (work: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await work();
    toast(r.ok ? r.message! : r.error!, r.ok ? undefined : { tone: "warn" });
    setAsking(false);
  });
  return (
    <>
      <div className="row2">
        <label className="field"><span>Amount ({CURRENCY})</span>
          <input className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {rule.type === "Transfer" ? (
          <label className="field"><span>Fee ({CURRENCY})</span>
            <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
        ) : null}
        <label className="field"><span>Stop after (optional)</span>
          <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {endBad ? <Msg>The stop date is before the first run.</Msg> : null}
      <div className="btns">
        <button type="button" className="btn primary" disabled={!changed || endBad || busy || !(Number(amount) > 0)}
          onClick={() => run(() => updateRule({ id: rule.id, amount: Number(amount), fee: num(fee), end: end || null }))}>Save changes</button>
        {rule.status === "Active" ? <button type="button" className="btn" disabled={busy} onClick={() => run(() => pauseRule(rule.id))}>Pause</button> : null}
        {rule.status === "Paused" ? (
          <button type="button" className="btn" disabled={busy} title="Skips the dates it was paused for, instead of adding them all at once."
            onClick={() => run(() => resumeRule(rule.id))}>Resume</button>
        ) : null}
        <button type="button" className="btn danger" onClick={() => setAsking(true)}>Delete</button>
      </div>
      <Confirm open={asking} busy={busy} onCancel={() => setAsking(false)} onConfirm={() => run(() => deleteRule(rule.id))}
        message={`Delete ${rule.name}? Entries it already added stay in your transactions.`} />
    </>
  );
}

export function NewRule({ today, accounts, members, categories, labels, taken }: {
  today: string; accounts: string[]; members: string[]; categories: Record<Kind, string[]>; labels: Record<string, string>;
  taken: string[];
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const blank = { name: "", amount: "", fee: "", note: "" };
  const [kind, setKind] = useState<Kind>("Transfer");
  const [v, setV] = useState(blank);
  const [cat, setCat] = useState<Record<Kind, string>>({ Expense: categories.Expense[0] ?? "", Income: categories.Income[0] ?? "",
    Transfer: categories.Transfer[0] ?? "" });
  const [account, setAccount] = useState(accounts[0]);
  const [to, setTo] = useState(accounts.find((a) => a !== accounts[0]) ?? accounts[0]);
  const [member, setMember] = useState(SHARED);
  const [freq, setFreq] = useState<Frequency>("Monthly");
  const [startDate, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const names = categories[kind];
  const same = kind === "Transfer" && account === to;
  const endBad = Boolean(end) && end < startDate;
  const missed = startDate && startDate < today ? missedRuns(startDate, freq, end || null, today) : 0;
  const ready = Boolean(v.name.trim()) && Number(v.amount) > 0 && !same && !endBad && Boolean(cat[kind]);

  function create() {
    setError(null);
    start(async () => {
      const r = await createRule({ name: v.name, kind, amount: Number(v.amount), fee: kind === "Transfer" ? num(v.fee) : null,
        category: cat[kind], account, to: kind === "Transfer" ? to : null, member, frequency: freq, start: startDate,
        end: end || null, note: v.note });
      if (!r.ok) return setError(r.error);
      toast(r.message);
      setV(blank);
    });
  }
  if (!names.length) return <div className="note warn">There are no {kind.toLowerCase()} categories yet. Add one in Settings → Categories.</div>;
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); create(); }}>
      <div className="seg" role="group" aria-label="Type">
        {KINDS.map((k) => <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>{k}</button>)}
      </div>
      <div className="row2">
        <label className="field"><span>Name</span>
          <input className="input" placeholder="e.g. Monthly Susu" maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="field"><span>Amount ({CURRENCY})</span>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={v.amount}
            onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </label>
      </div>
      {taken.includes(v.name.trim().toLowerCase()) ? <Msg tone="warn">You already have one with this name.</Msg> : null}
      {kind === "Transfer" ? (
        <>
          <div className="row2">
            <label className="field"><span>From</span>
              <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
            <label className="field"><span>To</span>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{accounts.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
          </div>
          {same ? <Msg>Pick a different account to move the money into.</Msg> : null}
          <div className="row2">
            <label className="field"><span>Purpose</span>
              <select className="input" value={cat.Transfer} onChange={(e) => setCat({ ...cat, Transfer: e.target.value })}>
                {names.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field"><span>Fee ({CURRENCY}), optional</span>
              <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={v.fee}
                onChange={(e) => setV({ ...v, fee: e.target.value })} />
            </label>
          </div>
          <Msg tone="hint">A fee is added as a separate {FEE_CATEGORY} expense each time.</Msg>
        </>
      ) : (
        <>
          <div className="row2">
            <label className="field"><span>Category</span>
              <select className="input" value={cat[kind]} onChange={(e) => setCat({ ...cat, [kind]: e.target.value })}>
                {names.map((c) => <option key={c} value={c}>{labels[c] ?? c}</option>)}</select>
            </label>
            <label className="field"><span>Account</span>
              <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
          </div>
          <label className="field"><span>Who</span>
            <select className="input" value={member} onChange={(e) => setMember(e.target.value)}>{members.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </>
      )}
      <label className="field"><span>Repeats</span>
        <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
          {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select>
      </label>
      <div className="row2">
        <label className="field"><span>First run</span>
          <input className="input" type="date" value={startDate} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <label className="field"><span>Stop after (optional)</span>
          <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {missed ? <Msg tone="warn">This start date is in the past, so {missed} entr{missed === 1 ? "y" : "ies"} will be added straight away.</Msg> : null}
      {endBad ? <Msg>The stop date is before the first run.</Msg> : null}
      <label className="field"><span>Note (optional)</span>
        <input className="input" maxLength={500} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      {error ? <div className="note error">{error}</div> : null}
      <button type="submit" className="btn primary wide" disabled={!ready || busy}>{busy ? "Creating…" : "Create auto transaction"}</button>
      {!ready && !same && !endBad ? <Msg tone="hint">Add a name and an amount to create it.</Msg> : null}
    </form>
  );
}
