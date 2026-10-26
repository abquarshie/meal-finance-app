"use client";
// The add-entry form. Built for speed on a phone: type the amount, tap a category, tap Save.
// - Amount, category and account up front. The ones used last are already picked; the most-used are one-tap chips.
// - What was bought (the note) sits under the account. Date, who it was for and any fee sit under "More details". The date is Today unless changed there.
// - After a category is picked, "Same as last time" fills in the last amount used.
// - A pasted MoMo text fills the form in.
import { useEffect, useMemo, useState, useTransition } from "react";
import { addEntry, categoryFor } from "@/actions/entries";
import { addDays } from "@/lib/dates";
import type { EntryContext } from "@/lib/entry";
import { CURRENCY, FEE_CATEGORY, KINDS, money, SHARED, type Kind } from "@/lib/money";
import { describeMomo, parseMomo } from "@/lib/momo";
import { Icon } from "./icons";
import { quiet, safe } from "./safe";
import { Sheet } from "./Sheet";
import { useToast } from "./Toaster";
import { Msg } from "./ui";

const SAVE_LABEL: Record<Kind, string> = { Expense: "Save expense", Income: "Save income", Transfer: "Save transfer" };
type When = "Today" | "Yesterday" | "Other day";
type Tip = { tone: "ok" | "hint" | "warn" | "error"; text: string };
export const OPEN_EVENT = "cashew:add-entry";

function Chips({ label, options, value, onPick, all, labelOf, searchLabel }: {
  label: string; options: string[]; value: string | null; onPick: (v: string) => void; all?: string[];
  labelOf?: (v: string) => string; searchLabel?: string;
}) {
  // the current choice always shows, even when it's not among the usual ones
  const shown = value && !options.includes(value) ? [value, ...options.slice(0, Math.max(options.length - 1, 0))] : options;
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="chips">
        {shown.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => onPick(o)}>{o}</button>
        ))}
      </div>
      {all && all.length > shown.length ? (
        <select className="input" aria-label={searchLabel} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
          <option value="">{searchLabel}…</option>
          {all.map((o) => <option key={o} value={o}>{labelOf ? labelOf(o) : o}</option>)}
        </select>
      ) : null}
    </div>
  );
}

