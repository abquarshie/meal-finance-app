"use client";
import { useState } from "react";
import { createGoal, deleteGoal, moveGoalMoney } from "@/actions/goals";
import { Confirm } from "@/components/Sheet";
import { Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { CURRENCY, money } from "@/lib/money";

type GoalInfo = { id: number; name: string; current: number; left: number };

/** Under each goal: move money in or out, folded away until needed. */
export function GoalForms({ goal, accounts, balances }: { goal: GoalInfo; accounts: string[]; balances: Record<string, number> }) {
  const [busy, act] = useAct();
  const [dir, setDir] = useState<"in" | "out">("in");
  const [account, setAccount] = useState(accounts[0] ?? "");
  const [value, setValue] = useState("");
  const [asking, setAsking] = useState(false);
  const a = Number(value);
  const problem = !(a > 0) ? null
    : dir === "out" && a > goal.current + 1e-9 ? `${goal.name} only has ${money(goal.current)} in it.`
      : dir === "in" && a > (balances[account] ?? 0) + 1e-9 ? `${account} has ${money(balances[account] ?? 0)}.` : null;
  if (!accounts.length) return <p className="caption mb-0">Add an account in Settings to move money into this goal.</p>;
  return (
    <details className="more mt-3">
      <summary>Move money</summary>
      <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => moveGoalMoney(goal.id, account, a, dir), () => setValue("")); }}>
        <div className="seg" role="group" aria-label="Direction">
          <button type="button" aria-pressed={dir === "in"} onClick={() => setDir("in")}>Add to goal</button>
          <button type="button" aria-pressed={dir === "out"} onClick={() => setDir("out")} disabled={goal.current <= 0}>Take out</button>
        </div>
        <div className="row2">
          <label className="field"><span>{dir === "in" ? "From account" : "To account"}</span>
            <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((x) => <option key={x} value={x}>{x} · {money(balances[x] ?? 0)}</option>)}
            </select>
          </label>
          <label className="field"><span>Amount ({CURRENCY})</span>
            <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={value}
              onChange={(e) => setValue(e.target.value)} />
          </label>
        </div>
        {problem ? <Msg tone="warn">{problem}</Msg> : dir === "in" && a > goal.left && goal.left > 0
          ? <Msg tone="hint">That&apos;s {money(a - goal.left)} more than the goal still needs.</Msg> : null}
        <div className="btns justify-between">
          <button className="btn primary" disabled={!(a > 0) || Boolean(problem && dir === "out") || busy}>
            {dir === "in" ? `Move to ${goal.name}` : `Move to ${account}`}
          </button>
          {goal.current === 0 ? <button type="button" className="btn ghost danger" onClick={() => setAsking(true)}>Delete goal</button> : null}
        </div>
      </form>
      <Confirm open={asking} busy={busy} button="Delete" onCancel={() => setAsking(false)}
        message={`Delete the goal ${goal.name}? It has nothing in it.`} onConfirm={() => act(() => deleteGoal(goal.id), () => setAsking(false))} />
    </details>
  );
}

export function NewGoal({ today, names }: { today: string; names: string[] }) {
  const [busy, act] = useAct();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const taken = name.trim() && names.some((n) => n.toLowerCase() === name.trim().toLowerCase());
  const badDate = Boolean(date) && date <= today;
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); act(() => createGoal(name, Number(target), date || null), () => { setName(""); setTarget(""); setDate(""); }); }}>
      <Section title="New goal" />
      <label className="field"><span>Name</span>
        <input className="input" placeholder="e.g. School fees" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {taken ? <Msg tone="warn">You already have a goal with this name.</Msg> : null}
      <div className="row2">
        <label className="field"><span>Target ({CURRENCY})</span>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="field"><span>Target date (optional)</span>
          <input className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {badDate ? <Msg>Pick a date after today, or leave it empty.</Msg> : null}
      <button className="btn primary wide" disabled={!name.trim() || Boolean(taken) || !(Number(target) > 0) || badDate || busy}>Create goal</button>
    </form>
  );
}
