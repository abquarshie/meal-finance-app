import { BudgetList } from "@/components/Budgets";
import { Empty, PageHead, Section, Tabs } from "@/components/ui";
import { monthName, monthOf, today } from "@/lib/dates";
import { loadBook } from "@/lib/load";
import { BudgetForms } from "./BudgetForms";

export const metadata = { title: "Budgets" };

export default async function Budgets() {
  const b = await loadBook();
  const period = monthOf(today());
  const status = b.budgetStatus(period);
  // every expense group, then its categories, as budget choices
  const targets: { key: string; label: string; isGroup: boolean; group: string }[] = [];
  for (const g of b.groups) {
    const inGroup = b.categories.filter((c) => c.groupName === g && c.kind === "Expense");
    if (!inGroup.length) continue;
    targets.push({ key: g, label: `${g} (whole group)`, isGroup: true, group: g });
    for (const c of inGroup) if (c.name !== g) targets.push({ key: c.name, label: `${g} › ${c.name}`, isGroup: false, group: g });
  }
  const spentBy: Record<string, number> = {};
  for (const t of b.monthExpenses(period)) {
    spentBy[t.group] = (spentBy[t.group] ?? 0) + t.amount;
    spentBy[t.category] = (spentBy[t.category] ?? 0) + t.amount;
  }
  return (
    <>
      <PageHead title="Plan" />
      <Tabs current="/budgets" tabs={[{ href: "/budgets", label: "Budgets" },
        ...(b.feature("goals") ? [{ href: "/goals", label: "Goals" }] : [])]} />
      <p className="page-sub" style={{ margin: "-.4rem 0 1rem" }}>A monthly limit for a whole group, like Food, or for one category</p>
      <div className="grid32">
        <div className="card">
          <Section title="This month" aside={monthName(period)} />
          {status.length ? <BudgetList status={status} /> : <Empty>No budgets yet. Set your first one on this page.</Empty>}
        </div>
        {targets.length ? (
          <BudgetForms targets={targets} spent={spentBy} month={monthName(period, false)}
            current={Object.fromEntries(b.budgets.map((x) => [x.category, x.monthlyLimit]))} />
        ) : <div className="card"><Empty>Add expense categories first in Settings → Categories.</Empty></div>}
      </div>
    </>
  );
}
