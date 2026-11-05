import { Empty, Kpi, PageHead, Pill, REVIEW_TABS, Section, Tabs } from "@/components/ui";
import { MonthSelect } from "@/components/MonthSelect";
import { dayMonth, monthName, monthOf, monthShort, today } from "@/lib/dates";
import { readBook } from "@/lib/load";
import { money } from "@/lib/money";
import { monthReview } from "@/lib/review";
import { changeText } from "@/lib/words";

export const metadata = { title: "Month in review" };

const MONTHS = 6;

export default async function Review({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const now = today();
  const cur = monthOf(now);
  // last month by default: it's the one that's finished
  const firstLook = await readBook({ since: `${cur}-01` });
  const choices = firstLook.months(now);
  const fallback = choices.find((m) => m < cur) ?? cur;
  const period = sp.month && choices.includes(sp.month) ? sp.month : fallback;
  const r = monthReview(await readBook({ since: monthStart(period, MONTHS) }), period, MONTHS);

  const last = MONTHS - 1;
  const net = r.income[last] - r.expenses[last];
  const expPill = changeText(r.expenses[last], r.expenses[last - 1], false, monthShort(r.months[last - 1]));
  const top = Math.max(1, ...r.groups.flatMap((g) => g.months));
  const partial = period === cur;

  return (
    <>
      <PageHead title="Month in review" sub="Where the money went, next to the months before" />
      <Tabs current="/budgets/review" tabs={REVIEW_TABS} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{monthName(period)}{partial ? " so far" : ""}</div>
        <div className="w-48"><MonthSelect months={choices} value={period} /></div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Spent" value={money(r.expenses[last])} tone="out" foot={<Pill tone={expPill.tone}>{expPill.text}</Pill>} />
        <Kpi label="Came in" value={money(r.income[last])} tone="in" />
        <Kpi label={net >= 0 ? "Left over" : "Spent more than came in"} value={money(Math.abs(net))} tone={net >= 0 ? "in" : "out"} />
        <Kpi label="Into goals" value={money(r.toGoals - r.fromGoals)}
          foot={r.fromGoals ? `${money(r.toGoals)} in, ${money(r.fromGoals)} taken out` : r.toGoals ? "Saved this month" : "Nothing moved"} />
      </div>

      <div className="grid32">
        <div className="card">
          <Section title="By group" aside={`${monthShort(r.months[0])} to ${monthShort(period)}`} />
          {r.groups.length ? (
            <div className="grid gap-4">
              {r.groups.map((g) => {
                const d = changeText(g.now, g.avg, false, `${MONTHS - 1}-month average`);
                return (
                  <div key={g.group}>
                    <div className="prog-head">
                      <span className="prog-name">{g.group}</span>
                      <span className="num text-sm font-semibold">{money(g.now)}</span>
                    </div>
                    {/* one small bar per month, this month last and darkest */}
                    <div className="flex h-10 items-end gap-1" role="img"
                      aria-label={`${g.group}: ${g.months.map((v, i) => `${monthShort(r.months[i])} ${money(v)}`).join(", ")}`}>
                      {g.months.map((v, i) => (
                        <div key={i} title={`${monthShort(r.months[i])}: ${money(v)}`}
                          className={`flex-1 rounded-t ${i === last ? "bg-brand" : "bg-brand/25"}`}
                          style={{ height: `${Math.max((v / top) * 100, v > 0 ? 4 : 1)}%` }} />
                      ))}
                    </div>
                    <div className="prog-foot">
                      <span className={d.tone === "out" ? "over" : undefined}>{d.text}</span>
                      <span className="num">avg {money(g.avg)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty>No expenses in these months.</Empty>}
        </div>

        <div className="grid content-start gap-4">
          <div className="card">
            <Section title="Went up" aside={`vs ${monthShort(r.months[last - 1])}`} />
            <Changes rows={r.ups} empty="Nothing cost more than the month before." />
          </div>
          <div className="card">
            <Section title="Went down" aside={`vs ${monthShort(r.months[last - 1])}`} />
            <Changes rows={r.downs} empty="Nothing cost less than the month before." />
          </div>
          <div className="card">
            <Section title="Biggest expenses" />
            {r.biggest.length ? (
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0">
                {r.biggest.map((t, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words"><span className="font-semibold">{t.note || t.category}</span>
                      <span className="text-muted"> · {t.category} · {dayMonth(t.date)}</span></span>
                    <span className="num flex-none font-semibold">{money(t.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No expenses this month.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}

function Changes({ rows, empty }: { rows: { category: string; now: number; prev: number; diff: number }[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0">
      {rows.map((c) => (
        <li key={c.category} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 break-words"><span className="font-semibold">{c.category}</span>
            <span className="text-muted"> · {money(c.prev)} → {money(c.now)}</span></span>
          <span className={`num flex-none font-semibold ${c.diff > 0 ? "text-out" : "text-in"}`}>{money(c.diff, true)}</span>
        </li>
      ))}
    </ul>
  );
}

function monthStart(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - n, 1));
  return d.toISOString().slice(0, 10);
}
