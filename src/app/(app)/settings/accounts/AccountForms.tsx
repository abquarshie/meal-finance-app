"use client";
import { useState } from "react";
import { addAccount, assignOlder, deleteAccount, editAccount } from "@/actions/settings";
import { Confirm } from "@/components/Sheet";
import { Empty, Msg } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { CURRENCY, money } from "@/lib/money";
import { entries } from "@/lib/words";

type A = { name: string; opening: number; spendable: boolean; balance: number; used: number };
type Action = "Add" | "Edit" | "Delete" | "Assign older entries";

export function AccountForms({ accounts, unassigned }: { accounts: A[]; unassigned: number }) {
  const [action, setAction] = useState<Action>("Add");
  return (
    <div className="card form">
      <div className="chips" role="group" aria-label="Action">
        {(["Add", "Edit", "Delete", "Assign older entries"] as Action[]).map((x) => (
          <button key={x} type="button" className="chip" aria-pressed={x === action} onClick={() => setAction(x)}>{x}</button>
        ))}
      </div>
      {action === "Add" ? <Add names={accounts.map((a) => a.name.toLowerCase())} /> : null}
      {action === "Edit" ? (accounts.length ? <Edit accounts={accounts} /> : <Empty>No accounts yet.</Empty>) : null}
      {action === "Delete" ? (accounts.length ? <Delete accounts={accounts} /> : <Empty>No accounts yet.</Empty>) : null}
      {action === "Assign older entries" ? <Assign accounts={accounts} n={unassigned} /> : null}
    </div>
  );
}

function Add({ names }: { names: string[] }) {
  const [busy, act] = useAct();
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("0");
  const [spendable, setSpendable] = useState(true);
  const clash = names.includes(name.trim().toLowerCase());
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => addAccount(name, Number(opening) || 0, spendable), () => { setName(""); setOpening("0"); }); }}>
      <div className="row2">
        <label className="field"><span>Account name</span><input className="input" maxLength={50} placeholder="e.g. MoMo" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Opening balance ({CURRENCY})</span><input className="input" type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></label>
      </div>
      <Msg tone="hint">What the account held before your first entry here.</Msg>
      {clash ? <Msg>&apos;{name.trim()}&apos; already exists.</Msg> : null}
      <label className="check"><input type="checkbox" checked={spendable} onChange={(e) => setSpendable(e.target.checked)} /> Everyday money</label>
      <Msg tone="hint">Untick for savings like Susu or an emergency fund.</Msg>
      <div><button className="btn primary" disabled={!name.trim() || clash || busy}>Add account</button></div>
    </form>
  );
}

function Edit({ accounts }: { accounts: A[] }) {
  const [pick, setPick] = useState(accounts[0].name);
  const a = accounts.find((x) => x.name === pick) ?? accounts[0];
  return (
    <div className="form">
      <select className="input" aria-label="Account" value={a.name} onChange={(e) => setPick(e.target.value)}>
        {accounts.map((x) => <option key={x.name}>{x.name}</option>)}
      </select>
      <EditOne key={a.name} a={a} others={accounts.filter((x) => x.name !== a.name).map((x) => x.name.toLowerCase())} onRenamed={setPick} />
    </div>
  );
}

function EditOne({ a, others, onRenamed }: { a: A; others: string[]; onRenamed: (n: string) => void }) {
  const [busy, act] = useAct();
  const [name, setName] = useState(a.name);
  const [opening, setOpening] = useState(String(a.opening));
  const [spendable, setSpendable] = useState(a.spendable);
  const n = name.trim();
  const clash = others.includes(n.toLowerCase());
  const open = Number(opening) || 0;
  const changed = n !== a.name || open !== a.opening || spendable !== a.spendable;
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => editAccount(a.name, n, open, spendable), () => onRenamed(n)); }}>
      <div className="row2">
        <label className="field"><span>Name</span><input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Opening balance ({CURRENCY})</span><input className="input" type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></label>
      </div>
      {!n ? <Msg>The name can&apos;t be empty.</Msg> : clash ? <Msg>&apos;{n}&apos; already exists.</Msg> : null}
      {open !== a.opening ? <Msg tone="hint">Balance now becomes {money(a.balance + open - a.opening)}.</Msg> : null}
      <label className="check"><input type="checkbox" checked={spendable} onChange={(e) => setSpendable(e.target.checked)} /> Everyday money</label>
      <div><button className="btn primary" disabled={!changed || !n || clash || busy}>Save changes</button></div>
    </form>
  );
}

function Delete({ accounts }: { accounts: A[] }) {
  const [busy, act] = useAct();
  const [pick, setPick] = useState(accounts[0].name);
  const [asking, setAsking] = useState(false);
  const a = accounts.find((x) => x.name === pick) ?? accounts[0];
  return (
    <div className="form">
      <select className="input" aria-label="Account" value={a.name} onChange={(e) => setPick(e.target.value)}>
        {accounts.map((x) => <option key={x.name}>{x.name}</option>)}
      </select>
      {a.used ? <Msg tone="warn">&apos;{a.name}&apos; is used by {entries(a.used)} (transactions and auto transactions), so it can&apos;t be deleted. You can rename it instead.</Msg> : null}
      <div><button type="button" className="btn danger" disabled={Boolean(a.used)} onClick={() => setAsking(true)}>Delete account</button></div>
      <Confirm open={asking} busy={busy} onCancel={() => setAsking(false)} message={`Delete the account ${a.name}?`}
        onConfirm={() => act(() => deleteAccount(a.name), () => setAsking(false))} />
    </div>
  );
}

function Assign({ accounts, n }: { accounts: A[]; n: number }) {
  const [busy, act] = useAct();
  const [pick, setPick] = useState(accounts.some((a) => a.name === "Cash") ? "Cash" : accounts[0]?.name ?? "");
  if (!n) return <Empty>Every income and expense entry already has an account.</Empty>;
  if (!accounts.length) return <div className="note warn">Add an account first.</div>;
  return (
    <div className="form">
      <p className="caption" style={{ margin: 0 }}>{entries(n)} with no account. Put them all in one account so balances add
        up. You can still change single ones on the Transactions page.</p>
      <select className="input" aria-label="Account" value={pick} onChange={(e) => setPick(e.target.value)}>
        {accounts.map((x) => <option key={x.name}>{x.name}</option>)}
      </select>
      <div><button type="button" className="btn primary" disabled={busy} onClick={() => act(() => assignOlder(pick))}>Assign {n} to {pick}</button></div>
    </div>
  );
}
