import Link from "next/link";
import { AddEntryButton } from "@/components/AddEntry";
import { BudgetList } from "@/components/Budgets";
import { activity, Feed } from "@/components/Feed";
import { MonthSelect } from "@/components/MonthSelect";
import { Empty, Kpi, Msg, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { previousMonth } from "@/lib/book";
import { dayMonth, daysBetween, monthDays, monthName, monthOf, monthShort, today } from "@/lib/dates";
import { loadBook, windowStart } from "@/lib/load";
import { money } from "@/lib/money";
import { bannerIsRed, bannerLabel, changeText, committedText } from "@/lib/words";

export const metadata = { title: "Home" };

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [user, base, sp] = await Promise.all([requireUser(), loadBook(), searchParams]);
  const now = today();
  const months = base.months(now);
  const period = sp.month && months.includes(sp.month) ? sp.month : monthOf(now);
  // an older month than the usual window is read on its own (with the month before, for the comparison)
  const b = `${period}-01` < windowStart(now) ? await loadBook(period) : base;
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
  const total = b.budgetTotal(period);
  const net = inc - exp;

  const balances = [...b.balances()];
  const everyday = new Set(b.everydayAccounts);
  const status = b.budgetStatus(period);
  const next = b.nextAuto();
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
          <div className={`rounded-3xl p-5 text-white shadow-soft md:p-6 ${bannerIsRed(p) ? "bg-hero-over" : "bg-hero"}`} data-state={p.state}>
            <div className="text-sm font-medium text-white/70">{bannerLabel(p, now)}</div>
            <div className="num mt-1 text-4xl font-bold tracking-tight [overflow-wrap:anywhere] md:text-5xl">{money(p.left)}</div>
            {committed ? <p className="mt-3 text-[13px] leading-snug text-white/70">{committed}</p> : null}
          </div>

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

          <div className="card">
            <div className="section"><h2 className="section-title">Accounts</h2>
              <span className="section-aside">{next ? `Next auto: ${next.name}, ${money(next.amount)}, ${
                daysBetween(now, next.nextDate) <= 0 ? "today" : daysBetween(now, next.nextDate) === 1 ? "tomorrow" : dayMonth(next.nextDate)}` : ""}</span>
            </div>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {balances.map(([n, v]) => (
                <div className="flex justify-between gap-3 border-b border-line py-2 text-sm" key={n}>
                  <span className="truncate text-muted">{n}{everyday.has(n) ? null : <i className="tag">savings</i>}</span>
                  <b className={`num font-semibold${v < 0 ? " text-out" : ""}`}>{money(v)}</b>
                </div>
              ))}
            </div>
            {b.unassigned ? (
              <Msg tone="warn">{b.unassigned} older entr{b.unassigned === 1 ? "y has" : "ies have"} no account, so balances
                may be off. Fix this in Settings → Accounts.</Msg>
            ) : null}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="section"><h2 className="section-title">Budgets</h2><span className="section-aside">{monthName(period, false)}</span></div>
            {status.length ? <BudgetList status={status} /> : (
              <Empty>No monthly budgets yet. <Link href="/budgets">Set a budget</Link></Empty>
            )}
          </div>
          <div className="card">
            <div className="section"><h2 className="section-title">Recent activity</h2>
              <Link className="text-sm font-semibold no-underline" href="/transactions">See all</Link></div>
            {items.length ? (
              <Feed items={items} showWho={b.multiMember} names={b.users.length > 1 ? b.nameOfUser : undefined} />
            ) : <Empty>Nothing recorded yet. Tap Add an entry to record your first one.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}
