import Link from "next/link";
import { AddEntryButton } from "@/components/AddEntry";
import { BudgetList } from "@/components/Budgets";
import { activity, Feed } from "@/components/Feed";
import { TodayMeals } from "@/components/kitchen/TodayMeals";
import { MonthSelect } from "@/components/MonthSelect";
import { Empty, Kpi, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { previousMonth } from "@/lib/book";
import { monthDays, monthName, monthOf, monthShort, today } from "@/lib/dates";
import { loadBook, windowStart } from "@/lib/load";
import { money } from "@/lib/money";
import { changeText } from "@/lib/words";

export const metadata = { title: "Home" };

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [user, base, sp] = await Promise.all([requireUser(), loadBook(), searchParams]);
  const now = today();
  const months = base.months(now);
  const period = sp.month && months.includes(sp.month) ? sp.month : monthOf(now);
  // an older month than the usual window is read on its own (with the month before, for the comparison)
  const b = `${period}-01` < windowStart(now) ? await loadBook(period) : base;

  // income and expenses, compared with last month (part-way through a month: the same days of last month)
  const [inc, exp] = b.monthTotals(period);
  const prev = previousMonth(period);
  const sameDays = period === monthOf(now);
  const upto = sameDays ? Math.min(Number(now.slice(8)), monthDays(prev)) : undefined;
  const [pInc, pExp] = b.monthTotals(prev, sameDays ? Number(now.slice(8)) : undefined);
  const versus = sameDays ? `1–${upto} ${monthShort(prev)}` : "last month";
  const incPill = changeText(inc, pInc, true, versus);
  const expPill = changeText(exp, pExp, false, versus);
  const total = b.budgetTotal(period);
  const net = inc - exp;

  const status = b.budgetStatus(period);
  const over = status.filter((s) => s.spent > s.limit).length;
  const items = activity(b, 6);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{monthName(monthOf(now))}</div>
          <h1 className="page-title">Hello, {user.name}</h1>
        </div>
        <MonthSelect months={months} value={period} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="stack">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={`Income · ${monthShort(period)}`} value={money(inc)} foot={<Pill tone={incPill.tone}>{incPill.text}</Pill>} />
            <Kpi label={`Expenses · ${monthShort(period)}`} value={money(exp)} foot={<Pill tone={expPill.tone}>{expPill.text}</Pill>} />
            <Kpi label="Net this month" value={money(net, true)} tone={net < 0 ? "out" : "in"} foot={net < 0 ? "Spent more than came in" : "Kept"} />
            <Kpi label="Budget left" value={total ? money(total.left) : "—"} tone={total && total.left < 0 ? "out" : undefined}
              foot={total ? `${money(total.spent)} of ${money(total.limit)}` : <Link href="/budgets">Set a budget</Link>} />
          </div>

          {b.accountNames.length ? <AddEntryButton /> : (
            <div className="note">Add an account first in <Link href="/settings">Settings → Accounts</Link>.</div>
          )}

          {b.feature("kitchen") ? <TodayMeals /> : null}

        </div>

        <div className="stack">
          <details className="card">
            <summary>Budgets<span className="section-aside ml-auto">{monthName(period, false)}{over ? ` · ${over} over` : ""}</span></summary>
            {status.length ? <BudgetList status={status} /> : (
              <Empty>No monthly budgets yet. <Link href="/budgets">Set a budget</Link></Empty>
            )}
          </details>
          <details className="card">
            <summary>Recent activity</summary>
            {items.length ? (
              <>
                <Feed items={items} showWho={b.multiMember} names={b.users.length > 1 ? b.nameOfUser : undefined} />
                <Link className="btn ghost mt-1" href="/transactions">See all transactions</Link>
              </>
            ) : <Empty>Nothing recorded yet. Tap Add an entry to record your first one.</Empty>}
          </details>
        </div>
      </div>
    </>
  );
}
