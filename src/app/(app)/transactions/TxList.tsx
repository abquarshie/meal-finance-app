"use client";
import { useState, useTransition } from "react";
import { deleteTransactions, restoreTransactions, updateTransaction } from "@/actions/entries";
import { DayHead, FeedRow, spentByDay, type FeedItem } from "@/components/Feed";
import { safe } from "@/components/safe";
import { Confirm, Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { Msg } from "@/components/ui";
import { CURRENCY, KINDS, SHARED, type Kind } from "@/lib/money";

export type Row = {
  id: number; date: string; type: Kind; category: string; amount: number; account: string; toAccount: string;
  member: string; note: string; shown: string; isAuto: boolean; isFee: boolean;
};

const item = (r: Row): FeedItem => ({ key: String(r.id), date: r.date, kind: r.type, title: r.category, amount: r.amount,
  account: r.account, to: r.toAccount, who: r.member, note: r.shown, auto: r.isAuto, fee: r.isFee });

export function TxList({ rows, total, categories, accounts, members, kindOf, showWho }: {
  rows: Row[]; total: number; categories: string[]; accounts: string[]; members: string[]; kindOf: Record<string, Kind>;
  showWho: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Row | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [asking, setAsking] = useState<number[] | null>(null);
  const [busy, start] = useTransition();
  const shown = rows;

  function remove(ids: number[]) {
    start(async () => {
      const r = await safe(() => deleteTransactions(ids));
      setAsking(null);
      if (!r.ok) return toast(r.error, { tone: "warn" });
      setPicked(new Set());
      setSelecting(false);
      setEditing(null);
      toast(`${r.message}.`, { action: { label: "Undo", run: () => start(async () => {
        const back = await safe(() => restoreTransactions(r.rows));
        toast(back.ok ? back.message : back.error, back.ok ? undefined : { tone: "warn" });
      }) } });
    });
  }

  let last: string | null = null;
  const spentOn = spentByDay(shown);
  return (
    <>
      <div className="btns" style={{ justifyContent: "space-between", marginBottom: ".2rem" }}>
        <span className="caption" style={{ margin: 0 }}>{selecting ? "Tick entries to delete." : "Tap an entry to change it."}</span>
        <div className="btns">
          {selecting && picked.size ? (
            <button type="button" className="btn danger" onClick={() => setAsking([...picked])}>Delete {picked.size}</button>
          ) : null}
          <button type="button" className="btn ghost" onClick={() => { setSelecting(!selecting); setPicked(new Set()); }}>
            {selecting ? "Done" : "Select"}
          </button>
        </div>
      </div>
      <div className="feed">
        {shown.map((r) => {
          const head = r.date !== last ? <DayHead date={r.date} spent={spentOn.get(r.date) ?? 0} /> : null;
          last = r.date;
          return (
            <div key={r.id}>
              {head}
              {selecting ? (
                <label className="feed-row" style={{ cursor: "pointer" }}>
                  <input type="checkbox" className="feed-check" checked={picked.has(r.id)} aria-label={`Select ${r.category}`}
                    onChange={(e) => {
                      const s = new Set(picked);
                      if (e.target.checked) s.add(r.id); else s.delete(r.id);
                      setPicked(s);
                    }} />
                  <FeedRow i={item(r)} showWho={showWho} />
                </label>
              ) : (
                <button type="button" className="feed-row" onClick={() => setEditing(r)}>
                  <FeedRow i={item(r)} showWho={showWho} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {total > shown.length ? <p className="caption">Showing the newest {shown.length}. Pick a month to see the rest.</p> : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Change an entry">
        {editing ? (
          <EditForm key={editing.id} row={editing} categories={categories} accounts={accounts} members={members}
            kindOf={kindOf} onDone={() => setEditing(null)} onDelete={() => setAsking([editing.id])} />
        ) : null}
      </Sheet>
      <Confirm open={asking !== null} busy={busy} onCancel={() => setAsking(null)} onConfirm={() => asking && remove(asking)}
        message={`Delete ${asking?.length === 1 ? "this transaction" : `${asking?.length} transactions`}? You can undo this straight after.`} />
    </>
  );
}

function EditForm({ row, categories, accounts, members, kindOf, onDone, onDelete }: {
  row: Row; categories: string[]; accounts: string[]; members: string[]; kindOf: Record<string, Kind>;
  onDone: () => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [v, setV] = useState({ ...row, amount: String(row.amount), note: row.note });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v, x: string) => setV((o) => ({ ...o, [k]: x }));
  const cats = categories.includes(v.category) ? categories : [v.category, ...categories];
  const accts = [...new Set([...accounts, ...(row.account ? [row.account] : []), ...(row.toAccount ? [row.toAccount] : [])])];
  const usual = kindOf[v.category];
  const amount = Number(v.amount);
  const problem = !(amount > 0) ? "Enter an amount above zero."
    : v.type === "Transfer" && (!v.account || !v.toAccount) ? "A transfer needs both a from and a to account."
      : v.type === "Transfer" && v.account === v.toAccount ? "A transfer needs two different accounts." : null;

  function save() {
    start(async () => {
      const r = await safe(() => updateTransaction({ id: row.id, date: v.date, type: v.type, category: v.category, amount,
        account: v.account, toAccount: v.toAccount, member: v.member || SHARED, note: v.note }));
      if (!r.ok) return setError(r.error);
      toast(r.message);
      onDone();
    });
  }
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="seg" role="group" aria-label="Type">
        {KINDS.map((k) => <button key={k} type="button" aria-pressed={k === v.type} onClick={() => set("type", k)}>{k}</button>)}
      </div>
      <div className="row2">
        <label className="field"><span>Amount ({CURRENCY})</span>
          <input className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={v.amount}
            onChange={(e) => set("amount", e.target.value)} />
        </label>
        <label className="field"><span>Date</span>
          <input className="input" type="date" value={v.date} onChange={(e) => e.target.value && set("date", e.target.value)} />
        </label>
      </div>
      <label className="field"><span>Category</span>
        <select className="input" value={v.category} onChange={(e) => set("category", e.target.value)}>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {usual && usual !== v.type ? (
        <Msg tone="warn">{v.category} is usually {usual.toLowerCase()}, but this is marked {v.type.toLowerCase()}.</Msg>
      ) : null}
      <div className="row2">
        <label className="field"><span>{v.type === "Transfer" ? "From" : "Account"}</span>
          <select className="input" value={v.account} onChange={(e) => set("account", e.target.value)}>
            <option value="">—</option>
            {accts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        {v.type === "Transfer" ? (
          <label className="field"><span>To</span>
            <select className="input" value={v.toAccount} onChange={(e) => set("toAccount", e.target.value)}>
              <option value="">—</option>
              {accts.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        ) : (
          <label className="field"><span>Who</span>
            <input className="input" list="tx-members" value={v.member} maxLength={50} onChange={(e) => set("member", e.target.value)} />
            <datalist id="tx-members">{members.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
        )}
      </div>
      <label className="field"><span>Note</span>
        <input className="input" value={v.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
      </label>
      {problem ? <Msg>{problem}</Msg> : null}
      {error ? <div className="note error">{error}</div> : null}
      <div className="btns" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
        <button type="submit" className="btn primary" disabled={busy || Boolean(problem)}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}
