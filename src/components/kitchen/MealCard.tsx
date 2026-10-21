"use client";
import { useOptimistic, useState, useTransition } from "react";
import { markBought, removeFromPlan, setMealPeople, setPlanQty, tickMeal, untick } from "@/actions/kitchen";
import { safe } from "@/components/safe";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { Msg } from "@/components/ui";
import type { MealView } from "@/lib/kitchen/views";
import { CURRENCY, money } from "@/lib/money";

export type PayInfo = { accounts: string[]; account: string | null; categories: string[]; category: string | null };
type R = { ok: boolean; message?: string; error?: string; shortText?: string };

function useRun() {
  const toast = useToast();
  const [busy, start] = useTransition();
  const run = (work: () => Promise<R>, extra?: (r: R) => void) => start(async () => {
    const r = await safe(work);
    toast(r.ok ? r.message! : r.error!, r.ok ? undefined : { tone: "warn" });
    if (r.ok) extra?.(r);
  });
  return [busy, run] as const;
}

/** A tick box that shows the change straight away, while the pantry and fridge are updated. */
function TickBox({ done, label, onTick, onUntick }: { done: boolean; label: string; onTick: () => Promise<R>; onUntick: () => Promise<R> }) {
  const toast = useToast();
  const [shown, setShown] = useOptimistic(done);
  const [busy, start] = useTransition();
  return (
    <label className="meal-label check">
      <input type="checkbox" checked={shown} disabled={busy} onChange={() => start(async () => {
        setShown(!done);
        const r: R = await safe(done ? onUntick : onTick);
        toast(r.ok ? r.message! : r.error!, r.ok ? undefined : { tone: "warn" });
        if (r.shortText) toast(`Not in the pantry, so not taken off: ${r.shortText}. They're on the shopping list now; update the pantry if you had them.`, { tone: "warn" });
      })} />
      <span>{label}</span>
    </label>
  );
}

export function MealCard({ meal, pay }: { meal: MealView; pay: PayInfo }) {
  const [busy, run] = useRun();
  const [paying, setPaying] = useState<number[] | null>(null);
  const single = !meal.multi ? meal.dishes[0] : null;
  return (
    <div className="meal">
      <PeopleHead meal={meal} />
      {single ? (
        <div className="meal-row">
          {single.kind === "bought" && single.open ? (
            <div className="meal-label">{single.name} · {single.detail} <span className="muted">{single.tag}</span></div>
          ) : (
            <TickBox done={single.done} label={`${single.name} · ${single.detail}${single.done ? ` · ${single.doneLabel}` : single.tag ? ` ${single.tag}` : ""}`}
              onTick={() => tickMeal([single.id], single.kind === "recipe" ? "cook" : "meal")} onUntick={() => untick([single.id])} />
          )}
          {single.kind === "bought" && single.open ? (
            <button type="button" className="btn small" onClick={() => setPaying([single.id])}>Bought</button>
          ) : null}
          {single.fridgeHave > 0 ? (
            <button type="button" className="btn ghost small" disabled={busy} title="Eat leftovers instead of cooking"
              onClick={() => run(() => tickMeal([single.id], "fridge"))}>Fridge ({Number(single.fridgeHave.toFixed(2))})</button>
          ) : null}
          <button type="button" className="btn ghost small" aria-label={`Remove ${single.name}`} title="Remove from the plan"
            disabled={busy} onClick={() => run(() => removeFromPlan([single.id]))}>✕</button>
        </div>
      ) : (
        <>
          <div className="meal-row">
            {meal.homeIds.length || meal.done ? (
              <TickBox done={meal.homeIds.length ? meal.homeDone : meal.done} label={`${meal.name} · ${meal.who} ${meal.tag}`.trim()}
                onTick={() => tickMeal(meal.homeIds, "meal")} onUntick={() => untick(meal.allIds)} />
            ) : <div className="meal-label">{meal.name} · {meal.who} <span className="muted">{meal.tag}</span></div>}
            {meal.boughtOpen.length ? (
              <button type="button" className="btn small" onClick={() => setPaying(meal.boughtOpen)}>Bought</button>
            ) : null}
            <button type="button" className="btn ghost small" aria-label={`Remove ${meal.name}`} title="Remove the whole meal"
              disabled={busy} onClick={() => run(() => removeFromPlan(meal.allIds))}>✕</button>
          </div>
          <details className="meal-parts">
            <summary>{meal.brief}</summary>
            {meal.dishes.map((d) => (
              <div className="meal-part" key={d.id}>
                <span>{d.note}</span>
                {d.open ? (
                  <button type="button" className="btn ghost small" aria-label={`Take ${d.name} out`} disabled={busy}
                    onClick={() => run(() => removeFromPlan([d.id]))}>✕</button>
                ) : null}
              </div>
            ))}
          </details>
        </>
      )}
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title="Bought it">
        {paying ? <PayForm meal={meal} ids={paying} pay={pay} onDone={() => setPaying(null)} /> : null}
      </Sheet>
    </div>
  );
}