function Accounts({ ctx, label, value, onPick, exclude }: {
  ctx: EntryContext; label: string; value: string | null; onPick: (v: string) => void; exclude?: string | null;
}) {
  const names = ctx.accounts.filter((a) => a !== exclude);
  return names.length <= 6
    ? <Chips label={label} options={names} value={value} onPick={onPick} />
    : <Chips label={label} options={names.slice(0, 5)} value={value} onPick={onPick} all={names} searchLabel="Other account" />;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function AddEntry({ ctx }: { ctx: EntryContext }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  if (!ctx.accounts.length) return null;
  return (
    <>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add an entry">
        <EntryForm ctx={ctx} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** The big button on Home and Money that opens the form. */
export function AddEntryButton() {
  return (
    <button type="button" className="btn primary wide big" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      <Icon name="add" /> Add an entry
    </button>
  );
}

function EntryForm({ ctx, onDone }: { ctx: EntryContext; onDone: () => void }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [kind, setKind] = useState<Kind>("Expense");
  const [amount, setAmount] = useState("");
  const [cats, setCats] = useState<Record<Kind, string | null>>(() => ({ ...ctx.defaultCategory }));
  const [accts, setAccts] = useState<Record<Kind, string | null>>(() => ({ ...ctx.defaultAccount }));
  const [to, setTo] = useState<string | null>(() => {
    const from = ctx.defaultAccount.Transfer;
    const others = ctx.accounts.filter((a) => a !== from);
    return ctx.defaultTo && ctx.defaultTo !== from ? ctx.defaultTo : others[0] ?? null;
  });
  const [when, setWhen] = useState<When>("Today");
  const [otherDay, setOtherDay] = useState(addDays(ctx.today, -2));
  const [note, setNote] = useState("");
  const [who, setWho] = useState(SHARED);
  const [fee, setFee] = useState("");
  const [momoText, setMomoText] = useState("");
  const [momoTips, setMomoTips] = useState<Tip[] | null>(null);
  const [momoId, setMomoId] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const names = ctx.categories[kind];
  const category = cats[kind] && names.includes(cats[kind]!) ? cats[kind] : names[0] ?? null;
  const account = accts[kind] && ctx.accounts.includes(accts[kind]!) ? accts[kind] : ctx.accounts[0];
  const toAcct = to && to !== account ? to : ctx.accounts.find((a) => a !== account) ?? null;
  const date = when === "Today" ? ctx.today : when === "Yesterday" ? addDays(ctx.today, -1) : otherDay;
  const amt = num(amount);
  const feeAmt = num(fee);
  const last = category ? ctx.last[`${kind}|${category}`] : undefined;

  const details = useMemo(() => {
    const bits = [when === "Other day" ? "another day" : when];
    if (kind !== "Transfer" && who !== SHARED) bits.push(`for ${who}`);
    if (feeAmt) bits.push(`${money(feeAmt)} fee`);
    return bits.join(", ");
  }, [when, kind, who, feeAmt]);
  const busyDetails = when !== "Today" || Boolean(feeAmt) || (kind !== "Transfer" && who !== SHARED);

  const sameAccounts = kind === "Transfer" && account === toAcct;
  const leaves = amt && kind !== "Income" && account ? (ctx.balances[account] ?? 0) - amt - (feeAmt ?? 0) : null;

  function pick(setter: typeof setCats | typeof setAccts, k: Kind, v: string) {
    setter((x) => ({ ...x, [k]: v }));
    setDup(null);
  }

  async function readMomo() {
    const found = parseMomo(momoText);
    if (!momoText.trim()) return setMomoTips(null);
    if (!found) {
      return setMomoTips([{ tone: "error", text: "That doesn't look like a mobile money message. Copy the whole text, including the GHS amount." }]);
    }
    setKind(found.kind);
    setAmount(String(found.amount));
    setFee(found.fee ? String(found.fee) : "");
    setNote([found.party, found.reference].filter(Boolean).join(" – "));
    setMomoId(found.txnId);
    const d = found.date ?? ctx.today;
    if (d === ctx.today) setWhen("Today");
    else if (d === addDays(ctx.today, -1)) setWhen("Yesterday");
    else { setWhen("Other day"); setOtherDay(d); }
    const momo = ctx.momoAccount;
    if (found.kind === "Transfer") {
      const cash = ctx.accounts.includes("Cash") ? "Cash" : null;
      const [src, dst] = found.direction === "cash_out" ? [momo, cash] : [cash, momo];
      if (src) setAccts((x) => ({ ...x, Transfer: src }));
      if (dst) setTo(dst);
    } else {
      if (momo) setAccts((x) => ({ ...x, [found.kind]: momo }));
      let cat = found.categoryHints.find((h) => ctx.categories[found.kind].includes(h)) ?? null;
      if (!cat && found.party) cat = await quiet(() => categoryFor(found.kind, found.party), null);
      if (cat) setCats((x) => ({ ...x, [found.kind]: cat }));
    }
    const tips: Tip[] = [{ tone: "ok", text: `${describeMomo(found, ctx.today)}. Check the details, then save.` }];
    if (!momo) {
      tips.push({ tone: "hint", text: "Tip: add an account called MoMo in Settings → Accounts and these will go there automatically." });
    } else if (found.balance !== null) {
      const sign = found.kind === "Income" || found.direction === "cash_in" ? 1 : -1;
      const after = (ctx.balances[momo] ?? 0) + sign * found.amount - found.fee;
      if (Math.abs(after - found.balance) >= 0.01) {
        tips.push({ tone: "warn", text: `Your MoMo balance is ${money(found.balance)}; Cashew will show ${money(after)} for ${momo} after this, so an earlier entry may be missing.` });
      }
    }
    setMomoTips(tips);
    setDup(null);
  }

  function save(confirmed = false) {
    setError(null);
    if (!amt) return setError("Enter an amount first.");
    if (!category || !account) return setError("Pick a category and an account.");
    if (sameAccounts) return setError("Pick two different accounts.");
    start(async () => {
      const r = await safe(() => addEntry({ kind, amount: amt, fee: feeAmt, date, category, account,
        to: kind === "Transfer" ? toAcct : null, who: kind === "Transfer" ? SHARED : who.trim() || SHARED,
        note, momoId, confirmed }));
      if ("duplicate" in r) return setDup(r.duplicate);
      if (!r.ok) return setError(r.error);
      toast(r.message);
      for (const a of r.alerts) toast(a, { tone: "warn" });
      // clear what changes every time; keep the type, accounts and category for the next entry
      setAmount(""); setFee(""); setNote(""); setDup(null); setWhen("Today");
      setMomoText(""); setMomoTips(null); setMomoId(null);
      onDone();
    });
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <details className="more" open={Boolean(momoTips)}>
        <summary>Paste a MoMo text</summary>
        <div className="form">
          <textarea className="input" aria-label="MoMo text" value={momoText} onChange={(e) => setMomoText(e.target.value)}
            placeholder="Paste the whole message, e.g. Payment made for GHS 50.00 to …" />
          <div className="btns">
            <button type="button" className="btn" onClick={readMomo}>Fill in the form</button>
            {momoTips ? <button type="button" className="btn ghost" onClick={() => { setMomoText(""); setMomoTips(null); setMomoId(null); }}>Clear</button> : null}
          </div>
          {momoTips?.map((t, i) => <Msg key={i} tone={t.tone}>{t.text}</Msg>)}
        </div>
      </details>

      <div className="seg" role="group" aria-label="Type">
        {KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={k === kind} onClick={() => { setKind(k); setDup(null); }}>{k}</button>
        ))}
      </div>

      {!names.length ? <Msg tone="warn">There are no {kind.toLowerCase()} categories yet. Add one in Settings → Categories.</Msg> : null}

      <label className="field">
        <span>Amount ({CURRENCY})</span>
        <input className="input big" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" autoFocus
          value={amount} onChange={(e) => { setAmount(e.target.value); setDup(null); }} />
      </label>

      {kind === "Transfer" ? (
        <>
          <Accounts ctx={ctx} label="From" value={account} onPick={(v) => pick(setAccts, "Transfer", v)} />
          <Accounts ctx={ctx} label="To" value={toAcct} exclude={account} onPick={(v) => { setTo(v); setDup(null); }} />
          {sameAccounts ? <Msg>Pick a different account to move the money into.</Msg> : null}
          <Chips label="Purpose" options={names.slice(0, 6)} value={category} all={names} searchLabel="Other purpose"
            onPick={(v) => pick(setCats, "Transfer", v)} />
        </>
      ) : (
        <>
          <Chips label="Category" options={ctx.top[kind]} value={category} all={names} labelOf={(c) => ctx.labels[c] ?? c}
            searchLabel="Search all categories" onPick={(v) => pick(setCats, kind, v)} />
          {last && !amt ? (
            <button type="button" className="btn ghost" style={{ justifySelf: "start" }} onClick={() => setAmount(String(last))}>
              Same as last time: {money(last)}
            </button>
          ) : null}
          <Accounts ctx={ctx} label="Account" value={account} onPick={(v) => pick(setAccts, kind, v)} />
        </>
      )}

      <label className="field"><span>{kind === "Expense" ? "Item bought / description" : "Description"}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
          placeholder={kind === "Expense" ? "Optional, e.g. Rice and tomatoes, Makola" : kind === "Income" ? "Optional, e.g. October salary" : "Optional"} />
      </label>

      <details className="more" open={busyDetails || undefined}>
        <summary>More details · {details}</summary>
        <div className="form">
          <div className="chips" role="group" aria-label="When">
            {(["Today", "Yesterday", "Other day"] as When[]).map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={w === when} onClick={() => { setWhen(w); setDup(null); }}>{w}</button>
            ))}
          </div>
          {when === "Other day" ? (
            <>
              <input className="input" type="date" aria-label="Date" value={otherDay} onChange={(e) => e.target.value && setOtherDay(e.target.value)} />
              {otherDay > ctx.today ? <Msg tone="warn">This date is in the future.</Msg> : null}
            </>
          ) : null}
          {kind === "Transfer" || feeAmt ? (
            <label className="field"><span>Fee ({CURRENCY}), optional</span>
              <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={fee}
                onChange={(e) => setFee(e.target.value)} />
              <Msg tone="hint">MoMo or bank charges. Saved as a separate {FEE_CATEGORY} expense.</Msg>
            </label>
          ) : null}
          {kind !== "Transfer" ? (
            <label className="field"><span>Who was it for?</span>
              <input className="input" list="cashew-members" value={who} onChange={(e) => setWho(e.target.value)} maxLength={50} />
              <datalist id="cashew-members">{ctx.members.map((m) => <option key={m} value={m} />)}</datalist>
              <Msg tone="hint">Leave as {SHARED} unless you track spending per person. Type a name to add someone.</Msg>
            </label>
          ) : null}
        </div>
      </details>

      {amt && feeAmt && feeAmt >= amt ? <Msg tone="warn">The fee is as big as the amount moved. Check both figures.</Msg> : null}
      {leaves !== null && leaves < 0 ? <Msg tone="warn">This leaves {account} at {money(leaves)}.</Msg> : null}
      {error ? <div className="note error">{error}</div> : null}

      {dup ? (
        <div className="note warn">
          <div style={{ marginBottom: ".6rem" }}>{dup}</div>
          <div className="btns">
            <button type="button" className="btn primary" disabled={busy} onClick={() => save(true)}>Save anyway</button>
            <button type="button" className="btn" onClick={() => setDup(null)}>Don&apos;t save</button>
          </div>
        </div>
      ) : (
        <>
          <button type="submit" className="btn primary wide big" disabled={busy || sameAccounts || !names.length}>
            {busy ? "Saving…" : SAVE_LABEL[kind]}
          </button>
          {!amt ? <Msg tone="hint">Enter an amount to save.</Msg> : null}
        </>
      )}
    </form>
  );
}
