import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { Empty, Msg, Pill, Section } from "@/components/ui";
import { monthName, monthOf, today as todayISO } from "@/lib/dates";
import { SUPPLIES_CATEGORY, SUPPLIES_GROUP } from "@/lib/kitchen/catalog-names";
import { foodBudget, guard } from "@/lib/kitchen/kitchen";
import { loadKitchen } from "@/lib/kitchen/load";
import { sk } from "@/lib/kitchen/logic";
import { baseOf, fmtStock, toBase } from "@/lib/kitchen/units";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { AddSupply, BudgetSetter, StarterSupplies, Stepper } from "./SupplyForms";

export const metadata = { title: "Household supplies" };

export default async function Household() {
  const [k, b] = await Promise.all([loadKitchen(), loadBook()]);
  const today = todayISO();
  const items = [...k.supplies].sort((x, y) => ((k.names.get(x) ?? "").toLowerCase() < (k.names.get(y) ?? "").toLowerCase() ? -1 : 1));
  const cats = new Set([...k.supplyCategories].filter(Boolean));
  const fb = cats.size ? foodBudget(b, cats, today) : null;
  const g = fb ? guard(k, b, today, "household") : null;
  const target = b.groups.includes(SUPPLIES_GROUP) ? SUPPLIES_GROUP : [...cats].sort()[0] ?? SUPPLIES_CATEGORY;
  const expense = b.categoryNames("Expense");
  return (
    <>
      <KitchenHead current="/meals/household" title="Household supplies" sub="Washing powder, bleach, toilet roll… with their own budget, kept apart from food" />
      {!items.length ? <StarterSupplies /> : null}
      <div className="grid32">
        <div className="card">
          <Section title="What's in the house" aside={`${items.length} item${items.length === 1 ? "" : "s"}`} />
          {!items.length ? <Empty>No household items yet.</Empty> : items.map((i) => {
            const usual = k.unitOf.get(i) ?? "pcs";
            const base = baseOf(usual);
            const have = k.pantry.get(sk(i, base)) ?? 0;
            const level = k.lowLevels.get(sk(i, base));
            const pack = k.pack(i);
            const [step, stepName] = pack && pack[2] === base ? [pack[1], pack[0]] : [toBase(1, usual)[0], usual];
            return (
              <div className="rule" key={i}>
                <div style={{ minWidth: 0 }}>
                  <div className="rule-name">{k.names.get(i)}{have <= 0 ? <Pill tone="out">Out</Pill> : level !== undefined && have <= level ? <Pill tone="warn">Low</Pill> : null}</div>
                  <div className="rule-meta">{have > 0 ? fmtStock(have, base, pack, usual) : "none"}</div>
                </div>
                <Stepper ing={i} base={base} step={step} stepName={stepName} have={have} />
              </div>
            );
          })}
          <p className="caption">Tap − when one runs out and + when you bring one home. Shopping trips add to these by themselves; anything low goes on the shopping list.</p>
        </div>
        <div className="stack">
          <div className="card form">
            <Section title="Household budget" aside={monthName(monthOf(today), false)} />
            {fb ? (
              <>
                <div className="prog-head"><span>{fb.names.join(" and ")}</span><b className="num">{money(fb.spent)} of {money(fb.limit)}</b></div>
                <div className="bar"><div className={`fill ${fb.spent / fb.limit > 1 ? "over" : fb.spent / fb.limit >= 0.75 ? "warn" : "ok"}`}
                  style={{ width: `${Math.min((fb.spent / fb.limit) * 100, 100)}%` }} /></div>
                {g ? <Msg tone={g[0] as "warn"}>{g[1]}</Msg> : null}
                <p className="caption">Change it under Plan → Budgets.</p>
              </>
            ) : <BudgetSetter target={target} />}
          </div>
          <AddSupply categories={[...new Set([SUPPLIES_CATEGORY, ...expense])]} taken={[...k.names.values()].map((n) => n.toLowerCase())} />
        </div>
      </div>
    </>
  );
}
