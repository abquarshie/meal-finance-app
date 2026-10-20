"use client";
import { useState, useTransition } from "react";
import { addToGoal, createGoal, deleteGoal, removeContribution } from "@/actions/plan";
import { Confirm } from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { Empty, Msg } from "@/components/ui";
import { CURRENCY, money } from "@/lib/money";

type Tab = "Add money" | "New goal" | "Manage";

export function GoalForms({ today, goals, contributions }: {
  today: string; goals: { id: number; name: string; left: number }[]; contributions: { id: number; label: string }[];
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<Tab>(goals.length ? "Add money" : "New goal");
  const [goalPick, setGoal] = useState(goals[0]?.id ?? 0);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contribPick, setContrib] = useState(contributions[0]?.id ?? 0);
  const [dropPick, setDrop] = useState(goals[0]?.id ?? 0);
  const [asking, setAsking] = useState<null | "saving" | "goal">(null);
  // a deleted goal or saving falls back to the first one left
  const goal = goals.some((x) => x.id === goalPick) ? goalPick : goals[0]?.id ?? 0;
  const drop = goals.some((x) => x.id === dropPick) ? dropPick : goals[0]?.id ?? 0;
  const contrib = contributions.some((c) => c.id === contribPick) ? contribPick : contributions[0]?.id ?? 0;
  const g = goals.find((x) => x.id === goal);
  const a = Number(amount);
  const badDeadline = Boolean(deadline) && deadline <= today;
  const after = (r: { ok: boolean; message?: string; error?: string }) => {
    toast(r.ok ? r.message! : r.error!, r.ok ? undefined : { tone: "warn" });
    return r.ok;
  };
  return (
    <div className="card form">
      <div className="seg" role="group" aria-label="Goal actions">
        {(["Add money", "New goal", "Manage"] as Tab[]).map((t) => <button key={t} type="button" aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === "Add money" ? (goals.length ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); start(async () => { if (after(await addToGoal(goal, a, date, note))) { setAmount(""); setNote(""); } }); }}>
          <label className="field"><span>Goal</span>
            <select className="input" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>{goals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <div className="row2">
            <label className="field"><span>Amount ({CURRENCY})</span>
              <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          </div>
          {g && g.left === 0 ? <Msg tone="hint">This goal is already reached.</Msg> : g && a > g.left ? <Msg tone="warn">That&apos;s {money(a - g.left)} more than the goal still needs.</Msg> : null}
          <label className="field"><span>Note</span><input className="input" placeholder="Optional, e.g. Ama's contribution" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn primary wide" disabled={!(a > 0) || busy}>Add to goal</button>
          <Msg tone="hint">Goal savings are tracked separately. They don&apos;t change your income or expenses.</Msg>
        </form>
      ) : <div className="note">Create a savings goal first, under New goal.</div>) : null}
      {tab === "New goal" ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); start(async () => { if (after(await createGoal(name, Number(target), deadline || null))) { setName(""); setTarget(""); setDeadline(""); setTab("Add money"); } }); }}>
          <label className="field"><span>Goal name</span><input className="input" placeholder="e.g. School fees" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          {goals.some((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase()) && name.trim() ? <Msg tone="warn">You already have a goal with this name.</Msg> : null}
          <div className="row2">
            <label className="field"><span>Target ({CURRENCY})</span>
              <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label className="field"><span>Deadline (optional)</span><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          </div>
          {badDeadline ? <Msg>Pick a deadline after today, or leave it empty.</Msg> : null}
          <button className="btn primary wide" disabled={!name.trim() || !(Number(target) > 0) || badDeadline || busy}>Create goal</button>
        </form>
      ) : null}
      {tab === "Manage" ? (
        <div className="form">
          {!goals.length && !contributions.length ? <Empty>Nothing to manage yet.</Empty> : null}
          {contributions.length ? (
            <>
              <label className="field"><span>Remove a saving</span>
                <select className="input" value={contrib} onChange={(e) => setContrib(Number(e.target.value))}>{contributions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </label>
              <div><button type="button" className="btn danger" onClick={() => setAsking("saving")}>Remove saving</button></div>
            </>
          ) : null}
          {goals.length ? (
            <>
              <label className="field"><span>Delete a goal</span>
                <select className="input" value={drop} onChange={(e) => setDrop(Number(e.target.value))}>{goals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              </label>
              <div><button type="button" className="btn danger" onClick={() => setAsking("goal")}>Delete goal</button></div>
            </>
          ) : null}
          <Confirm open={asking !== null} busy={busy} button={asking === "saving" ? "Remove" : "Delete"} onCancel={() => setAsking(null)}
            message={asking === "saving" ? `Remove ${contributions.find((c) => c.id === contrib)?.label}?`
              : `Delete ${goals.find((x) => x.id === drop)?.name} and all the savings recorded for it?`}
            onConfirm={() => start(async () => { after(asking === "saving" ? await removeContribution(contrib) : await deleteGoal(drop)); setAsking(null); })} />
        </div>
      ) : null}
    </div>
  );
}
