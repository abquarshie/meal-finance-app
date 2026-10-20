import Link from "next/link";
import { AddEntryButton } from "@/components/AddEntry";
import { BudgetList } from "@/components/Budgets";
import { activity, Feed } from "@/components/Feed";
import { MonthSelect } from "@/components/MonthSelect";
import { Spending } from "@/components/Spending";
import { Empty, Msg, PageHead, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { previousMonth } from "@/lib/book";
import { dayMonth, daysBetween, monthDays, monthName, monthOf, monthShort, today } from "@/lib/dates";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { bannerIsRed, bannerLabel, changeText, committedText } from "@/lib/words";

export const metadata = { title: "Home" };

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [user, b, sp] = await Promise.all([requireUser(), loadBook(), searchParams]);
  const now = today();
  const months = b.months(now);
  const period = sp.month && months.includes(sp.month) ? sp.month : monthOf(now);
  const p = b.spendingPower(now);
  const committed = committedText(p);

  // income and expenses, compared with last month (part-way through a month: the same days of last month)
  const [inc, exp] = b.monthTotals(period);
  const prev = previousMonth(period);
  const sameDays = period === monthOf(now);
  const upto = sameDays ? Math.min(Number(now.slice(8)), monthDays(prev)) : undefined;
  const [pInc, pExp] = b.monthTotals(prev, sameDays ? Number(now.slice(8)) : undefined);
  const versus = sameDays ? `1–${upto} ${monthShort(prev)}` : "last month";
  const incPill = changeText(inc, pInc, true, versus);
  const expPill = changeText(exp, pExp, false, versus);

  const balances = [...b.balances()];
  const everyday = new Set(b.everydayAccounts);
  const status = b.budgetStatus(period);
  const spent = b.monthExpenses(period);
  const sumBy = (key: "group" | "category") => [...spent.reduce((m, t) => m.set(t[key], (m.get(t[key]) ?? 0) + t.amount),
    new Map<string, number>())].sort((x, y) => y[1] - x[1]);
  const next = b.nextAuto();
  const items = activity(b, 5);

  return (
    <>
      <PageHead title={`Hello, ${user.name}`} />
      <div className="grid2">
        <div className="stack">
          <div className={`hero${bannerIsRed(p) ? " over" : ""}`} data-state={p.state}>
            <div className="hero-label">{bannerLabel(p, now)}</div>
            <div className="hero-value">{money(p.left)}</div>
          </div>
          {committed ? <p className="caption" style={{ marginTop: "-.4rem" }}>{committed}</p> : null}
          <details className="card">
            <summary>Account balances</summary>
            <div className="bal-rows">
              {balances.filter(([n]) => everyday.has(n)).map(([n, v]) => (
                <div className="bal-row" key={n}><span>{n}</span><b className={v < 0 ? "neg" : ""}>{money(v)}</b></div>
              ))}
            </div>
            {balances.some(([n]) => !everyday.has(n)) ? (
              <div className="bal-rows bal-savings">
                {balances.filter(([n]) => !everyday.has(n)).map(([n, v]) => (
                  <div className="bal-row" key={n}><span>{n}<i className="tag">savings</i></span>
                    <b className={v < 0 ? "neg" : ""}>{money(v)}</b></div>
                ))}
              </div>
            ) : null}
            <p className="caption">Savings are never counted as money to spend. Which accounts are everyday money is set in
              Settings → Accounts.</p>
            {next ? (
              <p className="caption">Next auto entry: {next.name}, {money(next.amount)},{" "}
                {daysBetween(now, next.nextDate) <= 0 ? "today" : daysBetween(now, next.nextDate) === 1 ? "tomorrow" : dayMonth(next.nextDate)}.</p>
            ) : null}
            {b.unassigned ? (
              <Msg tone="warn">{b.unassigned} older entr{b.unassigned === 1 ? "y has" : "ies have"} no account, so balances
                may be off. Fix this in Settings → Accounts.</Msg>
            ) : null}
          </details>
          {b.accountNames.length ? <AddEntryButton /> : (
            <div className="note">Add an account first in <Link href="/settings">Settings → Accounts</Link>.</div>
          )}
        </div>

        <div className="stack">
          <MonthSelect months={months} value={period} />
          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-label">Income</div><div className="kpi-value">{money(inc)}</div>
              <Pill tone={incPill.tone}>{incPill.text}</Pill></div>
            <div className="kpi"><div className="kpi-label">Expenses</div><div className="kpi-value">{money(exp)}</div>
              <Pill tone={expPill.tone}>{expPill.text}</Pill></div>
          </div>
          <details className="card" open>
            <summary>Budgets and spending · {monthName(period, false)}</summary>
            {status.length ? <BudgetList status={status} /> : (
              <Empty>No monthly budgets yet. <Link href="/budgets">Set a budget</Link></Empty>
            )}
            <h3 className="section-title" style={{ margin: "1.2rem 0 .5rem" }}>Where the money went</h3>
            {spent.length ? <Spending groups={sumBy("group")} categories={sumBy("category")} /> : <Empty>No expenses this month.</Empty>}
          </details>
          <details className="card">
            <summary>Recent activity</summary>
            {items.length ? (
              <>
                <Feed items={items} showWho={b.multiMember} names={b.users.length > 1 ? b.nameOfUser : undefined} />
                <Link className="btn ghost" href="/transactions">See all transactions</Link>
              </>
            ) : <Empty>Nothing recorded yet. Tap Add an entry to record your first one.</Empty>}
          </details>
        </div>
      </div>
    </>
  );
}