function PeopleHead({ meal }: { meal: MealView }) {
  const [busy, run] = useRun();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(String(meal.people));
  if (!meal.canChangePeople) return <div className="meal-slot">{meal.head}</div>;
  return (
    <div className="meal-slot-row">
      <span className="meal-slot">{meal.head}</span>
      <button type="button" className="btn ghost small" aria-expanded={open} aria-label={`People eating ${meal.slot}`}
        title="How many are eating this meal" onClick={() => setOpen(!open)}>👥</button>
      {open ? (
        <form className="people-pop" onSubmit={(e) => {
          e.preventDefault();
          const v = Number(n);
          run(() => setMealPeople(meal.day, meal.slot, Math.abs(v - meal.usual) < 1e-9 ? null : v), () => setOpen(false));
        }}>
          <label className="field"><span>People eating</span>
            <input className="input" type="number" min="0" max="50" step="1" value={n} onChange={(e) => setN(e.target.value)} />
          </label>
          <Msg tone="hint">Usually {meal.usual}. Changes what&apos;s cooked, eaten and kept for this meal only.</Msg>
          <button className="btn primary small" disabled={busy || n === ""}>Save</button>
        </form>
      ) : null}
    </div>
  );
}

function PayForm({ meal, ids, pay, onDone }: { meal: MealView; ids: number[]; pay: PayInfo; onDone: () => void }) {
  const [busy, run] = useRun();
  const dishes = meal.dishes.filter((d) => ids.includes(d.id));
  const [paid, setPaid] = useState(meal.expected ? String(meal.expected) : "");
  const [account, setAccount] = useState(pay.account ?? pay.accounts[0] ?? "");
  const [category, setCategory] = useState(pay.category ?? pay.categories[0] ?? "");
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => markBought(ids, Number(paid), account, category), onDone); }}>
      <p style={{ margin: 0 }}>{dishes.map((d) => `${d.name} · ${d.detail}`).join(" + ")}</p>
      <label className="field"><span>Paid ({CURRENCY})</span>
        <input className="input big" type="number" inputMode="decimal" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} autoFocus />
      </label>
      <div className="field" role="group" aria-label="Paid from"><span>Paid from</span>
        <div className="chips">{pay.accounts.map((a) => (
          <button type="button" key={a} className="chip" aria-pressed={a === account} onClick={() => setAccount(a)}>{a}</button>
        ))}</div>
      </div>
      <label className="field"><span>Logged under</span>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{pay.categories.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <button className="btn primary wide" disabled={busy || !(Number(paid) > 0)}>Save {Number(paid) > 0 ? money(Number(paid)) : ""}</button>
      <Msg tone="hint">Saved as one expense, so there&apos;s no need to add it again. Untick the meal to take it back out.</Msg>
    </form>
  );
}

export function SmallerPot({ entryId, suggest, label }: { entryId: number; suggest: number; label: string }) {
  const [busy, run] = useRun();
  return (
    <button type="button" className="btn ghost small" disabled={busy} title="Plans a smaller pot. Or add more meals of it that week to use it up."
      onClick={() => run(() => setPlanQty(entryId, suggest))}>{label}</button>
  );
}
