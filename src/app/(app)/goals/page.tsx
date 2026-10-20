import { Empty, PageHead, Pill, Progress, Section, Tabs } from "@/components/ui";
import type { GoalRow } from "@/lib/book";
import { daysBetween, longDate, shortDate, today } from "@/lib/dates";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { GoalForms } from "./GoalForms";

export const metadata = { title: "Savings goals" };

function GoalLine({ g, now }: { g: GoalRow; now: string }) {
  const pct = g.target > 0 ? (g.saved / g.target) * 100 : 0;
  const left = Math.max(g.target - g.saved, 0);
  const right = <span className="num">{money(g.saved)} of {money(g.target)}</span>;
  if (g.saved >= g.target) return <Progress name={g.name} pct={100} tone="ok" pill={<Pill tone="in">Reached</Pill>} footLeft="Goal reached" footRight={right} />;
  if (g.deadline && g.deadline < now) {
    return <Progress name={g.name} pct={pct} tone="over" pill={<Pill tone="out">Past date</Pill>} footLeft={`${money(left)} still to go`} footRight={right} footOver />;
  }
  if (g.deadline) {
    const [y1, m1] = now.split("-").map(Number);
    const [y2, m2] = g.deadline.split("-").map(Number);
    const months = Math.max((y2 - y1) * 12 + (m2 - m1), 1);
    return <Progress name={g.name} pct={pct} tone="ok" pill={<Pill tone="accent">Due {longDate(g.deadline)}</Pill>}
      footLeft={`About ${money(left / months)} a month`} footRight={right} />;
  }
  return <Progress name={g.name} pct={pct} tone="ok" pill={<Pill>{pct.toFixed(0)}%</Pill>} footLeft={`${money(left)} to go`} footRight={right} />;
}

export default async function Goals() {
  const b = await loadBook();
  const now = today();
  return (
    <>
      <PageHead title="Plan" />
      <Tabs current="/goals" tabs={[{ href: "/budgets", label: "Budgets" }, { href: "/goals", label: "Goals" }]} />
      <p className="page-sub" style={{ margin: "-.4rem 0 1rem" }}>Save together for school fees, rent, a car or anything else</p>
      <div className="grid32">
        <div className="stack">
          <div className="card">
            <Section title="Progress" />
            {b.goals.length ? <div className="prog-list">{b.goals.map((g) => <GoalLine key={g.id} g={g} now={now} />)}</div>
              : <Empty>No goals yet. Create your first one on this page.</Empty>}
          </div>
          {b.contributions.length ? (
            <div className="card">
              <Section title="Recent savings" />
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Date</th><th>Goal</th><th className="r">Amount</th><th>Note</th></tr></thead>
                <tbody>{b.contributions.slice(0, 30).map((c) => (
                  <tr key={c.id}><td>{shortDate(c.date)}{daysBetween(c.date, now) > 300 ? ` ${c.date.slice(0, 4)}` : ""}</td>
                    <td>{c.goal}</td><td className="r num">{money(c.amount)}</td><td>{c.note}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          ) : null}
        </div>
        <GoalForms today={now} goals={b.goals.map((g) => ({ id: g.id, name: g.name, left: Math.max(g.target - g.saved, 0) }))}
          contributions={b.contributions.map((c) => ({ id: c.id, label: `${longDate(c.date)}, ${c.goal}, ${money(c.amount)}` }))} />
      </div>
    </>
  );
}
